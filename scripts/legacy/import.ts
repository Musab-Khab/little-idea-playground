/**
 * One-time migration of the previous accounts software (MariaDB dump) into MFAHH, with full history.
 *
 *   npx tsx scripts/legacy/import.ts <dump.sql> [--report-dir ./legacy-import-report]
 *
 * Needs a freshly initialised database (base data, no documents). Every transaction is replayed in
 * date order through the posting engine (prepareDocument → post), so ledgers, stock and balances are
 * produced by the same rules as day-to-day use. Legacy ids are kept in documents.extra.legacy.
 *
 * Mapping decisions (see the report for the figures):
 *  - Customer balances come from the transaction history; the old stored "current balance" is not
 *    reliable and is only compared in the report.
 *  - Each sale's receivable is the old system's own sale transaction; any difference from the line
 *    totals becomes the invoice discount or, if the invoice was higher, a journal for the difference.
 *  - Old purchases carry no prices: they are stock receipts from one placeholder supplier at Rs 0.
 *  - Stock was counted around 25 Aug 2026 in the old system: a stock-count adjustment on 24 Aug 2026
 *    sets each book to that count, and a final adjustment matches the old system's current stock.
 *  - Reverted receipts are imported and then cancelled, so they stay visible but have no effect.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb, type Tx } from "../../src/server/db/client";
import * as t from "../../src/server/db/schema";
import { prepareDocument, type DocInput } from "../../src/server/posting/prepare";
import { post, reverse } from "../../src/server/posting/rules";
import { fyForDate, nextDocNo, PostingContext } from "../../src/server/posting/context";
import { writeAudit } from "../../src/server/audit";
import { hashPassword } from "../../src/server/security/crypto";
import type { SessionUser } from "../../src/server/security/session";
import { PERMISSIONS, type Permission } from "../../src/shared/permissions";
import { DOC_DEFS, round2 } from "../../src/shared/documents";
import type { CategoryKind } from "../../src/shared/masters";
import { readDump, type Row } from "./dump";

if (existsSync(".env")) process.loadEnvFile(".env");

const dumpPath = process.argv[2];
if (!dumpPath || !existsSync(dumpPath)) {
  console.error("Usage: npx tsx scripts/legacy/import.ts <dump.sql> [--report-dir dir]");
  process.exit(1);
}
const reportDir = (() => {
  const i = process.argv.indexOf("--report-dir");
  return i > 0 ? process.argv[i + 1]! : "./legacy-import-report";
})();

const OB_DATE = "2017-01-01";
const STOCK_COUNT_DATE = "2026-08-24";
const CUTOVER_DATE = "2026-11-15";

/* ----------------------------------------------------------------- helpers */

const s = (v: unknown) =>
  v === null || v === undefined
    ? ""
    : String(v)
        .replace(/\\+[rn]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const validDate = (v: unknown) => {
  const d = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= "2000-01-01" ? d : null;
};
/** Legacy date, or the date the row was entered when the date is missing/1970. */
const dateOf = (date: unknown, created: unknown) =>
  validDate(date) ?? validDate(String(created ?? "").slice(0, 10)) ?? OB_DATE;
const pad = (x: number, w = 4) => String(x).padStart(w, "0");

const CHEQUE_OR_BANK =
  /ch(e)?q|cheque|check|online|bank|transfer|ibft|deposit|meezan|hbl|ubl|mcb|alfalah|al-falah|easy ?paisa|jazz ?cash|\bpo\b|pay order/i;

function customerType(name: string) {
  if (
    /school|academy|grammar|college|foundation|educat|institute|montessori|campus|madrasa|jamia|jama/i.test(
      name,
    )
  )
    return "School";
  if (/book|depo|stall|shop|store|publisher|stationer|traders|centre|center|mart/i.test(name))
    return "Bookshop";
  return "Other";
}

/** Old customer discount fields → the product category (old product "type") each one applies to. */
const DISCOUNT_FIELDS: [string, string][] = [
  ["book_discount_percent", "Book"],
  ["new_book_discount_percent", "New Book"],
  ["copy_discount_percent", "Copy"],
  ["exercise_copies_discount_percent", "Exercise Copies"],
  ["new_journal_discount_percent", "New Journal"],
  ["innovative_science_journal_discount_percent", "Innovative Science Journal"],
  ["write_and_wipe_discount_percent", "Write and Wipe"],
  ["report_card_discount_percent", "Report Card"],
  ["companion_discount_percent", "Companion"],
];

/** Old expense head → chart-of-accounts code. */
function expenseAccountCode(head: string) {
  const h = head.toLowerCase();
  if (/salary/.test(h)) return "6100";
  if (/rent/.test(h)) return "6110";
  if (/utilit|gas|tanki|water|electric/.test(h)) return "6120";
  if (/fuel|fare|bykea|courier|gpo|builty|tcs|transport/.test(h)) return "6130";
  if (/stationar|printer|thread/.test(h)) return "6140";
  if (/bank|easy ?paisa|jazz/.test(h)) return "6160";
  if (/maintenance|repair/.test(h)) return "6170";
  if (/office suppl|furniture|equipment/.test(h)) return "6180";
  return "6190";
}

/* ------------------------------------------------------------------- setup */

const db = getDb();
const T = readDump(dumpPath);
const rows = (name: string): Row[] => T.get(name) ?? [];
const accounts = rows("accounts");
const products = rows("products");
const sp = rows("sale_purchase");
const spd = rows("sale_purchase_detail");
const tr = rows("transactions");
const expenses = rows("expenses");
const heads = rows("expense_heads");
const staffRows = rows("staff");

const report: Record<string, unknown> = {};
const warnings: string[] = [];

async function preflight() {
  const docs =
    (await db.execute<{ docs: number }>(sql`select count(*)::int docs from documents`))[0]?.docs ??
    0;
  if (docs > 0) {
    console.error(
      `Refusing: the database already has ${docs} document(s). Import only into a fresh database (db-reset, db:migrate, app:init).`,
    );
    process.exit(1);
  }
  const [cash] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "CASH"));
  if (!cash) {
    console.error("Base data missing. Run `npm run app:init` first.");
    process.exit(1);
  }
}

