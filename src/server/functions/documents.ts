import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { assertPerm, requireUser, type SessionUser } from "../security/session";
import {
  approveDocument,
  cancelDocument,
  createDocument,
  rejectDocument,
  submitDocument,
  updateDraft,
  visibleTypes,
} from "../posting/engine";
import { docInputSchema, salaryPayable, staffAdvances } from "../posting/prepare";
import { fail } from "../posting/context";
import { safe, toRows, type Row } from "./_safe";
import {
  DOC_DEFS,
  deliveryStatus,
  payStatus,
  round2,
  sampleStatus,
  todayISO,
  type DocStatus,
  type DocType,
} from "@/shared/documents";

const docTypeEnum = z.enum(Object.keys(DOC_DEFS) as [DocType, ...DocType[]]);
const creator = alias(t.users, "creator");
const approver = alias(t.users, "approver");

function canSee(user: SessionUser, type: DocType) {
  if (!visibleTypes(user).includes(type)) fail("You do not have access to these documents.");
}

async function partyNames(partyIds: string[]) {
  const ids = [...new Set(partyIds.filter(Boolean))];
  if (!ids.length) return new Map<string, { name: string; code: string }>();
  const db = getDb();
  const [c, s, st] = await Promise.all([
    db
      .select({ id: t.customers.id, name: t.customers.name, code: t.customers.code })
      .from(t.customers)
      .where(inArray(t.customers.id, ids)),
    db
      .select({ id: t.suppliers.id, name: t.suppliers.name, code: t.suppliers.code })
      .from(t.suppliers)
      .where(inArray(t.suppliers.id, ids)),
    db
      .select({ id: t.staff.id, name: t.staff.name, code: t.staff.empId })
      .from(t.staff)
      .where(inArray(t.staff.id, ids)),
  ]);
  return new Map([...c, ...s, ...st].map((p) => [p.id, { name: p.name, code: p.code }]));
}

export const listDocuments = createServerFn({ method: "GET" })
  .validator(
    z.object({
      types: z.array(docTypeEnum).min(1).max(5),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      partyId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(5000).default(2000),
    }),
  )
  .handler(({ data }) =>
    safe(async (): Promise<Row[]> => {
      const user = await requireUser();
      for (const type of data.types) canSee(user, type);
      const db = getDb();
      const rows = await db
        .select({
          d: t.documents,
          createdByName: creator.name,
          approvedByName: approver.name,
          head: t.expenseHeads.name,
        })
        .from(t.documents)
        .leftJoin(creator, eq(creator.id, t.documents.createdBy))
        .leftJoin(approver, eq(approver.id, t.documents.approvedBy))
        .leftJoin(t.expenseHeads, eq(t.expenseHeads.id, t.documents.expenseHeadId))
        .where(
          and(
            inArray(t.documents.type, data.types),
            data.from ? gte(t.documents.date, data.from) : undefined,
            data.to ? lte(t.documents.date, data.to) : undefined,
            data.partyId ? eq(t.documents.partyId, data.partyId) : undefined,
          ),
        )
        .orderBy(desc(t.documents.date), desc(t.documents.docNo))
        .limit(data.limit);
      const names = await partyNames(rows.map((r) => r.d.partyId ?? ""));
      const lineAgg = new Map<string, { qty: number; done: number }>();
      const needLines = rows
        .filter((r) => r.d.type === "SO" || r.d.type === "SMP")
        .map((r) => r.d.id);
      if (needLines.length) {
        const agg = await db
          .select({
            id: t.documentLines.documentId,
            qty: sql<number>`sum(${t.documentLines.qty})::int`,
            done: sql<number>`sum(${t.documentLines.doneQty})::int`,
          })
          .from(t.documentLines)
          .where(inArray(t.documentLines.documentId, needLines))
          .groupBy(t.documentLines.documentId);
        for (const a of agg) lineAgg.set(a.id, { qty: a.qty, done: a.done });
      }
      const today = todayISO();
      return toRows(
        rows.map(({ d, createdByName, approvedByName, head }) => {
          const p = names.get(d.partyId ?? "");
          const agg = lineAgg.get(d.id) ?? { qty: 0, done: 0 };
          const derived =
            d.type === "SI" || d.type === "PI"
              ? payStatus(d, today)
              : d.type === "SO"
                ? deliveryStatus(d.status, [{ qty: agg.qty, doneQty: agg.done }])
                : d.type === "SMP"
                  ? sampleStatus(
                      d.status,
                      [{ qty: agg.qty, doneQty: agg.done }],
                      d.extra["expectedReturn"] as string | undefined,
                      today,
                    )
                  : d.status;
          return {
            id: d.id,
            type: d.type,
            docNo: d.docNo,
            date: d.date,
            status: d.status,
            progress: derived,
            partyId: d.partyId,
            partyName: p?.name ?? null,
            partyCode: p?.code ?? null,
            dueDate: d.dueDate,
            reference: d.reference,
            narration: d.narration,
            method: d.method,
            kind: d.kind,
            expenseHead: head,
            subtotal: d.subtotal,
            discount: d.discount,
            taxAmount: d.taxAmount,
            total: d.total,
            paidAmount: d.paidAmount,
            creditedAmount: d.creditedAmount,
            outstanding:
              d.type === "SI" || d.type === "PI"
                ? d.status === "Approved"
                  ? round2(d.total - d.paidAmount - d.creditedAmount)
                  : 0
                : null,
            qty: agg.qty || null,
            doneQty: agg.done || null,
            createdByName,
            approvedByName,
            createdAt: d.createdAt,
            cancelReason: d.cancelReason,
            reason: (d.extra["reason"] as string) ?? null,
            issuedTo: (d.extra["issuedTo"] as string) ?? null,
            purpose: (d.extra["purpose"] as string) ?? null,
            expectedReturn: (d.extra["expectedReturn"] as string) ?? null,
            month: (d.extra["month"] as string) ?? null,
            condition: (d.extra["condition"] as string) ?? null,
            loanType: (d.extra["loanType"] as string) ?? null,
            installment: (d.extra["installment"] as number) ?? null,
          };
        }),
      );
    }),
  );

