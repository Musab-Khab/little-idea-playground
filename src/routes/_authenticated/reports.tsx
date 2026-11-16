import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  AgeingReport,
  BalanceSheetReport,
  BankFinanceReport,
  CashBankReport,
  ComparativeReport,
  ExpenseReport,
  MonthlyManagementReport,
  MonthlyPackReport,
  PackReport,
  ProductReport,
  ProfitLossReport,
  PurchaseReport,
  SalesReport,
  SamplesReport,
  StatementReport,
  StockStatementReport,
  TrialBalanceReport,
} from "@/components/reports/Reports";
import { cn } from "@/lib/utils";

const REPORTS: { id: string; group: string; title: string; render: () => ReactNode }[] = [
  {
    id: "receiving",
    group: "Monthly Reports",
    title: "1. Receiving",
    render: () => <PackReport key="receipts" kind="receipts" />,
  },
  {
    id: "sales-product",
    group: "Monthly Reports",
    title: "2. Sales Report Product Wise",
    render: () => <PackReport key="salesByProduct" kind="salesByProduct" />,
  },
  {
    id: "sales-customer",
    group: "Monthly Reports",
    title: "3. Sales Report Customer Wise",
    render: () => <PackReport key="salesByCustomer" kind="salesByCustomer" />,
  },
  {
    id: "receivables",
    group: "Monthly Reports",
    title: "4. Receivables",
    render: () => <PackReport key="receivables" kind="receivables" />,
  },
  {
    id: "expense",
    group: "Monthly Reports",
    title: "5. Expense Report",
    render: () => <PackReport key="expenses" kind="expenses" />,
  },
  {
    id: "inventory",
    group: "Monthly Reports",
    title: "6. Inventory Report",
    render: () => <PackReport key="inventory" kind="inventory" />,
  },
  {
    id: "pack",
    group: "Monthly Reports",
    title: "Print all (Monthly Pack)",
    render: () => <MonthlyPackReport />,
  },
  {
    id: "pl",
    group: "Financial statements",
    title: "Profit & Loss",
    render: () => <ProfitLossReport />,
  },
  {
    id: "bs",
    group: "Financial statements",
    title: "Balance Sheet",
    render: () => <BalanceSheetReport />,
  },
  {
    id: "tb",
    group: "Financial statements",
    title: "Trial Balance",
    render: () => <TrialBalanceReport />,
  },
  {
    id: "cash",
    group: "Financial statements",
    title: "Cash & Bank",
    render: () => <CashBankReport />,
  },
  {
    id: "mma",
    group: "Management",
    title: "Monthly Management Accounts",
    render: () => <MonthlyManagementReport />,
  },
  {
    id: "compare",
    group: "Management",
    title: "Comparative Reports",
    render: () => <ComparativeReport />,
  },
  {
    id: "bank",
    group: "Management",
    title: "Bank Finance Report",
    render: () => <BankFinanceReport />,
  },
  {
    id: "cust-out",
    group: "Parties",
    title: "Customer Outstanding & Ageing",
    render: () => <AgeingReport key="c" partyType="customer" />,
  },
  {
    id: "supp-out",
    group: "Parties",
    title: "Supplier / Vendor Outstanding",
    render: () => <AgeingReport key="s" partyType="supplier" />,
  },
  {
    id: "cust-stmt",
    group: "Parties",
    title: "Customer Statements",
    render: () => <StatementReport key="c" partyType="customer" />,
  },
  {
    id: "supp-stmt",
    group: "Parties",
    title: "Supplier / Vendor Statements",
    render: () => <StatementReport key="s" partyType="supplier" />,
  },
  { id: "sales", group: "Operations", title: "Sales Reports", render: () => <SalesReport /> },
  {
    id: "purchases",
    group: "Operations",
    title: "Purchase Reports",
    render: () => <PurchaseReport />,
  },
  {
    id: "expenses",
    group: "Operations",
    title: "Expense Reports",
    render: () => <ExpenseReport />,
  },
  {
    id: "stock",
    group: "Operations",
    title: "Stock Statement (bank-ready)",
    render: () => <StockStatementReport />,
  },
  { id: "samples", group: "Operations", title: "Samples Report", render: () => <SamplesReport /> },
  {
    id: "product",
    group: "Operations",
    title: "Book / Product Report",
    render: () => <ProductReport />,
  },
];

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: z.object({ r: z.string().optional() }),
  head: () => ({ meta: [{ title: "Reports – Turnkey Publishers" }] }),
  component: ReportsHub,
});

function ReportsHub() {
  const { r } = Route.useSearch();
  const navigate = useNavigate({ from: "/reports" });
  const current = REPORTS.find((x) => x.id === r) ?? REPORTS[0]!;
  const groups = [...new Set(REPORTS.map((x) => x.group))];
  return (
    <div className="space-y-5">
      <PageHeader title="Reports" crumbs={["Home", "Reports", current.title]} />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr] print:block">
        <nav className="no-print card-surface h-fit space-y-4 p-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g}
              </p>
              {REPORTS.filter((x) => x.group === g).map((x) => (
                <button
                  key={x.id}
                  onClick={() => navigate({ search: { r: x.id } })}
                  className={cn(
                    "block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    x.id === current.id && "bg-primary/10 font-semibold text-primary",
                  )}
                >
                  {x.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="card-surface min-w-0 p-4" key={current.id}>
          {current.render()}
        </section>
      </div>
    </div>
  );
}