async function importUser(): Promise<SessionUser> {
  const email = "legacy-import@turnkey.local";
  let [u] = await db.select().from(t.users).where(eq(t.users.email, email));
  if (!u) {
    [u] = await db
      .insert(t.users)
      .values({
        email,
        name: "Old system import",
        roleId: "admin",
        status: "Inactive",
        passwordHash: await hashPassword(randomBytes(32).toString("base64")),
      })
      .returning();
  }
  return {
    id: u!.id,
    name: u!.name,
    email,
    roleId: "admin",
    totpEnabled: false,
    mustChangePassword: false,
    permissions: new Set(Object.keys(PERMISSIONS) as Permission[]),
    mfaRequired: false,
    sessionId: "legacy-import",
    mfaVerified: true,
  };
}

async function financialYears() {
  for (let y = 2016; y <= 2026; y++) {
    await db
      .insert(t.financialYears)
      .values({
        label: `${y}-${String(y + 1).slice(2)}`,
        startDate: `${y}-07-01`,
        endDate: `${y + 1}-06-30`,
      })
      .onConflictDoNothing();
  }
}

async function ensureCategory(kind: CategoryKind, name: string) {
  await db.insert(t.categories).values({ kind, name }).onConflictDoNothing();
}

/* ----------------------------------------------------------------- masters */

const customerId = new Map<number, string>();
let walkInId = "";
let supplierId = "";
const productId = new Map<number, string>();
const headId = new Map<number, string>();
let bankId = "";

