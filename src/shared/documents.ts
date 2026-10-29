import type { Permission } from "./permissions";

export type DocType =
  | "SO"
  | "SI"
  | "SR"
  | "RV"
  | "PI"
  | "PR"
  | "PV"
  | "EXP"
  | "JV"
  | "SMP"
  | "SMR"
  | "ADJ"
  | "DMG"
  | "OB"
  | "PAYROLL"
  | "SALPAY"
  | "LOAN"
  | "CLOSE";
export type DocStatus = "Draft" | "Pending" | "Approved" | "Cancelled";
export type PartyType = "customer" | "supplier" | "staff";

export interface DocDef {
  label: string;
  /** Prefix for system-generated numbers, e.g. INV-2526-0001 */
  prefix: string;
  createPerm: Permission;
  approvePerm: Permission;
  partyType?: PartyType;
  /** Approved immediately on save (no approval step). */
  autoApprove?: boolean;
  /** The creator may not approve their own document (segregation of duties). */
  makerChecker?: boolean;
  /** Has product lines that move stock. */
  stock?: boolean;
  /** Money document paid in/out through cash or a bank account. */
  money?: boolean;
}

export const DOC_DEFS: Record<DocType, DocDef> = {
  SO: {
    label: "Sales Order",
    prefix: "SO",
    createPerm: "sales.create",
    approvePerm: "sales.create",
    partyType: "customer",
  },
  SI: {
    label: "Sales Invoice",
    prefix: "INV",
    createPerm: "sales.create",
    approvePerm: "sales.approve",
    partyType: "customer",
    makerChecker: true,
    stock: true,
  },
  SR: {
    label: "Sales Return",
    prefix: "SR",
    createPerm: "sales.create",
    approvePerm: "sales.approve",
    partyType: "customer",
    makerChecker: true,
    stock: true,
  },
  RV: {
    label: "Customer Receipt",
    prefix: "RV",
    createPerm: "sales.create",
    approvePerm: "sales.approve",
    partyType: "customer",
    makerChecker: true,
    money: true,
  },
  PI: {
    label: "Purchase Invoice",
    prefix: "PINV",
    createPerm: "purchases.create",
    approvePerm: "purchases.approve",
    partyType: "supplier",
    makerChecker: true,
    stock: true,
  },
  PR: {
    label: "Purchase Return",
    prefix: "PR",
    createPerm: "purchases.create",
    approvePerm: "purchases.approve",
    partyType: "supplier",
    makerChecker: true,
    stock: true,
  },
  PV: {
    label: "Supplier Payment",
    prefix: "PV",
    createPerm: "purchases.create",
    approvePerm: "purchases.approve",
    partyType: "supplier",
    makerChecker: true,
    money: true,
  },
  EXP: {
    label: "Expense",
    prefix: "EV",
    createPerm: "expenses.create",
    approvePerm: "expenses.approve",
    makerChecker: true,
    money: true,
  },
  JV: {
    label: "Journal Voucher",
    prefix: "JV",
    createPerm: "accounts.manage",
    approvePerm: "accounts.approve",
    makerChecker: true,
  },
  SMP: {
    label: "Sample Issue",
    prefix: "SMP",
    createPerm: "samples.manage",
    approvePerm: "samples.manage",
    partyType: "customer",
    autoApprove: true,
    stock: true,
  },
  SMR: {
    label: "Sample Return",
    prefix: "SMR",
    createPerm: "samples.manage",
    approvePerm: "samples.manage",
    partyType: "customer",
    autoApprove: true,
    stock: true,
  },
  ADJ: {
    label: "Stock Adjustment",
    prefix: "ADJ",
    createPerm: "inventory.manage",
    approvePerm: "inventory.approve",
    makerChecker: true,
    stock: true,
  },
  DMG: {
    label: "Damaged Stock",
    prefix: "DMG",
    createPerm: "inventory.manage",
    approvePerm: "inventory.approve",
    makerChecker: true,
    stock: true,
  },
  OB: {
    label: "Opening Balances",
    prefix: "OB",
    createPerm: "accounts.manage",
    approvePerm: "accounts.approve",
    stock: true,
  },
  PAYROLL: {
    label: "Payroll",
    prefix: "PAY",
    createPerm: "payroll.manage",
    approvePerm: "payroll.approve",
    makerChecker: true,
  },
  SALPAY: {
    label: "Salary Payment",
    prefix: "SP",
    createPerm: "payroll.manage",
    approvePerm: "payroll.approve",
    makerChecker: true,
    money: true,
  },
  LOAN: {
    label: "Staff Advance / Loan",
    prefix: "LN",
    createPerm: "payroll.manage",
    approvePerm: "payroll.approve",
    partyType: "staff",
    makerChecker: true,
    money: true,
  },
  CLOSE: {
    label: "Year Closing Entry",
    prefix: "CLS",
    createPerm: "settings.manage",
    approvePerm: "settings.manage",
  },
};

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export interface LineMathInput {
  qty?: number;
  rate?: number;
  discountPct?: number;
}

