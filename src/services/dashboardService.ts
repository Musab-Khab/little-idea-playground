import {
  addDays, endOfWeek, format, isWithinInterval, parseISO, startOfMonth,
  startOfWeek, startOfYear, subWeeks,
} from "date-fns";
import { DEMO_TODAY, docTotal, chartOfAccounts, financialYears, salesTrend, profitTrend, purchasesVsExpenses } from "@/data/mockData";
import { partyBalance } from "@/services/moduleService";
import type { AppData, RangeKey } from "@/store/appStore";

export interface Range { from: Date; to: Date }
const today = parseISO(DEMO_TODAY);

export function resolveRange(key: RangeKey, customFrom?: string, customTo?: string): Range {
  switch (key) {
    case "today": return { from: today, to: today };
    case "week": return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today };
    case "month": return { from: startOfMonth(today), to: today };
    case "year": return { from: parseISO(financialYears[0]!.start), to: today };
    case "custom": return { from: parseISO(customFrom ?? DEMO_TODAY), to: parseISO(customTo ?? DEMO_TODAY) };
  }
}

const inRange = (d: string, r: Range) => isWithinInterval(parseISO(d), { start: r.from, end: r.to });
const approved = <T extends { docStatus: string }>(xs: T[]) => xs.filter((x) => x.docStatus === "Approved");

export function salesIn(data: AppData, r: Range) {
  return approved(data.salesInvoices).filter((i) => inRange(i.date, r)).reduce((s, i) => s + docTotal(i), 0);
}
export function purchasesIn(data: AppData, r: Range) {
  return approved(data.purchaseInvoices).filter((i) => inRange(i.date, r)).reduce((s, i) => s + docTotal(i), 0);
}
export function expensesIn(data: AppData, r: Range) {
  return approved(data.expenses).filter((e) => inRange(e.date, r)).reduce((s, e) => s + e.amount, 0);
}
export function cogsIn(data: AppData, r: Range) {
  const cost = new Map(data.books.map((b) => [b.id, b.costPrice]));
  return approved(data.salesInvoices)
    .filter((i) => inRange(i.date, r))
    .reduce((s, i) => s + i.items.reduce((a, l) => a + l.qty * (cost.get(l.bookId) ?? 0), 0), 0);
}

export function computeDashboard(data: AppData, r: Range) {
  const day = { from: today, to: today };
  const month = { from: startOfMonth(today), to: today };
  const year = resolveRange("year");

  const sales = salesIn(data, r);
  const grossProfit = sales - cogsIn(data, r);
  const netProfit = grossProfit - expensesIn(data, r);

  // Cash = opening cash + cash receipts - cash payments - cash expenses
  const cashOpening = chartOfAccounts.find((a) => a.code === "1000")?.opening ?? 0;
  const cashIn = approved(data.customerReceipts).filter((x) => x.method === "Cash").reduce((s, x) => s + x.amount, 0);
  const cashOut =
    approved(data.supplierPayments).filter((x) => x.method === "Cash").reduce((s, x) => s + x.amount, 0) +
    approved(data.expenses).filter((x) => x.method === "Cash").reduce((s, x) => s + x.amount, 0);
  const bank = data.bankAccounts.filter((b) => b.status === "Active").reduce((s, b) => s + b.current, 0);

  const openInv = approved(data.salesInvoices).filter((i) => i.payStatus !== "Paid");
  const receivables = data.customers.reduce((s, c) => s + partyBalance(data, c.id, true), 0);
  const receivablesOverdue = openInv.filter((i) => parseISO(i.dueDate) < today).reduce((s, i) => s + docTotal(i) - i.paidAmount, 0);
  const openPinv = approved(data.purchaseInvoices).filter((i) => i.payStatus !== "Paid");
  const payables = data.suppliers.reduce((s, c) => s + partyBalance(data, c.id, false), 0);
  const payablesOverdue = openPinv.filter((i) => parseISO(i.dueDate) < today).reduce((s, i) => s + docTotal(i) - i.paidAmount, 0);

  const active = data.books.filter((b) => b.status === "Active");
  const stockUnits = active.reduce((s, b) => s + b.availableStock, 0);
  const stockValue = active.reduce((s, b) => s + b.availableStock * b.costPrice, 0);
  const lowStock = active.filter((b) => b.availableStock > 0 && b.availableStock <= b.minStock).length;
  const outOfStock = active.filter((b) => b.availableStock === 0).length;
  const outstandingSamples = data.samples.filter((s) => s.status !== "Returned").length;

  return {
    todaySales: salesIn(data, day), monthSales: salesIn(data, month), yearSales: salesIn(data, year),
    todayPurchases: purchasesIn(data, day), monthPurchases: purchasesIn(data, month),
    todayExpenses: expensesIn(data, day), monthExpenses: expensesIn(data, month),
    rangeSales: sales, rangePurchases: purchasesIn(data, r), rangeExpenses: expensesIn(data, r),
    grossProfit, netProfit,
    cash: cashOpening + cashIn - cashOut, bank,
    receivables, receivablesOverdue, payables, payablesOverdue,
    stockUnits, stockValue, lowStock, outOfStock, outstandingSamples,
  };
}