async function masters(user: SessionUser) {
  // Categories used by old product types.
  const types = [...new Set(products.map((p) => s(p["type"]) || "Other"))];
  for (const ty of types) await ensureCategory("productCategory", ty);

  // Customers.
  const custValues = accounts
    .filter((a) => a["acc_type"] === "customer")
    .map((a) => {
      const id = n(a["acc_id"]);
      const name = s(a["acc_name"]) || `Unnamed customer (old #${id})`;
      // Percentages outside 0–100 are typing mistakes in the old data (e.g. 2520): use 0 and report.
      const pct = (f: string) => {
        const v = n(a[f]);
        if (v >= 0 && v <= 100) return v;
        warnings.push(
          `customer #${id} ${name}: ${f} = ${v} is not a valid percentage; imported as 0`,
        );
        return 0;
      };
      const def = pct("discount_percent");
      const categoryDiscounts = DISCOUNT_FIELDS.filter(
        ([f]) => a[f] !== null && a[f] !== undefined && pct(f) !== def,
      ).map(([f, category]) => ({ category, type: "Percentage" as const, value: pct(f) }));
      return {
        legacyId: id,
        values: {
          code: `C${pad(id)}`,
          name,
          category: customerType(name),
          phone: s(a["phone_no"]).slice(0, 200),
          address: s(a["address"]),
          location:
            /khi|karachi/i.test(s(a["address"])) || !s(a["address"]) ? "Karachi" : "Out of Karachi",
          discountType: "Percentage" as const,
          discountValue: def,
          categoryDiscounts,
          notes: `Imported from old system (account #${id}).`,
          createdBy: user.id,
        },
      };
    });
  custValues.push({
    legacyId: 0,
    values: {
      code: "C0000",
      name: "Walk-in / unassigned (old system)",
      category: "Other",
      phone: "",
      address: "",
      location: "Karachi",
      discountType: "Percentage",
      discountValue: 0,
      categoryDiscounts: [],
      notes: "Old-system sales that had no customer selected (account #0).",
      createdBy: user.id,
    },
  });
  for (const c of custValues) {
    const [row] = await db.insert(t.customers).values(c.values).returning({ id: t.customers.id });
    customerId.set(c.legacyId, row!.id);
  }
  walkInId = customerId.get(0)!;

  const [supp] = await db
    .insert(t.suppliers)
    .values({
      code: "S0002",
      name: "Stock receipts (old system)",
      category: "Printer",
      notes:
        "Placeholder: the old system recorded all purchases against one unnamed vendor, without prices.",
      createdBy: user.id,
    })
    .returning({ id: t.suppliers.id });
  supplierId = supp!.id;

  // Products: keep the old code where it is unique, otherwise suffix the old id.
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const p of products) {
    const c = s(p["prod_code"]).toUpperCase();
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const p of products) {
    const id = n(p["prod_id"]);
    let code = s(p["prod_code"]).toUpperCase();
    if (!code || (counts.get(code) ?? 0) > 1 || seen.has(code)) code = `${code || "P"}-${id}`;
    seen.add(code);
    const [row] = await db
      .insert(t.products)
      .values({
        code,
        name: s(p["prod_name"]) || `Book (old #${id})`,
        category: s(p["type"]) || "Other",
        salePrice: n(p["default_sale_price"]),
        costPrice: 0, // set after the import; old purchases had no cost
        createdBy: user.id,
      })
      .returning({ id: t.products.id });
    productId.set(id, row!.id);
  }
  // Books referenced by old invoices but deleted from the old products table.
  const missing = [...new Set(spd.map((d) => n(d["prod_id"])))].filter((id) => !productId.has(id));
  for (const id of missing) {
    const [row] = await db
      .insert(t.products)
      .values({
        code: `OLD-${id}`,
        name: `Deleted book (old #${id})`,
        category: "Other",
        createdBy: user.id,
      })
      .returning({ id: t.products.id });
    productId.set(id, row!.id);
  }
  if (missing.length) await ensureCategory("productCategory", "Other");
  report["missingProducts"] = missing;

  // Expense heads (reuse an existing head with the same name).
  const accByCode = new Map(
    (await db.select({ id: t.accounts.id, code: t.accounts.code }).from(t.accounts)).map((a) => [
      a.code,
      a.id,
    ]),
  );
  const existingHeads = new Map(
    (await db.select().from(t.expenseHeads)).map((h) => [h.name.toLowerCase(), h.id]),
  );
  for (const h of heads) {
    const id = n(h["exp_head_id"]);
    const name = s(h["expense_head"]) || `Expense head ${id} (unnamed in old system)`;
    let hid = existingHeads.get(name.toLowerCase());
    if (!hid) {
      const [row] = await db
        .insert(t.expenseHeads)
        .values({ name, accountId: accByCode.get(expenseAccountCode(name))!, createdBy: user.id })
        .returning({ id: t.expenseHeads.id });
      hid = row!.id;
      existingHeads.set(name.toLowerCase(), hid);
    }
    headId.set(id, hid);
  }

  // One bank account for receipts/expenses the old system marked as cheque/bank.
  const [group] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "BANK_GROUP"));
  const [last] = await db.execute<{ code: string | null }>(
    sql`select max(code) code from accounts where parent_id = ${group!.id}`,
  );
  const [glBank] = await db
    .insert(t.accounts)
    .values({
      code: String(Number(last?.code ?? group!.code) + 1),
      name: "Bank (old system, unspecified) – LEGACY",
      type: "Asset",
      parentId: group!.id,
      createdBy: user.id,
    })
    .returning({ id: t.accounts.id });
  const [bank] = await db
    .insert(t.bankAccounts)
    .values({
      name: "Bank (old system, unspecified)",
      accountNo: "LEGACY",
      accountId: glBank!.id,
      createdBy: user.id,
    })
    .returning({ id: t.bankAccounts.id });
  bankId = bank!.id;

  // Staff.
  for (const st of staffRows) {
    const name = s(st["full_name"]);
    if (!name) continue;
    const join = validDate(st["joining_date"]);
    await db.insert(t.staff).values({
      empId: `E${pad(n(st["id"]), 3)}`,
      name,
      designation: s(st["designation"]),
      cnic: s(st["cnic"]),
      joiningDate: join,
      employmentStatus: n(st["is_deleted"]) ? "Inactive" : "Active",
      basic: n(st["salary"]),
      createdBy: user.id,
    });
  }

  report["masters"] = {
    customers: custValues.length,
    products: products.length + missing.length,
    expenseHeads: heads.length,
    staff: staffRows.filter((x) => s(x["full_name"])).length,
  };
}

