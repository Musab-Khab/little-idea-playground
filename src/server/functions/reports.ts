/**
 * Reports. Every figure is computed from approved postings (gl_entries, stock_ledger) or approved
 * documents — nothing is stored or hand-entered.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { assertPerm, requireUser } from "../security/session";
import { fail } from "../posting/context";
import { safe, toRows, type Row } from "./_safe";
import { addDays, round2, todayISO, type PartyType } from "@/shared/documents";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to, "From date must be before To date");
const n = (v: unknown) => round2(Number(v ?? 0));

async function reportUser(...perms: Parameters<typeof assertPerm>[1][]) {
  const user = await requireUser();
  assertPerm(user, ...(perms.length ? perms : ["reports.view" as const]));
  return user;
}

/* ---------------------------------------------------------- account tree */

type AccountRow = typeof t.accounts.$inferSelect;
async function accountTree() {
  const accounts = await getDb().select().from(t.accounts).orderBy(asc(t.accounts.code));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rootOf = (a: AccountRow): AccountRow => {
    let cur = a;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  };
  return { accounts, byId, rootOf };
}

/** Sum of debit − credit per account over a date window (closing entries optional). */
async function movement(from: string | null, to: string, includeClosing = true) {
  const rows = await getDb().execute<{ account_id: string; dr: string; cr: string }>(sql`
    select g.account_id, sum(g.debit) dr, sum(g.credit) cr
    from gl_entries g join documents d on d.id = g.document_id
    where g.date <= ${to} ${from ? sql`and g.date >= ${from}` : sql``}
      ${includeClosing ? sql`` : sql`and d.type <> 'CLOSE'`}
    group by g.account_id`);
  return new Map(rows.map((r) => [r.account_id, { dr: n(r.dr), cr: n(r.cr) }]));
}

/* ------------------------------------------------------------ P&L / BS */

async function profitAndLoss(from: string, to: string) {
  const { accounts, rootOf } = await accountTree();
  const mv = await movement(from, to, false);
  const lines: { section: string; code: string; name: string; amount: number }[] = [];
  for (const a of accounts) {
    if (a.isGroup || (a.type !== "Income" && a.type !== "Expense")) continue;
    const m = mv.get(a.id);
    if (!m) continue;
    const amount = a.type === "Income" ? round2(m.cr - m.dr) : round2(m.dr - m.cr);
    if (amount === 0) continue;
    const root = rootOf(a);
    const section =
      a.type === "Income" ? "Revenue" : root.code.startsWith("5") ? "Cost of Sales" : root.name;
    lines.push({ section, code: a.code, name: a.name, amount });
  }
  const sum = (s: string) =>
    round2(lines.filter((l) => l.section === s).reduce((x, l) => x + l.amount, 0));
  const revenue = sum("Revenue");
  const costOfSales = sum("Cost of Sales");
  const grossProfit = round2(revenue - costOfSales);
  const expenses = round2(
    lines
      .filter((l) => l.section !== "Revenue" && l.section !== "Cost of Sales")
      .reduce((x, l) => x + l.amount, 0),
  );
  return {
    lines,
    revenue,
    costOfSales,
    grossProfit,
    expenses,
    netProfit: round2(grossProfit - expenses),
  };
}

export const getProfitLoss = createServerFn({ method: "GET" })
  .validator(range)
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const r = await profitAndLoss(data.from, data.to);
      return { ...r, lines: toRows(r.lines) };
    }),
  );

async function balanceSheet(asOf: string) {
  const { accounts, byId, rootOf } = await accountTree();
  const mv = await movement(null, asOf);
  const lines: { section: string; group: string; code: string; name: string; amount: number }[] =
    [];
  let unclosedProfit = 0;
  for (const a of accounts) {
    if (a.isGroup) continue;
    const m = mv.get(a.id);
    if (!m) continue;
    const bal = round2(m.dr - m.cr);
    if (a.type === "Income" || a.type === "Expense") {
      unclosedProfit = round2(unclosedProfit - bal);
      continue;
    }
    const amount = a.type === "Asset" ? bal : -bal;
    if (amount === 0) continue;
    const parent = a.parentId ? byId.get(a.parentId) : null;
    lines.push({
      section: a.type === "Asset" ? "Assets" : a.type === "Liability" ? "Liabilities" : "Equity",
      group: parent?.name ?? rootOf(a).name,
      code: a.code,
      name: a.name,
      amount,
    });
  }
  if (unclosedProfit !== 0)
    lines.push({
      section: "Equity",
      group: "Equity",
      code: "",
      name: "Profit / (loss) not yet closed",
      amount: unclosedProfit,
    });
  const total = (s: string) =>
    round2(lines.filter((l) => l.section === s).reduce((x, l) => x + l.amount, 0));
  const assets = total("Assets"),
    liabilities = total("Liabilities"),
    equity = total("Equity");
  return {
    lines,
    assets,
    liabilities,
    equity,
    balanced: round2(assets - liabilities - equity) === 0,
  };
}

export const getBalanceSheet = createServerFn({ method: "GET" })
  .validator(z.object({ asOf: isoDate }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const r = await balanceSheet(data.asOf);
      return { ...r, lines: toRows(r.lines) };
    }),
  );

export const getTrialBalance = createServerFn({ method: "GET" })
  .validator(range)
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const { accounts } = await accountTree();
      const opening = await movement(null, addDays(data.from, -1));
      const period = await movement(data.from, data.to);
      const rows = accounts
        .filter((a) => !a.isGroup)
        .map((a) => {
          const o = opening.get(a.id) ?? { dr: 0, cr: 0 };
          const p = period.get(a.id) ?? { dr: 0, cr: 0 };
          const open = round2(o.dr - o.cr),
            close = round2(open + p.dr - p.cr);
          return {
            code: a.code,
            name: a.name,
            type: a.type,
            openingDr: open > 0 ? open : 0,
            openingCr: open < 0 ? -open : 0,
            debit: p.dr,
            credit: p.cr,
            closingDr: close > 0 ? close : 0,
            closingCr: close < 0 ? -close : 0,
          };
        })
        .filter((r) => r.openingDr || r.openingCr || r.debit || r.credit);
      const totals = {
        debit: round2(rows.reduce((s, r) => s + r.closingDr, 0)),
        credit: round2(rows.reduce((s, r) => s + r.closingCr, 0)),
      };
      return { rows: toRows(rows), totals };
    }),
  );