export interface DocumentDetail {
  doc: Row;
  lines: Row[];
  allocations: Row[];
  gl: Row[];
  stock: Row[];
  history: Row[];
  related: Row[];
  can: { edit: boolean; submit: boolean; approve: boolean; reject: boolean; cancel: boolean };
}

export const getDocument = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async (): Promise<DocumentDetail> => {
      const user = await requireUser();
      const db = getDb();
      const [row] = await db
        .select({
          d: t.documents,
          createdByName: creator.name,
          approvedByName: approver.name,
          bank: t.bankAccounts.name,
          head: t.expenseHeads.name,
          fy: t.financialYears.status,
        })
        .from(t.documents)
        .leftJoin(creator, eq(creator.id, t.documents.createdBy))
        .leftJoin(approver, eq(approver.id, t.documents.approvedBy))
        .leftJoin(t.bankAccounts, eq(t.bankAccounts.id, t.documents.bankAccountId))
        .leftJoin(t.expenseHeads, eq(t.expenseHeads.id, t.documents.expenseHeadId))
        .innerJoin(t.financialYears, eq(t.financialYears.id, t.documents.fyId))
        .where(eq(t.documents.id, data.id));
      if (!row) return fail("Document not found.");
      const d = row.d;
      canSee(user, d.type);
      const def = DOC_DEFS[d.type];

      const lines = await db
        .select({
          l: t.documentLines,
          productCode: t.products.code,
          productName: t.products.name,
          accountCode: t.accounts.code,
          accountName: t.accounts.name,
        })
        .from(t.documentLines)
        .leftJoin(t.products, eq(t.products.id, t.documentLines.productId))
        .leftJoin(t.accounts, eq(t.accounts.id, t.documentLines.accountId))
        .where(eq(t.documentLines.documentId, d.id))
        .orderBy(asc(t.documentLines.lineNo));
      const names = await partyNames([d.partyId ?? "", ...lines.map((l) => l.l.partyId ?? "")]);
      const allocations = await db
        .select({
          a: t.allocations,
          inv: t.documents.docNo,
          invDate: t.documents.date,
          invTotal: t.documents.total,
        })
        .from(t.allocations)
        .innerJoin(t.documents, eq(t.documents.id, t.allocations.invoiceId))
        .where(eq(t.allocations.paymentId, d.id));
      const paidBy = await db
        .select({
          a: t.allocations,
          no: t.documents.docNo,
          date: t.documents.date,
          status: t.documents.status,
        })
        .from(t.allocations)
        .innerJoin(t.documents, eq(t.documents.id, t.allocations.paymentId))
        .where(eq(t.allocations.invoiceId, d.id));
      const gl = await db
        .select({ g: t.glEntries, code: t.accounts.code, name: t.accounts.name })
        .from(t.glEntries)
        .innerJoin(t.accounts, eq(t.accounts.id, t.glEntries.accountId))
        .where(eq(t.glEntries.documentId, d.id))
        .orderBy(asc(t.glEntries.id));
      const stock = await db
        .select({ s: t.stockLedger, code: t.products.code, name: t.products.name })
        .from(t.stockLedger)
        .innerJoin(t.products, eq(t.products.id, t.stockLedger.productId))
        .where(eq(t.stockLedger.documentId, d.id))
        .orderBy(asc(t.stockLedger.id));
      const history = await db
        .select({
          at: t.auditLog.at,
          user: t.auditLog.userName,
          action: t.auditLog.action,
          details: t.auditLog.details,
        })
        .from(t.auditLog)
        .where(eq(t.auditLog.entityId, d.id))
        .orderBy(asc(t.auditLog.id));
      const related = await db
        .select({
          id: t.documents.id,
          type: t.documents.type,
          docNo: t.documents.docNo,
          date: t.documents.date,
          status: t.documents.status,
          total: t.documents.total,
        })
        .from(t.documents)
        .where(sql`${t.documents.refDocId} = ${d.id} or ${t.documents.id} = ${d.refDocId ?? null}`);

      const open = row.fy === "Open";
      const today = todayISO();
      const allLines = lines.map((l) => ({ qty: l.l.qty, doneQty: l.l.doneQty }));
      const p = names.get(d.partyId ?? "");
      return {
        doc: toRows([
          {
            ...d,
            extra: null,
            ...Object.fromEntries(
              Object.entries(d.extra).map(([k, v]) => [k, v as string | number | null]),
            ),
            partyName: p?.name ?? null,
            partyCode: p?.code ?? null,
            createdByName: row.createdByName,
            approvedByName: row.approvedByName,
            bankName: row.bank,
            expenseHead: row.head,
            typeLabel: def.label,
            progress:
              d.type === "SI" || d.type === "PI"
                ? payStatus(d, today)
                : d.type === "SO"
                  ? deliveryStatus(d.status, allLines)
                  : d.type === "SMP"
                    ? sampleStatus(
                        d.status,
                        allLines,
                        d.extra["expectedReturn"] as string | undefined,
                        today,
                      )
                    : d.status,
            outstanding: round2(d.total - d.paidAmount - d.creditedAmount),
          },
        ])[0]!,
        lines: toRows(
          lines.map(({ l, ...names2 }) => ({
            ...l,
            extra: null,
            ...Object.fromEntries(
              Object.entries(l.extra).map(([k, v]) => [k, v as string | number | null]),
            ),
            ...names2,
            partyName: names.get(l.partyId ?? "")?.name ?? null,
          })),
        ),
        allocations: toRows([
          ...allocations.map((a) => ({
            id: a.a.id,
            invoiceId: a.a.invoiceId,
            docNo: a.inv,
            date: a.invDate,
            total: a.invTotal,
            amount: a.a.amount,
            direction: "allocated to",
          })),
          ...paidBy
            .filter((p2) => p2.status !== "Cancelled")
            .map((p2) => ({
              id: p2.a.id,
              invoiceId: p2.a.paymentId,
              docNo: p2.no,
              date: p2.date,
              total: null,
              amount: p2.a.amount,
              direction: "paid by",
            })),
        ]),
        gl: toRows(
          gl.map((g) => ({
            date: g.g.date,
            account: `${g.code} ${g.name}`,
            debit: g.g.debit,
            credit: g.g.credit,
            party: names.get(g.g.partyId ?? "")?.name ?? null,
            narration: g.g.narration,
            reversal: g.g.isReversal,
          })),
        ),
        stock: toRows(
          stock.map((s) => ({
            product: `${s.code} ${s.name}`,
            qtyIn: s.s.qtyIn,
            qtyOut: s.s.qtyOut,
            unitCost: s.s.unitCost,
            value: s.s.value,
            balanceQty: s.s.balanceQty,
            reversal: s.s.isReversal,
          })),
        ),
        history: toRows(history),
        related: toRows(related.map((r) => ({ ...r, typeLabel: DOC_DEFS[r.type].label }))),
        can: {
          edit: open && d.status === "Draft" && user.permissions.has(def.createPerm),
          submit:
            open &&
            d.status === "Draft" &&
            user.permissions.has(def.createPerm) &&
            !def.autoApprove,
          approve:
            open &&
            (d.status === "Draft" || d.status === "Pending") &&
            user.permissions.has(def.approvePerm),
          reject: open && d.status === "Pending" && user.permissions.has(def.approvePerm),
          cancel:
            open &&
            d.type !== "CLOSE" &&
            (d.status === "Approved"
              ? user.permissions.has("docs.cancel")
              : d.status !== "Cancelled" &&
                (user.permissions.has(def.createPerm) || user.permissions.has(def.approvePerm))),
        },
      };
    }),
  );

