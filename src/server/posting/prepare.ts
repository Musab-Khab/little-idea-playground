/**
 * Validates and normalises user input for a document before it is stored as a draft.
 * Approval re-checks anything that can change in between (stock, outstanding amounts).
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import * as t from "../db/schema";
import { fail, fyForDate } from "./context";
import {
  addDays,
  DOC_DEFS,
  docTotals,
  lineAmount,
  round2,
  type DocType,
  type PartyType,
} from "@/shared/documents";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const money = z.number().finite().min(0).max(1e12);
const uuid = z.string().uuid();

export const lineInputSchema = z.object({
  productId: uuid.nullish(),
  accountId: uuid.nullish(),
  partyType: z.enum(["customer", "supplier", "staff"]).nullish(),
  partyId: uuid.nullish(),
  description: z.string().max(500).optional(),
  qty: z.number().int().min(-1e7).max(1e7).optional(),
  rate: money.optional(),
  discountPct: z.number().min(0).max(100).optional(),
  debit: money.optional(),
  credit: money.optional(),
  refLineId: uuid.nullish(),
  extra: z
    .record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export const docInputSchema = z.object({
  type: z.enum([
    "SO",
    "SI",
    "SR",
    "RV",
    "PI",
    "PR",
    "PV",
    "EXP",
    "JV",
    "SMP",
    "SMR",
    "ADJ",
    "DMG",
    "OB",
    "PAYROLL",
    "SALPAY",
    "LOAN",
  ]),
  date: isoDate,
  partyId: uuid.nullish(),
  dueDate: isoDate.nullish(),
  refDocId: uuid.nullish(),
  reference: z.string().max(200).optional(),
  method: z.enum(["Cash", "Bank", "Cheque"]).nullish(),
  bankAccountId: uuid.nullish(),
  chequeNo: z.string().max(50).optional(),
  expenseHeadId: uuid.nullish(),
  kind: z.enum(["Books", "Material", "Service"]).nullish(),
  narration: z.string().max(1000).optional(),
  discount: money.optional(),
  taxPct: z.number().min(0).max(100).optional(),
  amount: money.optional(),
  extra: z
    .record(z.string(), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]))
    .optional(),
  lines: z.array(lineInputSchema).max(500).optional(),
  allocations: z
    .array(z.object({ invoiceId: uuid, amount: money }))
    .max(200)
    .optional(),
});
export type DocInput = z.infer<typeof docInputSchema>;
export type LineInput = z.infer<typeof lineInputSchema>;

export type PreparedHeader = Omit<typeof t.documents.$inferInsert, "id" | "docNo" | "status">;
export type PreparedLine = Omit<typeof t.documentLines.$inferInsert, "id" | "documentId">;
export interface Prepared {
  header: PreparedHeader;
  lines: PreparedLine[];
  allocations: { invoiceId: string; amount: number }[];
  warnings: string[];
}

type DocRow = typeof t.documents.$inferSelect;
type LineRow = typeof t.documentLines.$inferSelect;

async function activeParty(tx: Tx, type: PartyType, id: string | null | undefined) {
  if (!id) return fail(`Choose a ${type}.`);
  const table = type === "customer" ? t.customers : type === "supplier" ? t.suppliers : t.staff;
  const [row] = await tx.select().from(table).where(eq(table.id, id));
  if (!row) return fail(`The selected ${type} does not exist.`);
  const status =
    "employmentStatus" in row
      ? row.employmentStatus === "Active"
        ? "Active"
        : "Inactive"
      : row.status;
  if (status !== "Active") fail(`${row.name} is inactive.`);
  return row;
}

async function activeProducts(tx: Tx, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const rows = wanted.length
    ? await tx.select().from(t.products).where(inArray(t.products.id, wanted))
    : [];
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of wanted) {
    const p = map.get(id);
    if (!p) fail("A selected book/product does not exist.");
    else if (p.status !== "Active") fail(`${p.name} is inactive.`);
  }
  return map;
}

async function postableAccounts(
  tx: Tx,
  ids: (string | null | undefined)[],
  blockedKeys: string[] = [],
) {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const rows = wanted.length
    ? await tx.select().from(t.accounts).where(inArray(t.accounts.id, wanted))
    : [];
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of wanted) {
    const a = map.get(id);
    if (!a) fail("A selected account does not exist.");
    else if (a.isGroup)
      fail(`${a.code} ${a.name} is a group account; choose a posting account under it.`);
    else if (a.status !== "Active") fail(`${a.code} ${a.name} is inactive.`);
    else if (a.systemKey && blockedKeys.includes(a.systemKey))
      fail(`${a.name} is maintained automatically; use the relevant module instead.`);
  }
  return map;
}

async function refDoc(
  tx: Tx,
  id: string | null | undefined,
  type: DocType,
  partyId?: string | null,
): Promise<{ doc: DocRow; lines: LineRow[] }> {
  if (!id) return fail(`Choose the original ${DOC_DEFS[type].label.toLowerCase()}.`);
  const [doc] = await tx.select().from(t.documents).where(eq(t.documents.id, id));
  if (!doc || doc.type !== type)
    return fail(`The referenced ${DOC_DEFS[type].label.toLowerCase()} was not found.`);
  if (doc.status !== "Approved") fail(`${doc.docNo} is not approved.`);
  if (partyId && doc.partyId !== partyId) fail(`${doc.docNo} belongs to a different party.`);
  const lines = await tx
    .select()
    .from(t.documentLines)
    .where(eq(t.documentLines.documentId, doc.id));
  return { doc, lines };
}

function requireLines<T>(lines: T[] | undefined, what = "line"): T[] {
  if (!lines?.length) return fail(`Add at least one ${what}.`);
  return lines;
}

/** Money documents: cash or a bank account (cheques clear through a bank). */
async function moneySource(tx: Tx, input: DocInput) {
  const method = input.method ?? fail("Choose a payment method.");
  if (method === "Cash") return { method, bankAccountId: null, chequeNo: "" };
  const bankId = input.bankAccountId ?? fail("Choose a bank account.");
  const [bank] = await tx.select().from(t.bankAccounts).where(eq(t.bankAccounts.id, bankId));
  if (!bank || bank.status !== "Active") fail("The selected bank account is not active.");
  const chequeNo = (input.chequeNo ?? "").trim();
  if (method === "Cheque" && !chequeNo) fail("Enter the cheque number.");
  return { method, bankAccountId: bankId, chequeNo };
}