/* -------------------------------------------------------------- ledgers */

async function ledger(
  accountIds: string[],
  from: string,
  to: string,
  party?: { type: PartyType; id: string },
) {
  if (!accountIds.length) return { opening: 0, rows: [] as Row[], closing: 0 };
  const ids = sql.join(
    accountIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const partyCond = party
    ? sql`and g.party_type = ${party.type} and g.party_id = ${party.id}`
    : sql``;
  const [o] = await getDb().execute<{ bal: string | null }>(sql`
    select sum(g.debit - g.credit) bal from gl_entries g where g.account_id in (${ids}) and g.date < ${from} ${partyCond}`);
  const entries = await getDb().execute<Record<string, string | null>>(sql`
    select g.date::text, d.doc_no, d.type, d.id doc_id, d.reference, coalesce(nullif(g.narration, ''), d.narration) narration,
           g.debit, g.credit, g.is_reversal, a.code || ' ' || a.name account
    from gl_entries g join documents d on d.id = g.document_id join accounts a on a.id = g.account_id
    where g.account_id in (${ids}) and g.date between ${from} and ${to} ${partyCond}
    order by g.date, g.id`);
  let bal = n(o?.bal);
  const opening = bal;
  const rows = entries.map((e) => {
    bal = round2(bal + n(e["debit"]) - n(e["credit"]));
    return {
      date: e["date"],
      docNo: e["doc_no"],
      docId: e["doc_id"],
      type: e["type"],
      reference: e["reference"],
      narration: e["narration"],
      account: e["account"],
      debit: n(e["debit"]),
      credit: n(e["credit"]),
      balance: bal,
      reversal: e["is_reversal"] === "true" || (e["is_reversal"] as unknown) === true,
    };
  });
  return { opening, rows: toRows(rows), closing: bal };
}

export const getGeneralLedger = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, accountId: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "reports.view", "accounts.manage");
      const [acc] = await getDb()
        .select()
        .from(t.accounts)
        .where(eq(t.accounts.id, data.accountId));
      if (!acc) return fail("Account not found.");
      if (
        ["SALARY_PAYABLE", "STAFF_ADV", "SALARY_EXP"].includes(acc.systemKey ?? "") &&
        !user.permissions.has("hr.salary_view")
      )
        fail("Salary accounts are restricted to HR.");
      return {
        account: `${acc.code} ${acc.name}`,
        ...(await ledger([acc.id], data.from, data.to)),
      };
    }),
  );

/** Cash book or a bank book with opening, receipts, payments and running balance. */
export const getCashBankBook = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, bankAccountId: z.string().uuid().nullish() }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "reports.view", "accounts.manage");
      const db = getDb();
      let accountId: string, title: string;
      if (data.bankAccountId) {
        const [b] = await db
          .select()
          .from(t.bankAccounts)
          .where(eq(t.bankAccounts.id, data.bankAccountId));
        if (!b) return fail("Bank account not found.");
        accountId = b.accountId;
        title = `${b.name} (${b.accountNo})`;
      } else {
        const [c] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "CASH"));
        accountId = c!.id;
        title = "Cash in Hand";
      }
      return { title, ...(await ledger([accountId], data.from, data.to)) };
    }),
  );

/** Summary per cash/bank account: opening, receipts, payments, closing. */
export const getCashBankSummary = createServerFn({ method: "GET" })
  .validator(range)
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const db = getDb();
      const banks = await db.select().from(t.bankAccounts);
      const [cash] = await db.select().from(t.accounts).where(eq(t.accounts.systemKey, "CASH"));
      const list = [
        { name: "Cash in Hand", accountId: cash!.id, status: "Active" },
        ...banks.map((b) => ({
          name: `${b.name} (${b.accountNo})`,
          accountId: b.accountId,
          status: b.status,
        })),
      ];
      const opening = await movement(null, addDays(data.from, -1));
      const period = await movement(data.from, data.to);
      return toRows(
        list.map((l) => {
          const o = opening.get(l.accountId) ?? { dr: 0, cr: 0 };
          const p = period.get(l.accountId) ?? { dr: 0, cr: 0 };
          const open = round2(o.dr - o.cr);
          return {
            name: l.name,
            status: l.status,
            opening: open,
            receipts: p.dr,
            payments: p.cr,
            closing: round2(open + p.dr - p.cr),
          };
        }),
      );
    }),
  );