/** Weekly series computed from transactions; monthly series uses seeded history. */
export function trendSeries(data: AppData, mode: "monthly" | "weekly") {
  if (mode === "monthly") {
    return Array.from({ length: 9 }, (_, i) => {
      const start = parseISO(`2025-${String(i + 1).padStart(2, "0")}-01`);
      const end = new Date(2025, i + 1, 0);
      const r = { from: start, to: end };
      const sales = salesIn(data, r); const expenses = expensesIn(data, r);
      return { label: format(start, "MMM"), sales, purchases: purchasesIn(data, r), expenses, profit: sales - cogsIn(data, r) - expenses };
    });
  }
  return Array.from({ length: 8 }, (_, k) => {
    const start = startOfWeek(subWeeks(today, 7 - k), { weekStartsOn: 1 });
    const r = { from: start, to: addDays(endOfWeek(start, { weekStartsOn: 1 }), 0) };
    const sales = salesIn(data, r);
    const expenses = expensesIn(data, r);
    return {
      label: format(start, "dd MMM"),
      sales,
      purchases: purchasesIn(data, r),
      expenses,
      profit: sales - cogsIn(data, r) - expenses,
    };
  });
}

export function stockByCategory(data: AppData) {
  const m = new Map<string, number>();
  data.books.filter((b) => b.status === "Active").forEach((b) => m.set(b.category, (m.get(b.category) ?? 0) + b.availableStock * b.costPrice));
  return [...m].map(([name, value]) => ({ name, value }));
}

export function topSellingBooks(data: AppData, r: Range, n = 5) {
  const m = new Map<string, { qty: number; amount: number }>();
  approved(data.salesInvoices).filter((i) => inRange(i.date, r)).forEach((i) =>
    i.items.forEach((l) => {
      const cur = m.get(l.bookId) ?? { qty: 0, amount: 0 };
      cur.qty += l.qty; cur.amount += l.qty * l.rate * (1 - l.discountPct / 100);
      m.set(l.bookId, cur);
    }));
  return [...m].map(([bookId, v]) => ({ book: data.books.find((b) => b.id === bookId)!, ...v }))
    .filter((x) => x.book).sort((a, b) => b.qty - a.qty).slice(0, n);
}

export function pendingOrders(data: AppData) {
  return data.salesOrders.filter((o) => o.status === "Pending" || o.status === "Partial").map((o) => ({
    ...o,
    customer: data.customers.find((c) => c.id === o.customerId)?.name ?? "-",
    amount: docTotal({ items: o.items }),
  }));
}

export function recentTransactions(data: AppData, n = 8) {
  const cust = (id: string) => data.customers.find((c) => c.id === id)?.name ?? "-";
  const sup = (id: string) => data.suppliers.find((c) => c.id === id)?.name ?? "-";
  const rows = [
    ...data.salesInvoices.map((i) => ({ date: i.date, at: i.createdAt, no: i.no, type: "Sales Invoice", party: cust(i.customerId), amount: docTotal(i), status: i.docStatus === "Approved" ? i.payStatus : i.docStatus })),
    ...data.customerReceipts.map((x) => ({ date: x.date, at: x.date, no: x.no, type: "Receipt", party: cust(x.customerId), amount: x.amount, status: x.docStatus })),
    ...data.purchaseInvoices.map((i) => ({ date: i.date, at: i.createdAt, no: i.no, type: "Purchase Invoice", party: sup(i.supplierId), amount: docTotal(i), status: i.docStatus === "Approved" ? i.payStatus : i.docStatus })),
    ...data.supplierPayments.map((x) => ({ date: x.date, at: x.date, no: x.no, type: "Payment", party: sup(x.supplierId), amount: x.amount, status: x.docStatus })),
    ...data.expenses.map((x) => ({ date: x.date, at: x.date, no: x.no, type: "Expense", party: x.head, amount: x.amount, status: x.docStatus })),
  ];
  return rows.sort((a, b) => (a.date === b.date ? b.no.localeCompare(a.no) : b.date.localeCompare(a.date))).slice(0, n);
}