/* ------------------------------------------------------- document posting */

type Legacy = { table: string; id: number };

async function insertDoc(tx: Tx, user: SessionUser, input: DocInput, legacy: Legacy) {
  const def = DOC_DEFS[input.type];
  const prepared = await prepareDocument(tx, { ...input, extra: { ...input.extra } });
  const fy = await fyForDate(tx, input.date);
  const docNo = await nextDocNo(tx, def.prefix, fy);
  const [doc] = await tx
    .insert(t.documents)
    .values({
      ...prepared.header,
      extra: { ...prepared.header.extra, legacy: `${legacy.table}#${legacy.id}` },
      docNo,
      status: "Draft",
      createdBy: user.id,
    })
    .returning();
  if (prepared.lines.length)
    await tx
      .insert(t.documentLines)
      .values(prepared.lines.map((l) => ({ ...l, documentId: doc!.id })));
  if (prepared.allocations.length)
    await tx
      .insert(t.allocations)
      .values(prepared.allocations.map((a) => ({ ...a, paymentId: doc!.id })));
  const lines = await tx
    .select()
    .from(t.documentLines)
    .where(eq(t.documentLines.documentId, doc!.id))
    .orderBy(t.documentLines.lineNo);
  await post(new PostingContext(tx, user), doc!, lines);
  await tx
    .update(t.documents)
    .set({ status: "Approved", approvedBy: user.id, approvedAt: new Date() })
    .where(eq(t.documents.id, doc!.id));
  await writeAudit(
    tx,
    { id: user.id, name: user.name },
    {
      action: "Imported",
      entity: def.label,
      entityId: doc!.id,
      ref: docNo,
      details: { legacy: `${legacy.table}#${legacy.id}`, total: prepared.header.total },
    },
  );
  return { id: doc!.id, docNo, total: prepared.header.total ?? 0 };
}