/** Customer / supplier / staff statement with running balance (customer: + owes us; supplier: + we owe). */
export const getPartyStatement = createServerFn({ method: "GET" })
  .validator(
    z.object({
      from: isoDate,
      to: isoDate,
      partyType: z.enum(["customer", "supplier", "staff"]),
      partyId: z.string().uuid(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      if (data.partyType === "staff") assertPerm(user, "hr.salary_view");
      else
        assertPerm(
          user,
          "reports.view",
          data.partyType === "customer" ? "customers.manage" : "suppliers.manage",
        );
      const db = getDb();
      const keys =
        data.partyType === "customer"
          ? ["AR"]
          : data.partyType === "supplier"
            ? ["AP"]
            : ["STAFF_ADV", "SALARY_PAYABLE"];
      const accs = await db
        .select()
        .from(t.accounts)
        .where(
          sql`${t.accounts.systemKey} in (${sql.join(
            keys.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        );
      const table =
        data.partyType === "customer"
          ? t.customers
          : data.partyType === "supplier"
            ? t.suppliers
            : t.staff;
      const [p] = await db.select().from(table).where(eq(table.id, data.partyId));
      if (!p) return fail("Party not found.");
      const l = await ledger(
        accs.map((a) => a.id),
        data.from,
        data.to,
        { type: data.partyType, id: data.partyId },
      );
      const sign = data.partyType === "supplier" ? -1 : 1;
      const flip = (r: Row): Row => ({ ...r, balance: round2(Number(r["balance"]) * sign) });
      return {
        party: {
          name: p.name,
          code: "code" in p ? p.code : (p as { empId: string }).empId,
          address: "address" in p ? p.address : "",
          phone: "phone" in p ? p.phone : "",
        },
        opening: round2(l.opening * sign),
        closing: round2(l.closing * sign),
        rows: l.rows.map(flip),
      };
    }),
  );

/** Outstanding invoices by age (days past due), plus unapplied credits, per party. */
export const getAgeing = createServerFn({ method: "GET" })
  .validator(
    z.object({
      partyType: z.enum(["customer", "supplier"]),
      asOf: isoDate,
      category: z.string().optional(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const db = getDb();
      const type = data.partyType === "customer" ? "SI" : "PI";
      const key = data.partyType === "customer" ? "AR" : "AP";
      const table = data.partyType === "customer" ? t.customers : t.suppliers;
      const parties = await db.select().from(table).orderBy(asc(table.name));
      const inv = await db.execute<{ party_id: string; due: string; open: string }>(sql`
      select party_id, coalesce(due_date, date)::text due, (total - paid_amount - credited_amount) open
      from documents where type = ${type} and status = 'Approved' and date <= ${data.asOf} and total > paid_amount + credited_amount`);
      const bal = await db.execute<{ party_id: string; bal: string }>(sql`
      select g.party_id, sum(g.debit - g.credit) bal from gl_entries g join accounts a on a.id = g.account_id
      where a.system_key = ${key} and g.date <= ${data.asOf} group by g.party_id`);
      const balances = new Map(
        bal.map((b) => [b.party_id, n(b.bal) * (data.partyType === "customer" ? 1 : -1)]),
      );
      const buckets = new Map<string, number[]>();
      const asOf = new Date(`${data.asOf}T00:00:00Z`).getTime();
      for (const i of inv) {
        const daysPast = Math.floor((asOf - new Date(`${i.due}T00:00:00Z`).getTime()) / 86400000);
        const idx =
          daysPast <= 0 ? 0 : daysPast <= 30 ? 1 : daysPast <= 60 ? 2 : daysPast <= 90 ? 3 : 4;
        const b = buckets.get(i.party_id) ?? [0, 0, 0, 0, 0];
        b[idx] = round2(b[idx]! + n(i.open));
        buckets.set(i.party_id, b);
      }
      const rows = parties
        .filter((p) => !data.category || p.category === data.category)
        .map((p) => {
          const b = buckets.get(p.id) ?? [0, 0, 0, 0, 0];
          const balance = balances.get(p.id) ?? 0;
          const invoiced = round2(b.reduce((s, x) => s + x, 0));
          return {
            code: p.code,
            name: p.name,
            category: p.category,
            phone: p.phone,
            current: b[0]!,
            d1_30: b[1]!,
            d31_60: b[2]!,
            d61_90: b[3]!,
            d90plus: b[4]!,
            overdue: round2(b[1]! + b[2]! + b[3]! + b[4]!),
            onAccount: round2(balance - invoiced),
            balance,
            creditLimit: "creditLimit" in p ? (p as { creditLimit: number }).creditLimit : null,
          };
        })
        .filter((r) => r.balance !== 0 || r.overdue !== 0);
      return toRows(rows);
    }),
  );

/* ---------------------------------------------------------------- stock */

const MOVE_KIND = sql`case d.type
  when 'PI' then 'purchases' when 'PR' then 'purchaseReturns' when 'SI' then 'sales' when 'SR' then 'salesReturns'
  when 'SMP' then 'samplesOut' when 'SMR' then 'samplesIn' when 'DMG' then 'damaged' when 'OB' then 'opening' else 'adjustments' end`;

export const getStockStatement = createServerFn({ method: "GET" })
  .validator(
    z.object({
      from: isoDate,
      to: isoDate,
      category: z.string().optional(),
      className: z.string().optional(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "inventory.manage", "books.manage");
      const db = getDb();
      const products = await db.select().from(t.products).orderBy(asc(t.products.code));
      const open = await db.execute<{ product_id: string; qty: string; value: string }>(sql`
      select product_id, sum(qty_in - qty_out) qty, sum(case when qty_in > 0 then value else -value end) value
      from stock_ledger where date < ${data.from} group by product_id`);
      const moves = await db.execute<{
        product_id: string;
        kind: string;
        qin: string;
        qout: string;
        vin: string;
        vout: string;
      }>(sql`
      select s.product_id, ${MOVE_KIND} kind, sum(s.qty_in) qin, sum(s.qty_out) qout,
             sum(case when s.qty_in > 0 then s.value else 0 end) vin, sum(case when s.qty_out > 0 then s.value else 0 end) vout
      from stock_ledger s join documents d on d.id = s.document_id
      where s.date between ${data.from} and ${data.to} group by s.product_id, d.type`);
      const o = new Map(open.map((r) => [r.product_id, { qty: Number(r.qty), value: n(r.value) }]));
      const m = new Map<string, Record<string, number>>();
      for (const r of moves) {
        const acc = m.get(r.product_id) ?? {};
        const net = Number(r.qin) - Number(r.qout);
        acc[r.kind] = (acc[r.kind] ?? 0) + net;
        acc["inQty"] = (acc["inQty"] ?? 0) + Number(r.qin);
        acc["outQty"] = (acc["outQty"] ?? 0) + Number(r.qout);
        acc["inValue"] = round2((acc["inValue"] ?? 0) + n(r.vin));
        acc["outValue"] = round2((acc["outValue"] ?? 0) + n(r.vout));
        m.set(r.product_id, acc);
      }
      const rows = products
        .filter(
          (p) =>
            (!data.category || p.category === data.category) &&
            (!data.className || p.className === data.className),
        )
        .map((p) => {
          const op = o.get(p.id) ?? { qty: 0, value: 0 };
          const mv = m.get(p.id) ?? {};
          const closingQty = op.qty + (mv["inQty"] ?? 0) - (mv["outQty"] ?? 0);
          const closingValue = round2(op.value + (mv["inValue"] ?? 0) - (mv["outValue"] ?? 0));
          return {
            code: p.code,
            name: p.name,
            className: p.className,
            subject: p.subject,
            category: p.category,
            status: p.status,
            openingQty: op.qty,
            openingValue: op.value,
            received: (mv["purchases"] ?? 0) + (mv["salesReturns"] ?? 0) + (mv["opening"] ?? 0),
            sold: -((mv["sales"] ?? 0) + (mv["purchaseReturns"] ?? 0)),
            samples: -((mv["samplesOut"] ?? 0) + (mv["samplesIn"] ?? 0)),
            adjustments: (mv["adjustments"] ?? 0) + (mv["damaged"] ?? 0),
            closingQty,
            closingValue,
            unitCost: closingQty > 0 ? round2(closingValue / closingQty) : 0,
            minStock: p.minStock,
          };
        })
        .filter(
          (r) => r.openingQty || r.closingQty || r.received || r.sold || r.samples || r.adjustments,
        );
      return toRows(rows);
    }),
  );

export const getStockMovement = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, productId: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "inventory.manage", "books.manage");
      const db = getDb();
      const [p] = await db.select().from(t.products).where(eq(t.products.id, data.productId));
      if (!p) return fail("Product not found.");
      const [o] = await db.execute<{ qty: string | null }>(
        sql`select sum(qty_in - qty_out) qty from stock_ledger where product_id = ${data.productId} and date < ${data.from}`,
      );
      const rows = await db.execute<Record<string, string>>(sql`
      select s.date::text, d.doc_no, d.id doc_id, d.type, s.qty_in, s.qty_out, s.unit_cost, s.value, s.balance_qty, s.is_reversal, d.narration
      from stock_ledger s join documents d on d.id = s.document_id
      where s.product_id = ${data.productId} and s.date between ${data.from} and ${data.to} order by s.id`);
      return {
        product: {
          code: p.code,
          name: p.name,
          stockQty: p.stockQty,
          avgCost: p.avgCost,
          damagedQty: p.damagedQty,
        },
        openingQty: Number(o?.qty ?? 0),
        rows: toRows(
          rows.map((r) => ({
            date: r["date"],
            docNo: r["doc_no"],
            docId: r["doc_id"],
            type: r["type"],
            qtyIn: Number(r["qty_in"]),
            qtyOut: Number(r["qty_out"]),
            unitCost: n(r["unit_cost"]),
            value: n(r["value"]),
            balanceQty: Number(r["balance_qty"]),
            reversal: String(r["is_reversal"]) === "true",
            narration: r["narration"],
          })),
        ),
      };
    }),
  );

/* --------------------------------------------------- transaction reports */

const SALES_GROUPS = [
  "date",
  "month",
  "customer",
  "customerCategory",
  "product",
  "className",
  "subject",
  "category",
] as const;
const PURCHASE_GROUPS = [
  "date",
  "month",
  "supplier",
  "supplierCategory",
  "product",
  "kind",
] as const;

/** Sales net of returns, with document discounts apportioned to lines. Grouped as requested. */
export const getSalesReport = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, groupBy: z.enum(SALES_GROUPS) }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "sales.approve");
      const key = {
        date: sql`d.date::text`,
        month: sql`to_char(d.date, 'YYYY-MM')`,
        customer: sql`c.name`,
        customerCategory: sql`c.category`,
        product: sql`p.code || ' · ' || p.name`,
        className: sql`coalesce(nullif(p.class_name, ''), '—')`,
        subject: sql`coalesce(nullif(p.subject, ''), '—')`,
        category: sql`p.category`,
      }[data.groupBy];
      const rows = await getDb().execute<Record<string, string>>(sql`
      select ${key} grp,
        sum(case when d.type = 'SI' then l.qty else 0 end) sold_qty,
        sum(case when d.type = 'SR' then l.qty else 0 end) returned_qty,
        sum(case when d.type = 'SI' then l.amount * (d.subtotal - d.discount) / nullif(d.subtotal, 0) else 0 end) gross,
        sum(case when d.type = 'SR' then l.amount * (d.subtotal - d.discount) / nullif(d.subtotal, 0) else 0 end) returns,
        sum(case when d.type = 'SI' then l.qty * coalesce(l.unit_cost, 0) else -l.qty * coalesce(l.unit_cost, 0) end) cost,
        count(distinct case when d.type = 'SI' then d.id end) invoices
      from documents d join document_lines l on l.document_id = d.id
      join customers c on c.id = d.party_id left join products p on p.id = l.product_id
      where d.type in ('SI', 'SR') and d.status = 'Approved' and d.date between ${data.from} and ${data.to}
      group by grp order by ${data.groupBy === "date" || data.groupBy === "month" ? sql`grp` : sql`gross desc`}`);
      return toRows(
        rows.map((r) => {
          const net = round2(n(r["gross"]) - n(r["returns"]));
          const cost = n(r["cost"]);
          return {
            group: r["grp"],
            invoices: Number(r["invoices"]),
            soldQty: Number(r["sold_qty"]),
            returnedQty: Number(r["returned_qty"]),
            netQty: Number(r["sold_qty"]) - Number(r["returned_qty"]),
            gross: n(r["gross"]),
            returns: n(r["returns"]),
            net,
            cost,
            margin: round2(net - cost),
          };
        }),
      );
    }),
  );

export const getPurchaseReport = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, groupBy: z.enum(PURCHASE_GROUPS) }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "purchases.approve");
      const key = {
        date: sql`d.date::text`,
        month: sql`to_char(d.date, 'YYYY-MM')`,
        supplier: sql`s.name`,
        supplierCategory: sql`s.category`,
        product: sql`coalesce(p.code || ' · ' || p.name, a.name || ': ' || l.description)`,
        kind: sql`coalesce(d.kind, '—')`,
      }[data.groupBy];
      const rows = await getDb().execute<Record<string, string>>(sql`
      select ${key} grp,
        sum(case when d.type = 'PI' then l.qty else 0 end) qty,
        sum(case when d.type = 'PR' then l.qty else 0 end) returned_qty,
        sum(case when d.type = 'PI' then l.amount * (d.subtotal - d.discount) / nullif(d.subtotal, 0) else 0 end) gross,
        sum(case when d.type = 'PR' then l.amount * (d.subtotal - d.discount) / nullif(d.subtotal, 0) else 0 end) returns,
        count(distinct case when d.type = 'PI' then d.id end) invoices
      from documents d join document_lines l on l.document_id = d.id
      join suppliers s on s.id = d.party_id left join products p on p.id = l.product_id left join accounts a on a.id = l.account_id
      where d.type in ('PI', 'PR') and d.status = 'Approved' and d.date between ${data.from} and ${data.to}
      group by grp order by ${data.groupBy === "date" || data.groupBy === "month" ? sql`grp` : sql`gross desc`}`);
      return toRows(
        rows.map((r) => ({
          group: r["grp"],
          invoices: Number(r["invoices"]),
          qty: Number(r["qty"]),
          returnedQty: Number(r["returned_qty"]),
          gross: n(r["gross"]),
          returns: n(r["returns"]),
          net: round2(n(r["gross"]) - n(r["returns"])),
        })),
      );
    }),
  );

export const getExpenseReport = createServerFn({ method: "GET" })
  .validator(
    z.object({ from: isoDate, to: isoDate, groupBy: z.enum(["date", "month", "head", "method"]) }),
  )
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "expenses.approve");
      const key = {
        date: sql`d.date::text`,
        month: sql`to_char(d.date, 'YYYY-MM')`,
        head: sql`h.name`,
        method: sql`d.method`,
      }[data.groupBy];
      const rows = await getDb().execute<Record<string, string>>(sql`
      select ${key} grp, count(*) vouchers, sum(d.total) amount
      from documents d join expense_heads h on h.id = d.expense_head_id
      where d.type = 'EXP' and d.status = 'Approved' and d.date between ${data.from} and ${data.to}
      group by grp order by ${data.groupBy === "date" || data.groupBy === "month" ? sql`grp` : sql`amount desc`}`);
      return toRows(
        rows.map((r) => ({
          group: r["grp"],
          vouchers: Number(r["vouchers"]),
          amount: n(r["amount"]),
        })),
      );
    }),
  );

export const getSamplesReport = createServerFn({ method: "GET" })
  .validator(
    z.object({
      from: isoDate,
      to: isoDate,
      groupBy: z.enum(["date", "month", "person", "customer", "product"]),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "samples.manage");
      const key = {
        date: sql`d.date::text`,
        month: sql`to_char(d.date, 'YYYY-MM')`,
        person: sql`coalesce(d.extra->>'issuedTo', '—')`,
        customer: sql`c.name`,
        product: sql`p.code || ' · ' || p.name`,
      }[data.groupBy];
      const rows = await getDb().execute<Record<string, string>>(sql`
      select ${key} grp, count(distinct d.id) slips, sum(l.qty) issued, sum(l.done_qty) returned,
             sum((l.qty - l.done_qty) * coalesce(l.unit_cost, 0)) outstanding_value
      from documents d join document_lines l on l.document_id = d.id
      join customers c on c.id = d.party_id join products p on p.id = l.product_id
      where d.type = 'SMP' and d.status = 'Approved' and d.date between ${data.from} and ${data.to}
      group by grp order by grp`);
      return toRows(
        rows.map((r) => ({
          group: r["grp"],
          slips: Number(r["slips"]),
          issued: Number(r["issued"]),
          returned: Number(r["returned"]),
          outstanding: Number(r["issued"]) - Number(r["returned"]),
          outstandingValue: n(r["outstanding_value"]),
        })),
      );
    }),
  );

/** One product: sales, purchases, samples, stock movement and margin for the period. */
export const getProductReport = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, productId: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view", "books.manage");
      const rows = await getDb().execute<{
        type: string;
        qty: string;
        value: string;
        cost: string;
        docs: string;
      }>(sql`
      select d.type, sum(l.qty) qty, sum(l.amount * (d.subtotal - d.discount) / nullif(d.subtotal, 0)) value,
             sum(l.qty * coalesce(l.unit_cost, 0)) cost, count(distinct d.id) docs
      from documents d join document_lines l on l.document_id = d.id
      where l.product_id = ${data.productId} and d.status = 'Approved' and d.date between ${data.from} and ${data.to}
      group by d.type`);
      const by = new Map(
        rows.map((r) => [
          r.type,
          { qty: Number(r.qty), value: n(r.value), cost: n(r.cost), docs: Number(r.docs) },
        ]),
      );
      const z0 = { qty: 0, value: 0, cost: 0, docs: 0 };
      const sales = by.get("SI") ?? z0,
        sret = by.get("SR") ?? z0,
        pur = by.get("PI") ?? z0,
        pret = by.get("PR") ?? z0;
      const smp = by.get("SMP") ?? z0,
        smr = by.get("SMR") ?? z0;
      const netSales = round2(sales.value - sret.value),
        netCost = round2(sales.cost - sret.cost);
      return {
        summary: toRows([
          { item: "Sold", qty: sales.qty, value: sales.value, documents: sales.docs },
          { item: "Sales returns", qty: sret.qty, value: sret.value, documents: sret.docs },
          { item: "Purchased / produced", qty: pur.qty, value: pur.value, documents: pur.docs },
          { item: "Purchase returns", qty: pret.qty, value: pret.value, documents: pret.docs },
          { item: "Samples issued", qty: smp.qty, value: smp.cost, documents: smp.docs },
          { item: "Samples returned", qty: smr.qty, value: smr.cost, documents: smr.docs },
        ]),
        netSales,
        costOfSales: netCost,
        grossMargin: round2(netSales - netCost),
      };
    }),
  );

/* ------------------------------------------------------------ dashboard */

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}
function fyStartFor(iso: string) {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 7 ? `${y}-07-01` : `${y - 1}-07-01`;
}

async function docSum(types: string[], from: string, to: string) {
  const [r] = await getDb().execute<{ s: string | null }>(sql`
    select sum(total) s from documents where status = 'Approved' and type in (${sql.join(
      types.map((x) => sql`${x}`),
      sql`, `,
    )}) and date between ${from} and ${to}`);
  return n(r?.s);
}
const netSales = async (from: string, to: string) =>
  round2((await docSum(["SI"], from, to)) - (await docSum(["SR"], from, to)));
const netPurchases = async (from: string, to: string) =>
  round2((await docSum(["PI"], from, to)) - (await docSum(["PR"], from, to)));

export const getDashboard = createServerFn({ method: "GET" })
  .validator(range)
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "dashboard.view");
      const db = getDb();
      const today = todayISO();
      const fin = user.permissions.has("reports.view") || user.permissions.has("accounts.manage");
      const prevDay = addDays(today, -1);
      const lastMonthEnd = addDays(monthStart(today), -1);
      const lastMonthSameDay = `${lastMonthEnd.slice(0, 8)}${today.slice(8) > lastMonthEnd.slice(8) ? lastMonthEnd.slice(8) : today.slice(8)}`;

      const kpis = {
        todaySales: await netSales(today, today),
        yesterdaySales: await netSales(prevDay, prevDay),
        monthSales: await netSales(monthStart(today), today),
        lastMonthSales: await netSales(monthStart(lastMonthEnd), lastMonthSameDay),
        yearSales: await netSales(fyStartFor(today), today),
        todayPurchases: await netPurchases(today, today),
        monthPurchases: await netPurchases(monthStart(today), today),
        lastMonthPurchases: await netPurchases(monthStart(lastMonthEnd), lastMonthSameDay),
        todayExpenses: await docSum(["EXP"], today, today),
        monthExpenses: await docSum(["EXP"], monthStart(today), today),
        lastMonthExpenses: await docSum(["EXP"], monthStart(lastMonthEnd), lastMonthSameDay),
      };
      const pl = fin ? await profitAndLoss(data.from, data.to) : null;

      const bal = await db.execute<{ key: string; bal: string }>(sql`
      select a.system_key key, sum(g.debit - g.credit) bal from gl_entries g join accounts a on a.id = g.account_id
      where a.system_key in ('AR', 'AP', 'CASH') group by a.system_key`);
      const b = new Map(bal.map((r) => [r.key, n(r.bal)]));
      const overdue = await db.execute<{ type: string; amt: string }>(sql`
      select type, sum(total - paid_amount - credited_amount) amt from documents
      where type in ('SI', 'PI') and status = 'Approved' and due_date < ${today} and total > paid_amount + credited_amount group by type`);
      const od = new Map(overdue.map((r) => [r.type, n(r.amt)]));
      const banks = await db.execute<{ name: string; account_no: string; bal: string }>(sql`
      select b.name, b.account_no, coalesce(sum(g.debit - g.credit), 0) bal from bank_accounts b
      left join gl_entries g on g.account_id = b.account_id where b.status = 'Active' group by b.id, b.name, b.account_no order by b.name`);

      const products = await db.select().from(t.products).where(eq(t.products.status, "Active"));
      const low = products.filter((p) => p.stockQty > 0 && p.stockQty <= p.minStock);
      const out = products.filter((p) => p.stockQty <= 0);
      const [samples] = await db.execute<{ slips: string; qty: string }>(sql`
      select count(distinct d.id) slips, coalesce(sum(l.qty - l.done_qty), 0) qty from documents d join document_lines l on l.document_id = d.id
      where d.type = 'SMP' and d.status = 'Approved' and l.qty > l.done_qty`);

      const top = await db.execute<Record<string, string>>(sql`
      select p.code, p.name, sum(case when d.type = 'SI' then l.qty else -l.qty end) qty,
             sum(case when d.type = 'SI' then 1 else -1 end * l.amount * (d.subtotal - d.discount) / nullif(d.subtotal, 0)) value
      from documents d join document_lines l on l.document_id = d.id join products p on p.id = l.product_id
      where d.type in ('SI', 'SR') and d.status = 'Approved' and d.date between ${data.from} and ${data.to}
      group by p.id, p.code, p.name order by qty desc limit 5`);
      const pending = await db.execute<Record<string, string>>(sql`
      select d.id, d.doc_no, d.date::text, c.name customer, d.total, sum(l.qty) qty, sum(l.done_qty) done
      from documents d join customers c on c.id = d.party_id join document_lines l on l.document_id = d.id
      where d.type = 'SO' and d.status = 'Approved' group by d.id, d.doc_no, d.date, c.name, d.total
      having sum(l.done_qty) < sum(l.qty) order by d.date limit 6`);
      const recent = await db.execute<Record<string, string>>(sql`
      select d.id, d.doc_no, d.type, d.date::text, d.status, d.total,
             coalesce(c.name, s.name, st.name, h.name, d.narration) party
      from documents d left join customers c on c.id = d.party_id and d.party_type = 'customer'
      left join suppliers s on s.id = d.party_id and d.party_type = 'supplier'
      left join staff st on st.id = d.party_id and d.party_type = 'staff'
      left join expense_heads h on h.id = d.expense_head_id
      where d.type in ('SI', 'SR', 'RV', 'PI', 'PR', 'PV', 'EXP', 'SMP', 'JV')
      order by d.created_at desc limit 8`);

      // Monthly trends over the 12 months ending at the range end.
      const trend = await db.execute<Record<string, string>>(sql`
      with months as (select to_char(generate_series(date_trunc('month', ${data.to}::date) - interval '11 months', date_trunc('month', ${data.to}::date), interval '1 month'), 'YYYY-MM') m)
      select m.m as month,
        coalesce(sum(case when d.type = 'SI' then d.total when d.type = 'SR' then -d.total end), 0) sales,
        coalesce(sum(case when d.type = 'PI' then d.total when d.type = 'PR' then -d.total end), 0) purchases,
        coalesce(sum(case when d.type = 'EXP' then d.total end), 0) expenses
      from months m left join documents d on to_char(d.date, 'YYYY-MM') = m.m and d.status = 'Approved'
      group by m.m order by m.m`);
      const profit = fin
        ? await db.execute<{ month: string; profit: string }>(sql`
      select to_char(g.date, 'YYYY-MM') as month, sum(g.credit - g.debit) profit
      from gl_entries g join accounts a on a.id = g.account_id join documents d on d.id = g.document_id
      where a.type in ('Income', 'Expense') and d.type <> 'CLOSE' and g.date > (date_trunc('month', ${data.to}::date) - interval '12 months')
      group by month`)
        : [];
      const pm = new Map(profit.map((p) => [p.month, n(p.profit)]));
      const stockByCategory = Object.entries(
        products.reduce<Record<string, number>>((acc, p) => {
          acc[p.category] = round2((acc[p.category] ?? 0) + Math.max(0, p.stockQty) * p.avgCost);
          return acc;
        }, {}),
      ).map(([name, value]) => ({ name, value }));

      return {
        today,
        kpis,
        grossProfit: pl?.grossProfit ?? null,
        netProfit: pl?.netProfit ?? null,
        rangeSales: await netSales(data.from, data.to),
        receivables: fin ? (b.get("AR") ?? 0) : null,
        receivablesOverdue: fin ? (od.get("SI") ?? 0) : null,
        payables: fin ? -(b.get("AP") ?? 0) : null,
        payablesOverdue: fin ? (od.get("PI") ?? 0) : null,
        cash: fin ? (b.get("CASH") ?? 0) : null,
        banks: fin
          ? toRows(banks.map((x) => ({ name: x.name, accountNo: x.account_no, balance: n(x.bal) })))
          : [],
        stockUnits: products.reduce((s, p) => s + Math.max(0, p.stockQty), 0),
        stockValue: round2(products.reduce((s, p) => s + Math.max(0, p.stockQty) * p.avgCost, 0)),
        lowStock: toRows(
          low.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            stockQty: p.stockQty,
            minStock: p.minStock,
          })),
        ),
        outOfStock: toRows(
          out.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            stockQty: p.stockQty,
            minStock: p.minStock,
          })),
        ),
        outstandingSamples: { slips: Number(samples?.slips ?? 0), qty: Number(samples?.qty ?? 0) },
        topBooks: toRows(
          top.map((r) => ({
            code: r["code"],
            name: r["name"],
            qty: Number(r["qty"]),
            value: n(r["value"]),
          })),
        ),
        pendingOrders: toRows(
          pending.map((r) => ({
            id: r["id"],
            docNo: r["doc_no"],
            date: r["date"],
            customer: r["customer"],
            total: n(r["total"]),
            qty: Number(r["qty"]),
            delivered: Number(r["done"]),
            status: Number(r["done"]) > 0 ? "Partial" : "Pending",
          })),
        ),
        recent: toRows(
          recent.map((r) => ({
            id: r["id"],
            docNo: r["doc_no"],
            type: r["type"],
            date: r["date"],
            status: r["status"],
            total: n(r["total"]),
            party: r["party"],
          })),
        ),
        trend: toRows(
          trend.map((r) => ({
            month: r["month"],
            sales: n(r["sales"]),
            purchases: n(r["purchases"]),
            expenses: n(r["expenses"]),
            profit: fin ? (pm.get(r["month"]!) ?? 0) : 0,
          })),
        ),
        stockByCategory: toRows(stockByCategory),
        canSeeFinance: fin,
      };
    }),
  );

/* --------------------------------------------- management & comparisons */

/** Monthly management accounts: month and year-to-date figures side by side. */
export const getMonthlyManagement = createServerFn({ method: "GET" })
  .validator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const from = `${data.month}-01`;
      const to = new Date(
        Date.UTC(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);
      const ytdFrom = fyStartFor(from);
      const [m, y] = await Promise.all([profitAndLoss(from, to), profitAndLoss(ytdFrom, to)]);
      const bs = await balanceSheet(to);
      const key = (k: string) =>
        bs.lines.filter((l) => l.name.startsWith(k)).reduce((s, l) => s + l.amount, 0);
      const [ar] = await getDb().execute<{ bal: string }>(
        sql`select coalesce(sum(g.debit - g.credit),0) bal from gl_entries g join accounts a on a.id = g.account_id where a.system_key = 'AR' and g.date <= ${to}`,
      );
      const [ap] = await getDb().execute<{ bal: string }>(
        sql`select coalesce(sum(g.credit - g.debit),0) bal from gl_entries g join accounts a on a.id = g.account_id where a.system_key = 'AP' and g.date <= ${to}`,
      );
      const [inv] = await getDb().execute<{ bal: string }>(
        sql`select coalesce(sum(g.debit - g.credit),0) bal from gl_entries g join accounts a on a.id = g.account_id where a.system_key = 'INVENTORY' and g.date <= ${to}`,
      );
      const [cash] = await getDb().execute<{ bal: string }>(
        sql`select coalesce(sum(g.debit - g.credit),0) bal from gl_entries g join accounts a on a.id = g.account_id where (a.system_key = 'CASH' or a.parent_id = (select id from accounts where system_key = 'BANK_GROUP')) and g.date <= ${to}`,
      );
      return {
        period: { from, to, ytdFrom },
        rows: toRows([
          { item: "Net sales", month: await netSales(from, to), ytd: await netSales(ytdFrom, to) },
          {
            item: "Purchases (net)",
            month: await netPurchases(from, to),
            ytd: await netPurchases(ytdFrom, to),
          },
          { item: "Revenue (P&L)", month: m.revenue, ytd: y.revenue },
          { item: "Cost of sales", month: m.costOfSales, ytd: y.costOfSales },
          { item: "Gross profit", month: m.grossProfit, ytd: y.grossProfit },
          { item: "Operating expenses", month: m.expenses, ytd: y.expenses },
          { item: "Net profit", month: m.netProfit, ytd: y.netProfit },
        ]),
        position: toRows([
          { item: "Stock value", amount: n(inv?.bal) },
          { item: "Receivables", amount: n(ar?.bal) },
          { item: "Payables", amount: n(ap?.bal) },
          { item: "Cash & bank", amount: n(cash?.bal) },
          { item: "Bank borrowings", amount: round2(key("Bank Borrowings")) },
          { item: "Total assets", amount: bs.assets },
          { item: "Equity", amount: bs.equity },
        ]),
      };
    }),
  );

/** Two-period comparison of the P&L with variance. */
export const getComparative = createServerFn({ method: "GET" })
  .validator(z.object({ a: range, b: range }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser();
      const [A, B] = await Promise.all([
        profitAndLoss(data.a.from, data.a.to),
        profitAndLoss(data.b.from, data.b.to),
      ]);
      const keys = new Map<string, { section: string; name: string }>();
      for (const l of [...A.lines, ...B.lines])
        keys.set(l.code, { section: l.section, name: l.name });
      const val = (ls: typeof A.lines, code: string) =>
        ls.find((l) => l.code === code)?.amount ?? 0;
      const row = (item: string, a: number, b: number, section = "") => ({
        section,
        item,
        current: a,
        previous: b,
        change: round2(a - b),
        changePct: b ? round2(((a - b) / Math.abs(b)) * 100) : null,
      });
      const detail = [...keys]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([code, k]) =>
          row(`${code} ${k.name}`, val(A.lines, code), val(B.lines, code), k.section),
        );
      return {
        summary: toRows([
          row("Revenue", A.revenue, B.revenue),
          row("Cost of sales", A.costOfSales, B.costOfSales),
          row("Gross profit", A.grossProfit, B.grossProfit),
          row("Operating expenses", A.expenses, B.expenses),
          row("Net profit", A.netProfit, B.netProfit),
        ]),
        detail: toRows(detail),
      };
    }),
  );

/** Bank finance pack: position, stock, debtors, creditors and borrowings as at a date. */
export const getBankFinancePack = createServerFn({ method: "GET" })
  .validator(z.object({ asOf: isoDate }))
  .handler(({ data }) =>
    safe(async () => {
      await reportUser("reports.view");
      const ytdFrom = fyStartFor(data.asOf);
      const [bs, pl] = await Promise.all([
        balanceSheet(data.asOf),
        profitAndLoss(ytdFrom, data.asOf),
      ]);
      const stock = await getDb().execute<Record<string, string>>(sql`
      select p.category, sum(s.qty_in - s.qty_out) qty, sum(case when s.qty_in > 0 then s.value else -s.value end) value
      from stock_ledger s join products p on p.id = s.product_id where s.date <= ${data.asOf} group by p.category order by p.category`);
      const ageing = await getDb().execute<Record<string, string>>(sql`
      select d.type,
        sum(case when coalesce(d.due_date, d.date) >= ${data.asOf}::date then d.total - d.paid_amount - d.credited_amount else 0 end) current,
        sum(case when ${data.asOf}::date - coalesce(d.due_date, d.date) between 1 and 90 then d.total - d.paid_amount - d.credited_amount else 0 end) d1_90,
        sum(case when ${data.asOf}::date - coalesce(d.due_date, d.date) > 90 then d.total - d.paid_amount - d.credited_amount else 0 end) d90plus
      from documents d where d.type in ('SI', 'PI') and d.status = 'Approved' and d.date <= ${data.asOf} group by d.type`);
      const borrowings = bs.lines.filter(
        (l) => /borrow|loan|finance/i.test(l.name) && l.section === "Liabilities",
      );
      return {
        balanceSheet: { ...bs, lines: toRows(bs.lines) },
        profitLoss: { ...pl, lines: toRows(pl.lines), from: ytdFrom },
        stock: toRows(
          stock.map((s) => ({
            category: s["category"],
            qty: Number(s["qty"]),
            value: n(s["value"]),
          })),
        ),
        ageing: toRows(
          ageing.map((a) => ({
            kind: a["type"] === "SI" ? "Receivables" : "Payables",
            current: n(a["current"]),
            d1_90: n(a["d1_90"]),
            d90plus: n(a["d90plus"]),
            total: round2(n(a["current"]) + n(a["d1_90"]) + n(a["d90plus"])),
          })),
        ),
        borrowings: toRows(borrowings),
      };
    }),
  );