export async function prepareDocument(
  tx: Tx,
  input: DocInput,
  currentId: string | null = null,
): Promise<Prepared> {
  const def = DOC_DEFS[input.type];
  const fy = await fyForDate(tx, input.date);
  const warnings: string[] = [];
  const header: PreparedHeader = {
    type: input.type,
    date: input.date,
    fyId: fy.id,
    partyType: def.partyType ?? null,
    partyId: null,
    reference: (input.reference ?? "").trim(),
    narration: (input.narration ?? "").trim(),
    extra: input.extra ?? {},
  };
  let party: Awaited<ReturnType<typeof activeParty>> | null = null;
  if (def.partyType) {
    party = await activeParty(tx, def.partyType, input.partyId);
    header.partyId = party.id;
  }
  let lines: PreparedLine[] = [];
  let allocations: Prepared["allocations"] = [];
  const raw = input.lines ?? [];

  switch (input.type) {
    case "SO":
    case "SI":
    case "SMP": {
      const items = requireLines(raw, "book");
      const products = await activeProducts(
        tx,
        items.map((l) => l.productId),
      );
      let soLines = new Map<string, LineRow>();
      if (input.type === "SI" && input.refDocId) {
        const so = await refDoc(tx, input.refDocId, "SO", header.partyId);
        header.refDocId = so.doc.id;
        soLines = new Map(so.lines.map((l) => [l.id, l]));
      }
      lines = items.map((l, i) => {
        const p = products.get(l.productId ?? "") ?? fail(`Line ${i + 1}: choose a book.`);
        const qty = l.qty ?? 0;
        if (qty <= 0) fail(`Line ${i + 1}: quantity must be a positive whole number.`);
        const rate = input.type === "SMP" ? 0 : (l.rate ?? p.salePrice);
        const discountPct = input.type === "SMP" ? 0 : (l.discountPct ?? 0);
        if (l.refLineId) {
          const so =
            soLines.get(l.refLineId) ?? fail(`Line ${i + 1}: not part of the selected order.`);
          if (so.productId !== p.id) fail(`Line ${i + 1}: book differs from the order line.`);
          if (so.doneQty + qty > so.qty)
            fail(
              `Line ${i + 1}: only ${so.qty - so.doneQty} of ${p.name} remain to deliver on this order.`,
            );
        }
        return {
          lineNo: i + 1,
          productId: p.id,
          description: l.description ?? "",
          qty,
          rate,
          discountPct,
          amount: lineAmount({ qty, rate, discountPct }),
          refLineId: l.refLineId ?? null,
        };
      });
      if (input.type === "SMP") {
        const issuedTo = String(input.extra?.["issuedTo"] ?? "").trim();
        const purpose = String(input.extra?.["purpose"] ?? "").trim();
        if (!issuedTo) fail("Enter who the samples were issued to.");
        if (!purpose) fail("Enter the purpose of the samples.");
        const value = items.reduce(
          (s, l) => s + (l.qty ?? 0) * (products.get(l.productId ?? "")?.avgCost ?? 0),
          0,
        );
        Object.assign(header, { subtotal: 0, total: round2(value) });
        break;
      }
      const discount = input.discount ?? 0;
      const taxPct = input.taxPct ?? 0;
      const totals = docTotals(
        lines as { qty: number; rate: number; discountPct: number }[],
        discount,
        taxPct,
      );
      if (totals.taxable < 0) fail("Discount cannot exceed the subtotal.");
      Object.assign(header, {
        subtotal: totals.subtotal,
        discount,
        taxPct,
        taxAmount: totals.taxAmount,
        total: totals.total,
      });
      if (input.type === "SI") {
        const cust = party as typeof t.customers.$inferSelect;
        header.dueDate = input.dueDate ?? addDays(input.date, cust.creditDays);
        if (cust.creditLimit > 0) {
          const bal = await partyBalance(tx, "customer", cust.id);
          if (bal + totals.total > cust.creditLimit)
            warnings.push(
              `${cust.name} will exceed the credit limit (${cust.creditLimit.toLocaleString()}); balance after this invoice ${(bal + totals.total).toLocaleString()}.`,
            );
        }
      }
      break;
    }

    case "SR":
    case "PR":
    case "SMR": {
      const origType: DocType = input.type === "SR" ? "SI" : input.type === "PR" ? "PI" : "SMP";
      const orig = await refDoc(tx, input.refDocId, origType, header.partyId);
      header.refDocId = orig.doc.id;
      header.kind = orig.doc.kind;
      const origLines = new Map(orig.lines.map((l) => [l.id, l]));
      lines = requireLines(
        raw.filter((l) => (l.qty ?? 0) > 0),
        "returned quantity",
      ).map((l, i) => {
        const o =
          origLines.get(l.refLineId ?? "") ?? fail(`Line ${i + 1}: not part of ${orig.doc.docNo}.`);
        const qty = l.qty ?? 0;
        if (o.doneQty + qty > o.qty)
          fail(
            `Line ${i + 1}: only ${o.qty - o.doneQty} can still be returned against ${orig.doc.docNo}.`,
          );
        return {
          lineNo: i + 1,
          productId: o.productId,
          accountId: o.accountId,
          description: o.description,
          qty,
          rate: o.rate,
          discountPct: o.discountPct,
          amount: lineAmount({ qty, rate: o.rate, discountPct: o.discountPct }),
          refLineId: o.id,
        };
      });
      if (input.type === "SMR") {
        Object.assign(header, {
          total: round2(
            lines.reduce(
              (s, l) => s + (l.qty ?? 0) * (origLines.get(l.refLineId!)?.unitCost ?? 0),
              0,
            ),
          ),
        });
      } else {
        const sub = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
        const discount =
          orig.doc.subtotal > 0 ? round2((orig.doc.discount * sub) / orig.doc.subtotal) : 0;
        const totals = docTotals(
          lines as { qty: number; rate: number; discountPct: number }[],
          discount,
          orig.doc.taxPct,
        );
        Object.assign(header, {
          subtotal: totals.subtotal,
          discount,
          taxPct: orig.doc.taxPct,
          taxAmount: totals.taxAmount,
          total: totals.total,
        });
        if (!String(input.extra?.["reason"] ?? "").trim()) fail("Enter the reason for the return.");
      }
      break;
    }

    case "PI": {
      const kind =
        input.kind ?? fail("Choose what is being purchased (Books, Material or Service).");
      header.kind = kind;
      const items = requireLines(raw);
      if (kind === "Books") {
        const products = await activeProducts(
          tx,
          items.map((l) => l.productId),
        );
        lines = items.map((l, i) => {
          const p = products.get(l.productId ?? "") ?? fail(`Line ${i + 1}: choose a book.`);
          const qty = l.qty ?? 0;
          if (qty <= 0) fail(`Line ${i + 1}: quantity must be a positive whole number.`);
          const rate = l.rate ?? p.costPrice;
          const discountPct = l.discountPct ?? 0;
          return {
            lineNo: i + 1,
            productId: p.id,
            description: l.description ?? "",
            qty,
            rate,
            discountPct,
            amount: lineAmount({ qty, rate, discountPct }),
          };
        });
      } else {
        const accts = await postableAccounts(
          tx,
          items.map((l) => l.accountId),
          ["AR", "AP", "INVENTORY", "CASH"],
        );
        lines = items.map((l, i) => {
          const a =
            accts.get(l.accountId ?? "") ??
            fail(`Line ${i + 1}: choose the expense/asset account.`);
          if (!["Expense", "Asset"].includes(a.type))
            fail(`Line ${i + 1}: ${a.name} must be an expense or asset account.`);
          const description =
            (l.description ?? "").trim() || fail(`Line ${i + 1}: enter a description.`);
          const qty = l.qty ?? 1;
          if (qty <= 0) fail(`Line ${i + 1}: quantity must be positive.`);
          const rate = l.rate ?? 0;
          const discountPct = l.discountPct ?? 0;
          return {
            lineNo: i + 1,
            accountId: a.id,
            description,
            qty,
            rate,
            discountPct,
            amount: lineAmount({ qty, rate, discountPct }),
          };
        });
      }
      const discount = input.discount ?? 0;
      const taxPct = input.taxPct ?? 0;
      const totals = docTotals(
        lines as { qty: number; rate: number; discountPct: number }[],
        discount,
        taxPct,
      );
      if (totals.taxable < 0) fail("Discount cannot exceed the subtotal.");
      const supp = party as typeof t.suppliers.$inferSelect;
      Object.assign(header, {
        subtotal: totals.subtotal,
        discount,
        taxPct,
        taxAmount: totals.taxAmount,
        total: totals.total,
        dueDate: input.dueDate ?? addDays(input.date, supp.creditDays),
      });
      break;
    }

    case "RV":
    case "PV":
    case "EXP":
    case "LOAN": {
      const amount = round2(input.amount ?? 0);
      if (amount <= 0) fail("Amount must be greater than zero.");
      Object.assign(header, await moneySource(tx, input), { subtotal: amount, total: amount });
      if (input.type === "EXP") {
        const headId = input.expenseHeadId ?? fail("Choose an expense head.");
        const [head] = await tx.select().from(t.expenseHeads).where(eq(t.expenseHeads.id, headId));
        if (!head || head.status !== "Active") fail("The selected expense head is not active.");
        if (!header.narration) fail("Enter a description of the expense.");
        header.expenseHeadId = headId;
      }
      if (input.type === "LOAN") {
        const loanType = String(input.extra?.["loanType"] ?? "");
        const installment = Number(input.extra?.["installment"] ?? 0);
        if (!["Advance", "Loan"].includes(loanType)) fail("Choose Advance or Loan.");
        if (!(installment > 0) || installment > amount)
          fail("Monthly recovery must be more than zero and not more than the amount.");
      }
      if (input.type === "RV" || input.type === "PV") {
        allocations = (input.allocations ?? [])
          .filter((a) => a.amount > 0)
          .map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) }));
        if (round2(allocations.reduce((s, a) => s + a.amount, 0)) > amount)
          fail("Allocated amount exceeds the payment amount.");
        if (new Set(allocations.map((a) => a.invoiceId)).size !== allocations.length)
          fail("An invoice is allocated twice.");
        await checkAllocations(tx, input.type === "RV" ? "SI" : "PI", header.partyId!, allocations);
      }
      break;
    }

    case "SALPAY": {
      const payroll = await refDoc(tx, input.refDocId, "PAYROLL");
      header.refDocId = payroll.doc.id;
      Object.assign(header, await moneySource(tx, input));
      const payable = new Map((await salaryPayable(tx)).map((r) => [r.staffId, r.balance]));
      lines = requireLines(
        raw.filter((l) => (l.rate ?? 0) > 0),
        "salary",
      ).map((l, i) => {
        const staffId = l.partyId ?? fail(`Line ${i + 1}: choose a staff member.`);
        const amount = round2(l.rate ?? 0);
        const due = payable.get(staffId) ?? 0;
        if (amount > due)
          fail(`Line ${i + 1}: amount exceeds the unpaid salary (${due.toLocaleString()}).`);
        return {
          lineNo: i + 1,
          partyType: "staff" as const,
          partyId: staffId,
          qty: 1,
          rate: amount,
          amount,
        };
      });
      const total = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
      Object.assign(header, { subtotal: total, total });
      break;
    }

    case "JV": {
      const items = requireLines(raw);
      if (items.length < 2) fail("A journal needs at least two lines.");
      await postableAccounts(
        tx,
        items.map((l) => l.accountId),
      );
      lines = items.map((l, i) => {
        const debit = round2(l.debit ?? 0),
          credit = round2(l.credit ?? 0);
        if (!l.accountId) fail(`Line ${i + 1}: choose an account.`);
        if (debit > 0 === credit > 0) fail(`Line ${i + 1}: enter either a debit or a credit.`);
        if (Boolean(l.partyType) !== Boolean(l.partyId))
          fail(`Line ${i + 1}: choose both party type and party.`);
        return {
          lineNo: i + 1,
          accountId: l.accountId!,
          partyType: l.partyType ?? null,
          partyId: l.partyId ?? null,
          description: l.description ?? "",
          debit,
          credit,
        };
      });
      for (const l of lines)
        if (l.partyType && l.partyId) await activeParty(tx, l.partyType, l.partyId);
      const dr = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
      const cr = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
      if (dr !== cr)
        fail(`Debits (${dr.toLocaleString()}) and credits (${cr.toLocaleString()}) must be equal.`);
      if (!header.narration) fail("Enter a narration explaining the journal.");
      Object.assign(header, { subtotal: dr, total: dr });
      break;
    }

    case "ADJ":
    case "DMG": {
      const items = requireLines(raw, "book");
      const products = await activeProducts(
        tx,
        items.map((l) => l.productId),
      );
      if (!String(input.extra?.["reason"] ?? "").trim()) fail("Enter the reason.");
      if (input.type === "ADJ" && !header.reference)
        fail("Enter a reference (e.g. stock count sheet number).");
      if (
        input.type === "DMG" &&
        !["Damaged", "Defective", "Obsolete", "Written-off"].includes(
          String(input.extra?.["condition"] ?? ""),
        )
      ) {
        fail("Choose the condition: Damaged, Defective, Obsolete or Written-off.");
      }
      lines = items.map((l, i) => {
        const p = products.get(l.productId ?? "") ?? fail(`Line ${i + 1}: choose a book.`);
        const qty = l.qty ?? 0;
        if (!Number.isInteger(qty) || qty === 0)
          fail(`Line ${i + 1}: enter a non-zero whole quantity.`);
        if (input.type === "DMG" && qty < 0)
          fail(`Line ${i + 1}: damaged quantity must be positive.`);
        const rate =
          qty > 0 && input.type === "ADJ" ? l.rate || p.avgCost || p.costPrice : p.avgCost;
        return {
          lineNo: i + 1,
          productId: p.id,
          description: l.description ?? "",
          qty,
          rate,
          amount: round2(Math.abs(qty) * rate),
        };
      });
      const total = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
      Object.assign(header, { subtotal: total, total });
      break;
    }

    case "OB": {
      const items = requireLines(raw, "opening balance");
      const products = await activeProducts(
        tx,
        items.map((l) => l.productId),
      );
      await postableAccounts(
        tx,
        items.map((l) => l.accountId),
        ["AR", "AP", "INVENTORY", "STAFF_ADV", "OPENING"],
      );
      lines = [];
      for (const [i, l] of items.entries()) {
        const n = i + 1;
        if (l.productId) {
          const p = products.get(l.productId)!;
          const qty = l.qty ?? 0;
          if (qty <= 0) fail(`Line ${n}: opening quantity must be positive.`);
          const rate = l.rate ?? p.costPrice;
          lines.push({
            lineNo: n,
            productId: p.id,
            qty,
            rate,
            amount: round2(qty * rate),
            description: l.description ?? "",
          });
          continue;
        }
        const debit = round2(l.debit ?? 0),
          credit = round2(l.credit ?? 0);
        if (debit > 0 === credit > 0) fail(`Line ${n}: enter either a debit or a credit.`);
        if (l.partyType && l.partyId) {
          await activeParty(tx, l.partyType, l.partyId);
          lines.push({
            lineNo: n,
            partyType: l.partyType,
            partyId: l.partyId,
            debit,
            credit,
            description: l.description ?? "",
          });
        } else if (l.accountId) {
          lines.push({
            lineNo: n,
            accountId: l.accountId,
            debit,
            credit,
            description: l.description ?? "",
          });
        } else fail(`Line ${n}: choose a book, party or account.`);
      }
      const total = round2(
        lines.reduce((s, l) => s + (l.amount ?? 0) + (l.debit ?? 0) + (l.credit ?? 0), 0),
      );
      Object.assign(header, {
        subtotal: total,
        total,
        narration: header.narration || "Opening balances",
      });
      break;
    }

    case "PAYROLL": {
      const month = String(input.extra?.["month"] ?? "");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail("Choose the payroll month.");
      const dup = await tx
        .select({ no: t.documents.docNo })
        .from(t.documents)
        .where(
          and(
            eq(t.documents.type, "PAYROLL"),
            ne(t.documents.status, "Cancelled"),
            sql`${t.documents.extra}->>'month' = ${month}`,
            currentId ? ne(t.documents.id, currentId) : sql`true`,
          ),
        );
      if (dup.length) fail(`Payroll for ${month} already exists (${dup[0]!.no}).`);
      const advances = new Map((await staffAdvances(tx)).map((r) => [r.staffId, r.balance]));
      lines = requireLines(raw, "staff member").map((l, i) => {
        const staffId = l.partyId ?? fail(`Line ${i + 1}: choose a staff member.`);
        const e = l.extra ?? {};
        const basic = round2(Number(e["basic"] ?? 0)),
          allowances = round2(Number(e["allowances"] ?? 0));
        const deductions = round2(Number(e["deductions"] ?? 0)),
          recovery = round2(Number(e["recovery"] ?? 0));
        if ([basic, allowances, deductions, recovery].some((x) => !(x >= 0)))
          fail(`Line ${i + 1}: amounts cannot be negative.`);
        if (recovery > (advances.get(staffId) ?? 0))
          fail(`Line ${i + 1}: recovery exceeds the outstanding advance/loan.`);
        const net = round2(basic + allowances - deductions - recovery);
        if (net < 0) fail(`Line ${i + 1}: deductions exceed gross salary.`);
        return {
          lineNo: i + 1,
          partyType: "staff" as const,
          partyId: staffId,
          qty: 1,
          rate: net,
          amount: net,
          extra: { basic, allowances, deductions, recovery },
        };
      });
      if (new Set(lines.map((l) => l.partyId)).size !== lines.length)
        fail("A staff member appears twice in the payroll.");
      const total = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
      Object.assign(header, {
        subtotal: total,
        total,
        narration: header.narration || `Payroll ${month}`,
      });
      break;
    }
  }

  return { header, lines, allocations, warnings };
}