export const saveDocument = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid().nullish(), input: docInputSchema }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      return data.id ? updateDraft(user, data.id, data.input) : createDocument(user, data.input);
    }),
  );

export const transitionDocument = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      action: z.enum(["submit", "approve", "reject", "cancel"]),
      reason: z.string().max(500).default(""),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      if (data.action === "submit") await submitDocument(user, data.id);
      else if (data.action === "approve") await approveDocument(user, data.id);
      else if (data.action === "reject") await rejectDocument(user, data.id, data.reason);
      else await cancelDocument(user, data.id, data.reason);
      return { ok: true };
    }),
  );

/** Approved invoices with an outstanding balance, for receipt/payment allocation. */
export const openInvoices = createServerFn({ method: "GET" })
  .validator(z.object({ type: z.enum(["SI", "PI"]), partyId: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      canSee(user, data.type);
      const rows = await getDb()
        .select()
        .from(t.documents)
        .where(
          and(
            eq(t.documents.type, data.type),
            eq(t.documents.partyId, data.partyId),
            eq(t.documents.status, "Approved"),
            sql`${t.documents.total} > ${t.documents.paidAmount} + ${t.documents.creditedAmount}`,
          ),
        )
        .orderBy(asc(t.documents.dueDate), asc(t.documents.date));
      return toRows(
        rows.map((d) => ({
          id: d.id,
          docNo: d.docNo,
          date: d.date,
          dueDate: d.dueDate,
          total: d.total,
          outstanding: round2(d.total - d.paidAmount - d.creditedAmount),
        })),
      );
    }),
  );