async function create(user: SessionUser, input: DocInput, legacy: Legacy) {
  try {
    return await db.transaction((tx) => insertDoc(tx, user, input, legacy));
  } catch (e) {
    throw new Error(
      `${legacy.table}#${legacy.id} (${input.type} ${input.date}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function cancel(user: SessionUser, id: string, reason: string) {
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(t.documents).where(eq(t.documents.id, id)).for("update");
    const lines = await tx.select().from(t.documentLines).where(eq(t.documentLines.documentId, id));
    await reverse(new PostingContext(tx, user), doc!, lines);
    await tx
      .update(t.documents)
      .set({
        status: "Cancelled",
        cancelledBy: user.id,
        cancelledAt: new Date(),
        cancelReason: reason,
      })
      .where(eq(t.documents.id, id));
    await writeAudit(
      tx,
      { id: user.id, name: user.name },
      {
        action: "Cancelled & reversed",
        entity: DOC_DEFS[doc!.type].label,
        entityId: id,
        ref: doc!.docNo,
        details: { reason },
      },
    );
  });
}

/* ------------------------------------------------------------ the events */

type Event = { date: string; order: number; seq: string; run: () => Promise<void> };

async function history(user: SessionUser) {
  const [arAcc] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "AR"));
  const [salesAcc] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "SALES"));
  const [cashAcc] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "CASH"));
  const ar = arAcc!.id,
    sales = salesAcc!.id,
    cash = cashAcc!.id;
  const [income] = await db.select().from(t.accounts).where(eq(t.accounts.code, "4000"));
  const [adj] = await db
    .insert(t.accounts)
    .values({
      code: "4900",
      name: "Old-system balance adjustments",
      type: "Income",
      parentId: income!.id,
      createdBy: user.id,
    })
    .returning({ id: t.accounts.id });
  const adjustAcc = adj!.id;
  const custOf = (legacy: number) => customerId.get(legacy) ?? walkInId;

  const stats = {
    SI: 0,
    PI: 0,
    RV: 0,
    EXP: 0,
    JV: 0,
    ADJ: 0,
    cancelled: 0,
    invoiceDiscounts: 0,
    invoiceTopUps: 0,
    skippedExpenses: 0,
    skippedPurchases: 0,
  };
  const events: Event[] = [];
  const at = (date: string, order: number, seq: string, run: () => Promise<void>) =>
    events.push({ date, order, seq, run });

  // Open invoices per customer, oldest first, for allocating receipts.
  const open = new Map<string, { id: string; open: number }[]>();

  // Opening balances of customers (as entered in the old system).
  const obLines = accounts
    .filter((a) => a["acc_type"] === "customer" && n(a["opening_balance"]) !== 0)
    .map((a) => {
      const amt = round2(Math.abs(n(a["opening_balance"])));
      const dr = (a["opening_balance_in"] === "dr") === n(a["opening_balance"]) > 0;
      return {
        partyType: "customer" as const,
        partyId: custOf(n(a["acc_id"])),
        debit: dr ? amt : 0,
        credit: dr ? 0 : amt,
        description: "Opening balance from old system",
      };
    });
  if (obLines.length)
    at(OB_DATE, 0, "0", async () => {
      await create(
        user,
        {
          type: "OB",
          date: OB_DATE,
          narration: "Customer opening balances from old system",
          lines: obLines,
        },
        { table: "accounts", id: 0 },
      );
    });

  // Sales and purchases.
  const linesBy = new Map<number, Row[]>();
  for (const d of spd) {
    const k = n(d["sale_purchase_id"]);
    (linesBy.get(k) ?? linesBy.set(k, []).get(k)!).push(d);
  }
  const saleTarget = new Map<number, number>();
  for (const r of tr)
    if (r["auto"] === "1" && r["description"] === "Sale Transaction")
      saleTarget.set(
        n(r["reference"]),
        round2((saleTarget.get(n(r["reference"])) ?? 0) + n(r["amount"])),
      );

  for (const h of sp) {
    const id = n(h["sale_purchase_id"]);
    const date = dateOf(h["date"], h["date_created"]);
    const seq = String(h["date_created"] ?? "");
    const ls = linesBy.get(id) ?? [];
    const pos = ls.filter((l) => n(l["quantity"]) > 0);
    const neg = ls.filter((l) => n(l["quantity"]) < 0);
    const ref = `Old #${id}`;

    if (h["type"] === "purchase") {
      at(date, 1, seq, async () => {
        if (pos.length) {
          await create(
            user,
            {
              type: "PI",
              date,
              kind: "Books",
              partyId: supplierId,
              reference: ref,
              narration: "Stock received (old system purchase, no prices)",
              lines: pos.map((l) => ({
                productId: productId.get(n(l["prod_id"]))!,
                qty: n(l["quantity"]),
                rate: n(l["price"]),
              })),
            },
            { table: "sale_purchase", id },
          );
          stats.PI++;
        }
        if (neg.length) {
          await create(
            user,
            {
              type: "ADJ",
              date,
              reference: ref,
              narration: "Stock out recorded on an old-system purchase",
              extra: { reason: "Negative quantity on old-system purchase" },
              lines: neg.map((l) => ({
                productId: productId.get(n(l["prod_id"]))!,
                qty: n(l["quantity"]),
              })),
            },
            { table: "sale_purchase", id },
          );
          stats.ADJ++;
        }
        if (!pos.length && !neg.length) stats.skippedPurchases++;
      });
      continue;
    }

    // Sale.
    const party = custOf(n(h["acc_id"]));
    const target = saleTarget.get(id) ?? 0;
    at(date, 2, seq, async () => {
      let invoiced = 0;
      if (pos.length) {
        const lines = pos.map((l) => ({
          productId: productId.get(n(l["prod_id"]))!,
          qty: n(l["quantity"]),
          rate: n(l["price"]),
          discountPct: Math.min(100, Math.max(0, n(l["discount"]))),
        }));
        const subtotal = round2(
          lines.reduce((a, l) => a + round2(l.qty * l.rate * (1 - l.discountPct / 100)), 0),
        );
        const discount = subtotal > target ? round2(subtotal - Math.max(0, target)) : 0;
        if (discount > 0) stats.invoiceDiscounts++;
        const due = validDate(h["due_date"]);
        const doc = await create(
          user,
          {
            type: "SI",
            date,
            partyId: party,
            reference: ref,
            dueDate: due && due >= date ? due : date,
            narration: discount > 0 ? "Invoice total adjusted to the old system's amount" : "",
            discount,
            lines,
          },
          { table: "sale_purchase", id },
        );
        invoiced = doc.total;
        if (doc.total > 0)
          (open.get(party) ?? open.set(party, []).get(party)!).push({
            id: doc.id,
            open: doc.total,
          });
        stats.SI++;
      }
      if (neg.length) {
        await create(
          user,
          {
            type: "ADJ",
            date,
            reference: ref,
            narration: "Books returned on an old-system sale",
            extra: { reason: "Negative quantity on old-system sale (return)" },
            lines: neg.map((l) => ({
              productId: productId.get(n(l["prod_id"]))!,
              qty: -n(l["quantity"]),
            })),
          },
          { table: "sale_purchase", id },
        );
        stats.ADJ++;
      }
      const diff = round2(target - invoiced);
      if (diff !== 0) {
        // The old sale transaction was higher than the book lines (lump-sum lines, shipping, edits).
        const amt = Math.abs(diff);
        await create(
          user,
          {
            type: "JV",
            date,
            reference: ref,
            narration: `Old sale #${id}: difference between the old system's sale amount and its book lines`,
            lines: [
              {
                accountId: ar,
                partyType: "customer",
                partyId: party,
                debit: diff > 0 ? amt : 0,
                credit: diff < 0 ? amt : 0,
              },
              { accountId: sales, debit: diff < 0 ? amt : 0, credit: diff > 0 ? amt : 0 },
            ],
          },
          { table: "sale_purchase", id },
        );
        stats.invoiceTopUps++;
        stats.JV++;
      }
    });
  }

  // Receipts and their reversals.
  const manual = tr.filter((r) => r["auto"] === "0");
  const reverts = manual.filter((r) => r["is_revert"] === "1");
  const originals = manual.filter((r) => r["is_revert"] !== "1");
  const pending = new Map<number, { row: Row; docId?: string; used: boolean }>();
  for (const r of originals)
    if (r["reverted"] === "1") pending.set(n(r["id"]), { row: r, used: false });
  const pairOf = new Map<number, number>(); // revert id → original id
  for (const rv of reverts) {
    const cust = n(rv["acc_dr"]);
    const desc = s(rv["description"]).replace(/^REVERTED \[(.*)\]$/, "$1");
    const cands = [...pending.values()].filter(
      (p) => !p.used && n(p.row["acc_cr"]) === cust && n(p.row["id"]) < n(rv["id"]),
    );
    const m =
      cands.find(
        (p) => n(p.row["amount"]) === n(rv["amount"]) && s(p.row["description"]) === desc,
      ) ?? cands.find((p) => n(p.row["amount"]) === n(rv["amount"]));
    if (m) {
      m.used = true;
      pairOf.set(n(rv["id"]), n(m.row["id"]));
    }
  }

  /**
   * A balance correction keyed in as a receipt/reversal with a negative amount: a journal that moves the
   * customer's balance by `increase` (positive = owes more) against `other`.
   */
  const adjustment = (
    row: Row,
    party: string,
    increase: number,
    other: string,
    narration: string,
  ) =>
    at(dateOf(row["date"], row["created"]), 3, String(row["created"] ?? ""), async () => {
      const amt = Math.abs(increase);
      await create(
        user,
        {
          type: "JV",
          date: dateOf(row["date"], row["created"]),
          reference: `Old #${n(row["id"])}`,
          narration: s(row["description"]) ? `${narration}: ${s(row["description"])}` : narration,
          lines: [
            {
              accountId: ar,
              partyType: "customer",
              partyId: party,
              debit: increase > 0 ? amt : 0,
              credit: increase < 0 ? amt : 0,
            },
            { accountId: other, debit: increase < 0 ? amt : 0, credit: increase > 0 ? amt : 0 },
          ],
        },
        { table: "transactions", id: n(row["id"]) },
      );
      stats.JV++;
    });
  const pairedOriginal = new Set(pairOf.values());

  for (const r of originals) {
    const id = n(r["id"]);
    const date = dateOf(r["date"], r["created"]);
    const amount = round2(n(r["amount"]));
    const isReceipt = n(r["acc_dr"]) === 1 && n(r["acc_cr"]) !== 1;
    if (!isReceipt) {
      warnings.push(`transaction #${id} skipped (not a customer receipt): ${JSON.stringify(r)}`);
      continue;
    }
    if (amount <= 0) {
      // Zero entries do nothing; reverted negative entries cancel out with their reversal.
      if (amount < 0 && !pairedOriginal.has(id))
        adjustment(r, custOf(n(r["acc_cr"])), -amount, adjustAcc, "Old-system balance adjustment");
      continue;
    }
    const party = custOf(n(r["acc_cr"]));
    const desc = s(r["description"]);
    const bank = CHEQUE_OR_BANK.test(desc);
    at(date, 3, String(r["created"] ?? ""), async () => {
      // Allocate oldest open invoices first (not for receipts that are later reverted).
      const allocations: { invoiceId: string; amount: number }[] = [];
      const p = pending.get(id);
      if (!p) {
        let left = amount;
        for (const inv of open.get(party) ?? []) {
          if (left <= 0) break;
          const a = round2(Math.min(left, inv.open));
          if (a > 0) {
            allocations.push({ invoiceId: inv.id, amount: a });
            inv.open = round2(inv.open - a);
            left = round2(left - a);
          }
        }
        open.set(
          party,
          (open.get(party) ?? []).filter((i) => i.open > 0),
        );
      }
      const doc = await create(
        user,
        {
          type: "RV",
          date,
          partyId: party,
          amount,
          method: bank ? "Bank" : "Cash",
          bankAccountId: bank ? bankId : null,
          reference: `Old #${id}`,
          narration: desc,
          allocations,
        },
        { table: "transactions", id },
      );
      if (p) p.docId = doc.id;
      stats.RV++;
    });
  }

  for (const rv of reverts) {
    const id = n(rv["id"]);
    const date = dateOf(rv["date"], rv["created"]);
    const amount = round2(n(rv["amount"]));
    const orig = pairOf.get(id);
    if (orig !== undefined && round2(n(pending.get(orig)!.row["amount"])) <= 0) continue; // pair nets to zero
    if (orig === undefined) {
      // Unpaired reversal: puts the amount back on the customer's account.
      if (amount !== 0) {
        adjustment(
          rv,
          custOf(n(rv["acc_dr"])),
          amount,
          amount > 0 ? cash : adjustAcc,
          "Reverted receipt (old system)",
        );
        warnings.push(`revert #${id} had no matching receipt; posted as a journal`);
      }
      continue;
    }
    const origDate = dateOf(pending.get(orig)!.row["date"], pending.get(orig)!.row["created"]);
    at(date < origDate ? origDate : date, 4, String(rv["created"] ?? ""), async () => {
      await cancel(
        user,
        pending.get(orig)!.docId!,
        `Reverted in old system (entry #${id}, ${date})`,
      );
      stats.cancelled++;
    });
  }

  // Expenses.
  for (const e of expenses) {
    const id = n(e["expense_id"]);
    const amount = round2(n(e["amount"]));
    if (n(e["is_deleted"]) || amount <= 0) {
      stats.skippedExpenses++;
      continue;
    }
    const date = dateOf(e["date"], e["date_created"]);
    const hid = headId.get(n(e["expense_head"]));
    if (!hid) {
      warnings.push(`expense #${id} has unknown head ${String(e["expense_head"])}; skipped`);
      stats.skippedExpenses++;
      continue;
    }
    const bank = s(e["payment_mode"]).toLowerCase() === "bank";
    const headName = s(
      heads.find((h) => n(h["exp_head_id"]) === n(e["expense_head"]))?.["expense_head"],
    );
    at(date, 5, String(e["date_created"] ?? ""), async () => {
      await create(
        user,
        {
          type: "EXP",
          date,
          amount,
          expenseHeadId: hid,
          method: bank ? "Bank" : "Cash",
          bankAccountId: bank ? bankId : null,
          chequeNo: s(e["cheque_no"]).slice(0, 50),
          reference: `Old #${id}`,
          narration: (s(e["desc"]) || headName || "Expense (old system)").slice(0, 1000),
          extra: {
            payee: s(e["payee"]).slice(0, 200),
            approvedBy: s(e["approved_by"]).slice(0, 200),
            paidBy: s(e["paid_by"]).slice(0, 200),
          },
        },
        { table: "expenses", id },
      );
      stats.EXP++;
    });
  }

  // Stock count (old opening stock was reset around 25 Aug 2026) and final match to old current stock.
  const stockTo = (
    date: string,
    field: "opening_stock" | "current_stock",
    reference: string,
    reason: string,
  ) =>
    at(date, 9, "z", async () => {
      const have = new Map(
        (await db.select({ id: t.products.id, q: t.products.stockQty }).from(t.products)).map(
          (p) => [p.id, p.q],
        ),
      );
      const lines = products
        .map((p) => {
          const pid = productId.get(n(p["prod_id"]))!;
          return { productId: pid, qty: n(p[field]) - (have.get(pid) ?? 0) };
        })
        .filter((l) => l.qty !== 0);
      for (let i = 0; i < lines.length; i += 400) {
        await create(
          user,
          {
            type: "ADJ",
            date,
            reference,
            narration: reason,
            extra: { reason },
            lines: lines.slice(i, i + 400),
          },
          { table: field, id: i / 400 },
        );
        stats.ADJ++;
      }
      report[`${field}Adjusted`] = lines.length;
    });
  stockTo(
    STOCK_COUNT_DATE,
    "opening_stock",
    "Stock count Aug 2026 (old system)",
    "Stock count: sets each book to the old system's opening stock as reset in Aug 2026",
  );
  stockTo(
    CUTOVER_DATE,
    "current_stock",
    "Cut-over to MFAHH",
    "Matches each book's stock to the old system's current stock at cut-over",
  );

  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.seq.localeCompare(b.seq),
  );
  const started = Date.now();
  for (const [i, e] of events.entries()) {
    await e.run();
    if (i % 1000 === 0 || i === events.length - 1) {
      const secs = Math.round((Date.now() - started) / 1000);
      console.log(`  ${i + 1}/${events.length} events (${e.date}), ${secs}s`);
    }
  }
  report["documents"] = stats;
}