export const lineAmount = (l: LineMathInput) =>
  round2((l.qty ?? 0) * (l.rate ?? 0) * (1 - (l.discountPct ?? 0) / 100));

/** Invoice-style totals: line discounts, then document discount, then tax on the net. */
export function docTotals(lines: LineMathInput[], discount = 0, taxPct = 0) {
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const taxable = round2(subtotal - discount);
  const taxAmount = round2((taxable * taxPct) / 100);
  return { subtotal, taxable, taxAmount, total: round2(taxable + taxAmount) };
}

/** Splits `total` across weights, rounding to paisa, with the remainder on the largest share. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return weights.map(() => 0);
  const parts = weights.map((w) => round2((total * w) / sum));
  const diff = round2(total - parts.reduce((s, p) => s + p, 0));
  if (diff !== 0) {
    const i = weights.indexOf(Math.max(...weights));
    parts[i] = round2((parts[i] ?? 0) + diff);
  }
  return parts;
}

export type PayStatus = "Paid" | "Partially Paid" | "Unpaid" | "Overdue" | "Cancelled" | "Draft";

export function payStatus(
  doc: {
    status: DocStatus;
    total: number;
    paidAmount: number;
    creditedAmount: number;
    dueDate: string | null;
  },
  today: string,
): PayStatus {
  if (doc.status === "Cancelled") return "Cancelled";
  if (doc.status !== "Approved") return "Draft";
  const settled = round2(doc.paidAmount + doc.creditedAmount);
  if (settled >= doc.total) return "Paid";
  if (doc.dueDate && doc.dueDate < today) return "Overdue";
  return settled > 0 ? "Partially Paid" : "Unpaid";
}

export type DeliveryStatus = "Pending" | "Partial" | "Delivered" | "Cancelled";
export function deliveryStatus(
  status: DocStatus,
  lines: { qty: number; doneQty: number }[],
): DeliveryStatus {
  if (status === "Cancelled") return "Cancelled";
  const ordered = lines.reduce((s, l) => s + l.qty, 0);
  const done = lines.reduce((s, l) => s + l.doneQty, 0);
  return done === 0 ? "Pending" : done >= ordered ? "Delivered" : "Partial";
}

export type SampleStatus =
  "Issued" | "Partially Returned" | "Returned" | "Outstanding" | "Cancelled";
export function sampleStatus(
  status: DocStatus,
  lines: { qty: number; doneQty: number }[],
  expectedReturn: string | undefined,
  today: string,
): SampleStatus {
  if (status === "Cancelled") return "Cancelled";
  const issued = lines.reduce((s, l) => s + l.qty, 0);
  const returned = lines.reduce((s, l) => s + l.doneQty, 0);
  if (returned >= issued) return "Returned";
  if (returned > 0) return "Partially Returned";
  return expectedReturn && expectedReturn < today ? "Outstanding" : "Issued";
}

/** Local calendar date (YYYY-MM-DD) in Pakistan time, independent of server timezone. */
export function todayISO(timeZone = "Asia/Karachi") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