/** Approved documents of a type for a party (originals for returns / order-to-invoice). */
export const sourceDocuments = createServerFn({ method: "GET" })
  .validator(
    z.object({
      type: z.enum(["SO", "SI", "PI", "SMP", "PAYROLL"]),
      partyId: z.string().uuid().optional(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      canSee(user, data.type);
      const db = getDb();
      const docs = await db
        .select()
        .from(t.documents)
        .where(
          and(
            eq(t.documents.type, data.type),
            eq(t.documents.status, "Approved"),
            data.partyId ? eq(t.documents.partyId, data.partyId) : undefined,
          ),
        )
        .orderBy(desc(t.documents.date))
        .limit(300);
      if (!docs.length) return { docs: [] as Row[], lines: [] as Row[] };
      const lines = await db
        .select({
          l: t.documentLines,
          code: t.products.code,
          name: t.products.name,
          accountName: t.accounts.name,
        })
        .from(t.documentLines)
        .leftJoin(t.products, eq(t.products.id, t.documentLines.productId))
        .leftJoin(t.accounts, eq(t.accounts.id, t.documentLines.accountId))
        .where(
          inArray(
            t.documentLines.documentId,
            docs.map((d) => d.id),
          ),
        )
        .orderBy(asc(t.documentLines.lineNo));
      const remaining = new Map<string, number>();
      for (const { l } of lines)
        remaining.set(l.documentId, (remaining.get(l.documentId) ?? 0) + l.qty - l.doneQty);
      const usable = docs.filter((d) => data.type === "PAYROLL" || (remaining.get(d.id) ?? 0) > 0);
      const ids = new Set(usable.map((d) => d.id));
      return {
        docs: toRows(
          usable.map((d) => ({
            id: d.id,
            docNo: d.docNo,
            date: d.date,
            total: d.total,
            kind: d.kind,
            month: (d.extra["month"] as string) ?? null,
          })),
        ),
        lines: toRows(
          lines
            .filter(({ l }) => ids.has(l.documentId))
            .map(({ l, code, name, accountName }) => ({
              id: l.id,
              documentId: l.documentId,
              productId: l.productId,
              accountId: l.accountId,
              description: l.description,
              product: code ? `${code} · ${name}` : (accountName ?? l.description),
              qty: l.qty,
              doneQty: l.doneQty,
              remaining: l.qty - l.doneQty,
              rate: l.rate,
              discountPct: l.discountPct,
            })),
        ),
      };
    }),
  );

/** Suggested payroll lines for a month: active staff, current salary, and advance recovery. */
export const payrollTemplate = createServerFn({ method: "GET" })
  .validator(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "payroll.manage");
      const db = getDb();
      const staff = await db
        .select()
        .from(t.staff)
        .where(eq(t.staff.employmentStatus, "Active"))
        .orderBy(asc(t.staff.empId));
      const advances = new Map((await staffAdvances(db)).map((r) => [r.staffId, r.balance]));
      const loans = await db
        .select({
          partyId: t.documents.partyId,
          installment: sql<number>`(${t.documents.extra}->>'installment')::numeric`,
        })
        .from(t.documents)
        .where(and(eq(t.documents.type, "LOAN"), eq(t.documents.status, "Approved")));
      const inst = new Map<string, number>();
      for (const l of loans)
        if (l.partyId) inst.set(l.partyId, (inst.get(l.partyId) ?? 0) + Number(l.installment));
      const monthEnd = new Date(
        Date.UTC(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);
      const absent = await db.execute<{ staff_id: string; n: string }>(sql`
      select staff_id, count(*) n from attendance where status = 'Absent' and to_char(date, 'YYYY-MM') = ${data.month} group by staff_id`);
      const absences = new Map(absent.map((a) => [a.staff_id, Number(a.n)]));
      return {
        date: monthEnd,
        lines: toRows(
          staff.map((s) => ({
            staffId: s.id,
            empId: s.empId,
            name: s.name,
            department: s.department,
            basic: s.basic,
            allowances: s.allowances,
            deductions: s.deductions,
            recovery: round2(Math.min(advances.get(s.id) ?? 0, inst.get(s.id) ?? 0)),
            advanceOutstanding: advances.get(s.id) ?? 0,
            absentDays: absences.get(s.id) ?? 0,
          })),
        ),
      };
    }),
  );