/* ------------------------------------------------------------ finishing */

async function finish(user: SessionUser) {
  // Cost prices from the old system (masters only; nothing posted).
  for (const p of products) {
    const cost = n(p["default_purchase_price"]);
    const id = productId.get(n(p["prod_id"]))!;
    await db
      .update(t.products)
      .set({ costPrice: cost, status: n(p["is_deleted"]) ? "Inactive" : "Active" })
      .where(eq(t.products.id, id));
  }
  for (const id of (report["missingProducts"] as number[]) ?? [])
    await db
      .update(t.products)
      .set({ status: "Inactive" })
      .where(eq(t.products.id, productId.get(id)!));

  // Reconciliation: customer balances (MFAHH ledger vs old stored balance and old transactions).
  const bal = new Map(
    (
      await db.execute<{ party_id: string; bal: string }>(sql`
        select g.party_id, sum(g.debit - g.credit) bal from gl_entries g
        join accounts a on a.id = g.account_id
        where a.system_key = 'AR' and g.party_type = 'customer' group by g.party_id`)
    ).map((r) => [r.party_id, round2(Number(r.bal))]),
  );
  const txBal = new Map<number, number>();
  for (const r of tr) {
    txBal.set(n(r["acc_dr"]), (txBal.get(n(r["acc_dr"])) ?? 0) + n(r["amount"]));
    txBal.set(n(r["acc_cr"]), (txBal.get(n(r["acc_cr"])) ?? 0) - n(r["amount"]));
  }
  const csv = [
    "old_id,customer,mfahh_balance,old_history_balance,old_stored_balance,history_matches,stored_matches",
  ];
  let historyOk = 0,
    storedOk = 0,
    total = 0,
    receivable = 0;
  const custAccs = accounts.filter((a) => a["acc_type"] === "customer");
  for (const a of [
    ...custAccs,
    { acc_id: 0, acc_name: "Walk-in / unassigned", opening_balance: 0 } as Row,
  ]) {
    const id = n(a["acc_id"]);
    const mf = bal.get(customerId.get(id)!) ?? 0;
    const op = (a["opening_balance_in"] === "cr" ? -1 : 1) * n(a["opening_balance"]);
    const hist = round2(op + (txBal.get(id) ?? 0));
    const stored = round2((a["current_balance_in"] === "cr" ? -1 : 1) * n(a["current_balance"]));
    const h = Math.abs(mf - hist) < 0.01,
      st = Math.abs(mf - stored) < 0.01;
    total++;
    receivable += mf;
    if (h) historyOk++;
    if (st) storedOk++;
    csv.push(
      [id, JSON.stringify(s(a["acc_name"])), mf, hist, id === 0 ? "" : stored, h, st].join(","),
    );
  }
  // Stock.
  const stockRows = await db
    .select({ id: t.products.id, code: t.products.code, q: t.products.stockQty })
    .from(t.products);
  const qById = new Map(stockRows.map((r) => [r.id, r.q]));
  const stockMismatch = products.filter(
    (p) => qById.get(productId.get(n(p["prod_id"]))!) !== n(p["current_stock"]),
  );

  // Ledger-wide integrity.
  const [tb] = await db.execute<{ dr: string; cr: string }>(
    sql`select sum(debit) dr, sum(credit) cr from gl_entries`,
  );

  report["reconciliation"] = {
    customers: total,
    balanceMatchesOldTransactions: historyOk,
    balanceMatchesOldStoredBalance: storedOk,
    totalReceivable: round2(receivable),
    booksNotMatchingOldStock: stockMismatch.length,
    trialBalance: { debit: Number(tb?.dr), credit: Number(tb?.cr) },
  };
  await writeAudit(
    db,
    { id: user.id, name: user.name },
    {
      action: "Imported",
      entity: "Old system data",
      details: { source: dumpPath!.split(/[\\/]/).pop(), ...(report["documents"] as object) },
    },
  );

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "customer-balances.csv"), csv.join("\n"));
  writeFileSync(join(reportDir, "warnings.txt"), [...new Set(warnings)].join("\n"));
  writeFileSync(join(reportDir, "summary.json"), JSON.stringify(report, null, 2));
}

async function main() {
  await preflight();
  const user = await importUser();
  console.log("Financial years, masters...");
  await financialYears();
  await masters(user);
  console.log("Replaying history...");
  await history(user);
  console.log("Reconciling...");
  await finish(user);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportDir}`);
}

main()
  .catch((e) => {
    console.error("Import failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
