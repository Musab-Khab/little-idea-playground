/**
 * Data migration from the previous software: masters (customers, suppliers, books) and opening balances.
 * Every row is validated first; nothing is written unless all rows are valid (all-or-nothing).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { writeAudit } from "../audit";
import { assertPerm, requireUser } from "../security/session";
import { createDocument } from "../posting/engine";
import { safe } from "./_safe";
import { CUSTOMER_CATEGORIES, PRODUCT_CATEGORIES, SUPPLIER_CATEGORIES } from "@/shared/masters";
import type { Permission } from "@/shared/permissions";

const cell = z.union([z.string(), z.number(), z.null()]).optional();
const rowsSchema = z.array(z.record(z.string(), cell)).min(1).max(5000);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => {
  const s = str(v).replace(/,/g, "");
  return s === "" ? 0 : Number(s);
};

type RowError = { row: number; message: string };

const pickCategory = (value: string, allowed: readonly string[], fallback: string) =>
  allowed.find((c) => c.toLowerCase() === value.toLowerCase()) ?? (value ? null : fallback);

export const importMasters = createServerFn({ method: "POST" })
  .validator(
    z.object({
      entity: z.enum(["customers", "suppliers", "products"]),
      rows: rowsSchema,
      dryRun: z.boolean(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      const perm: Record<string, Permission> = {
        customers: "customers.manage",
        suppliers: "suppliers.manage",
        products: "books.manage",
      };
      assertPerm(user, perm[data.entity]!);
      const db = getDb();
      const table =
        data.entity === "customers"
          ? t.customers
          : data.entity === "suppliers"
            ? t.suppliers
            : t.products;
      const existing = new Set(
        (await db.select({ code: table.code }).from(table)).map((r) => r.code.toLowerCase()),
      );
      const seen = new Set<string>();
      const errors: RowError[] = [];
      const values: Record<string, unknown>[] = [];

      data.rows.forEach((r, i) => {
        const row = i + 2; // header is row 1 in the spreadsheet
        const code = str(r["code"]);
        const name = str(r["name"]);
        if (!code) return errors.push({ row, message: "Code is required" });
        if (!name) return errors.push({ row, message: "Name is required" });
        if (existing.has(code.toLowerCase()))
          return errors.push({ row, message: `Code ${code} already exists` });
        if (seen.has(code.toLowerCase()))
          return errors.push({ row, message: `Code ${code} appears twice in the file` });
        seen.add(code.toLowerCase());
        if (data.entity === "products") {
          const category = pickCategory(str(r["category"]), PRODUCT_CATEGORIES, "Textbook");
          if (!category)
            return errors.push({ row, message: `Unknown category "${str(r["category"])}"` });
          const costPrice = num(r["costPrice"]),
            salePrice = num(r["salePrice"]),
            minStock = num(r["minStock"]);
          if ([costPrice, salePrice, minStock].some((x) => !Number.isFinite(x) || x < 0))
            return errors.push({
              row,
              message: "Prices and minimum stock must be positive numbers",
            });
          values.push({
            code,
            name,
            category,
            subject: str(r["subject"]),
            className: str(r["className"]),
            series: str(r["series"]),
            edition: str(r["edition"]),
            costPrice,
            salePrice,
            minStock: Math.trunc(minStock),
            createdBy: user.id,
          });
        } else {
          const cats = data.entity === "customers" ? CUSTOMER_CATEGORIES : SUPPLIER_CATEGORIES;
          const category = pickCategory(str(r["category"]), cats, "Other");
          if (!category)
            return errors.push({
              row,
              message: `Unknown category "${str(r["category"])}". Use one of: ${cats.join(", ")}`,
            });
          const creditDays = num(r["creditDays"]);
          if (!Number.isInteger(creditDays) || creditDays < 0)
            return errors.push({ row, message: "Credit days must be a whole number" });
          const email = str(r["email"]);
          if (email && !/^\S+@\S+\.\S+$/.test(email))
            return errors.push({ row, message: `Invalid email ${email}` });
          values.push({
            code,
            name,
            category,
            contactPerson: str(r["contactPerson"]),
            phone: str(r["phone"]),
            email,
            address: str(r["address"]),
            city: str(r["city"]),
            ntn: str(r["ntn"]),
            creditDays,
            ...(data.entity === "customers"
              ? { creditLimit: Math.max(0, num(r["creditLimit"])) }
              : {}),
            createdBy: user.id,
          });
        }
        return undefined;
      });

      if (errors.length || data.dryRun)
        return {
          ok: errors.length === 0,
          imported: 0,
          valid: values.length,
          errors: errors.slice(0, 200),
        };
      await db.transaction(async (tx) => {
        for (let i = 0; i < values.length; i += 500)
          await tx.insert(table).values(values.slice(i, i + 500) as never);
        await writeAudit(tx, user, {
          action: "Imported",
          entity: data.entity,
          details: { rows: values.length },
        });
      });
      return { ok: true, imported: values.length, valid: values.length, errors: [] as RowError[] };
    }),
  );

/**
 * Opening balances sheet → one draft Opening Balances document (approve it to post).
 * Columns: kind (stock | customer | supplier | account), code, qty, rate, debit, credit.
 */