/** Unpaid net salary per staff member (after payroll approval). */
export const unpaidSalaries = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    const user = await requireUser();
    assertPerm(user, "payroll.manage", "payroll.approve");
    const db = getDb();
    const due = (await salaryPayable(db)).filter((r) => r.balance > 0);
    const names = await partyNames(due.map((d) => d.staffId));
    return toRows(
      due.map((d) => ({
        staffId: d.staffId,
        name: names.get(d.staffId)?.name ?? "",
        empId: names.get(d.staffId)?.code ?? "",
        balance: d.balance,
      })),
    );
  }),
);

/** Pending-approval counts for the topbar badge. */
export const pendingApprovals = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    const user = await requireUser();
    const types = (Object.keys(DOC_DEFS) as DocType[]).filter(
      (ty) => user.permissions.has(DOC_DEFS[ty].approvePerm) && !DOC_DEFS[ty].autoApprove,
    );
    if (!types.length) return toRows([]);
    const rows = await getDb()
      .select({
        id: t.documents.id,
        type: t.documents.type,
        docNo: t.documents.docNo,
        date: t.documents.date,
        total: t.documents.total,
        createdBy: t.documents.createdBy,
      })
      .from(t.documents)
      .where(
        and(
          inArray(t.documents.type, types),
          eq(t.documents.status, "Pending" as DocStatus),
          ne(t.documents.createdBy, user.id),
        ),
      )
      .orderBy(asc(t.documents.date))
      .limit(50);
    return toRows(rows.map((r) => ({ ...r, typeLabel: DOC_DEFS[r.type].label })));
  }),
);