export async function checkAllocations(
  tx: Tx,
  invoiceType: "SI" | "PI",
  partyId: string,
  allocations: { invoiceId: string; amount: number }[],
) {
  if (!allocations.length) return;
  const invoices = await tx
    .select()
    .from(t.documents)
    .where(
      inArray(
        t.documents.id,
        allocations.map((a) => a.invoiceId),
      ),
    );
  const map = new Map(invoices.map((d) => [d.id, d]));
  for (const a of allocations) {
    const inv = map.get(a.invoiceId);
    if (!inv || inv.type !== invoiceType || inv.partyId !== partyId)
      fail("An allocated invoice does not belong to this party.");
    else if (inv.status !== "Approved") fail(`${inv.docNo} is not approved.`);
    else {
      const open = round2(inv.total - inv.paidAmount - inv.creditedAmount);
      if (a.amount > open) fail(`${inv.docNo} has only ${open.toLocaleString()} outstanding.`);
    }
  }
}

/** Customer: positive = receivable. Supplier: positive = payable. */
export async function partyBalance(tx: Tx | DB, type: PartyType, id: string) {
  const key = type === "customer" ? "AR" : type === "supplier" ? "AP" : "STAFF_ADV";
  const rows = await tx.execute<{ bal: string | null }>(sql`
    select coalesce(sum(g.debit - g.credit), 0) as bal
    from gl_entries g join accounts a on a.id = g.account_id
    where a.system_key = ${key} and g.party_type = ${type} and g.party_id = ${id}`);
  const bal = round2(Number(rows[0]?.bal ?? 0));
  return type === "supplier" ? -bal : bal;
}

export async function staffAdvances(tx: Tx | DB) {
  const rows = await tx.execute<{ staff_id: string; bal: string }>(sql`
    select g.party_id as staff_id, sum(g.debit - g.credit) as bal
    from gl_entries g join accounts a on a.id = g.account_id
    where a.system_key = 'STAFF_ADV' and g.party_type = 'staff' group by g.party_id`);
  return rows.map((r) => ({ staffId: r.staff_id, balance: round2(Number(r.bal)) }));
}

export async function salaryPayable(tx: Tx | DB) {
  const rows = await tx.execute<{ staff_id: string; bal: string }>(sql`
    select g.party_id as staff_id, sum(g.credit - g.debit) as bal
    from gl_entries g join accounts a on a.id = g.account_id
    where a.system_key = 'SALARY_PAYABLE' and g.party_type = 'staff' group by g.party_id`);
  return rows.map((r) => ({ staffId: r.staff_id, balance: round2(Number(r.bal)) }));
}