export const importOpeningBalances = createServerFn({ method: "POST" })
  .validator(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      rows: rowsSchema,
      dryRun: z.boolean(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "accounts.manage");
      const db = getDb();
      const codes = (kind: string) =>
        data.rows.filter((r) => str(r["kind"]).toLowerCase() === kind).map((r) => str(r["code"]));
      const lookup = async (
        table: typeof t.customers | typeof t.suppliers | typeof t.products | typeof t.accounts,
        list: string[],
      ) =>
        list.length
          ? new Map(
              (
                await db
                  .select({ id: table.id, code: table.code })
                  .from(table)
                  .where(
                    inArray(
                      sql`lower(${table.code})`,
                      list.map((c) => c.toLowerCase()),
                    ),
                  )
              ).map((r) => [r.code.toLowerCase(), r.id]),
            )
          : new Map<string, string>();
      const [prod, cust, supp, acc] = await Promise.all([
        lookup(t.products, codes("stock")),
        lookup(t.customers, codes("customer")),
        lookup(t.suppliers, codes("supplier")),
        lookup(t.accounts, codes("account")),
      ]);
      const errors: RowError[] = [];
      const lines: Record<string, unknown>[] = [];
      data.rows.forEach((r, i) => {
        const row = i + 2;
        const kind = str(r["kind"]).toLowerCase();
        const code = str(r["code"]).toLowerCase();
        const debit = num(r["debit"]),
          credit = num(r["credit"]);
        if (kind === "stock") {
          const id = prod.get(code);
          const qty = num(r["qty"]),
            rate = num(r["rate"]);
          if (!id) return errors.push({ row, message: `Book code ${str(r["code"])} not found` });
          if (!Number.isInteger(qty) || qty <= 0 || !(rate >= 0))
            return errors.push({ row, message: "Stock needs a positive whole qty and a rate" });
          lines.push({ productId: id, qty, rate });
        } else if (kind === "customer" || kind === "supplier" || kind === "account") {
          const id = (kind === "customer" ? cust : kind === "supplier" ? supp : acc).get(code);
          if (!id) return errors.push({ row, message: `${kind} code ${str(r["code"])} not found` });
          if (!(debit >= 0 && credit >= 0) || debit > 0 === credit > 0)
            return errors.push({ row, message: "Enter either a debit or a credit" });
          lines.push(
            kind === "account"
              ? { accountId: id, debit, credit }
              : { partyType: kind, partyId: id, debit, credit },
          );
        } else
          errors.push({
            row,
            message: `Kind must be stock, customer, supplier or account (got "${str(r["kind"])}")`,
          });
        return undefined;
      });
      if (errors.length || data.dryRun)
        return {
          ok: errors.length === 0,
          valid: lines.length,
          errors: errors.slice(0, 200),
          docNo: null as string | null,
        };
      const res = await createDocument(user, {
        type: "OB",
        date: data.date,
        narration: "Opening balances imported from previous software",
        lines: lines as never,
      });
      return { ok: true, valid: lines.length, errors: [] as RowError[], docNo: res.docNo };
    }),
  );
