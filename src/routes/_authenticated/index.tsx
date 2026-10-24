import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  CalendarDays, CalendarRange, TrendingUp, ShoppingBag, Package, Receipt, Wallet, PiggyBank,
  Coins, Landmark, HandCoins, CreditCard, Boxes, AlertTriangle, PackageX, BookOpenCheck,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import {
  computeDashboard, pendingOrders, recentTransactions, resolveRange, stockByCategory, topSellingBooks, trendSeries,
} from "@/services/dashboardService";
import { KpiCard } from "@/components/shared/KpiCard";
import { ChartCard, ModeToggle } from "@/components/shared/ChartCard";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatCompact, formatDate, formatPKR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard – MFAHH | Turnkey Publishers" },
      { name: "description", content: "Sales, purchases, stock and cash at a glance for Turnkey Publishers." },
      { property: "og:title", content: "Dashboard – MFAHH | Turnkey Publishers" },
      { property: "og:description", content: "Sales, purchases, stock and cash at a glance for Turnkey Publishers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const PIE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tooltipStyle = { borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 };

function Dashboard() {
  const navigate = useNavigate();
  const data = useAppStore((s) => s.data);
  const { range, customFrom, customTo } = useAppStore();
  const r = useMemo(() => resolveRange(range, customFrom, customTo), [range, customFrom, customTo]);
  const k = useMemo(() => computeDashboard(data, r), [data, r]);
  const [m1, setM1] = useState<"monthly" | "weekly">("monthly");
  const [m2, setM2] = useState<"monthly" | "weekly">("monthly");
  const [m3, setM3] = useState<"monthly" | "weekly">("monthly");
  const go = (p: string) => navigate({ to: "/$", params: { _splat: p } });

  const rangeLabel = { today: "Today", week: "This week", month: "This month", year: "This year", custom: "Custom range" }[range];

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" crumbs={["Home", "Dashboard"]} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard title="Today's Sales" value={formatPKR(k.todaySales)} icon={CalendarDays} tint="blue" trend="up" />
        <KpiCard title="Monthly Sales" value={formatPKR(k.monthSales)} icon={CalendarRange} tint="green" trend="up" />
        <KpiCard title="Yearly Sales" value={formatPKR(k.yearSales)} icon={TrendingUp} tint="purple" trend="up" />
        <KpiCard title="Today's Purchases" value={formatPKR(k.todayPurchases)} icon={ShoppingBag} tint="orange" />
        <KpiCard title="Monthly Purchases" value={formatPKR(k.monthPurchases)} icon={Package} tint="pink" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Today's Expenses" value={formatPKR(k.todayExpenses)} icon={Receipt} tint="pink" trend="down" />
        <KpiCard title="Monthly Expenses" value={formatPKR(k.monthExpenses)} icon={Wallet} tint="orange" />
        <KpiCard title="Gross Profit" sub={rangeLabel} value={formatPKR(k.grossProfit)} icon={PiggyBank} tint="green" trend={k.grossProfit >= 0 ? "up" : "down"} />
        <KpiCard title="Net Profit" sub={rangeLabel} value={formatPKR(k.netProfit)} icon={Coins} tint="blue" trend={k.netProfit >= 0 ? "up" : "down"} />
        <KpiCard title="Cash Balance" value={formatPKR(k.cash)} icon={HandCoins} tint="purple" />
        <KpiCard title="Bank Balance" value={formatPKR(k.bank)} icon={Landmark} tint="blue" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Receivables" value={formatPKR(k.receivables)} sub={`Overdue ${formatPKR(k.receivablesOverdue)}`} subTone="danger" icon={CreditCard} tint="green" onClick={() => go("customers")} />
        <KpiCard title="Payables" value={formatPKR(k.payables)} sub={`Overdue ${formatPKR(k.payablesOverdue)}`} subTone="danger" icon={Wallet} tint="pink" onClick={() => go("suppliers")} />
        <KpiCard title="Stock Summary" value={`${k.stockUnits.toLocaleString()} units`} sub={formatPKR(k.stockValue)} icon={Boxes} tint="blue" onClick={() => go("inventory/stock")} />
        <KpiCard title="Low Stock Alert" value={`${k.lowStock} items`} icon={AlertTriangle} tint="orange" onClick={() => go("inventory/stock")} />
        <KpiCard title="Out of Stock" value={`${k.outOfStock} items`} icon={PackageX} tint="pink" onClick={() => go("inventory/stock")} />
        <KpiCard title="Outstanding Samples" value={`${k.outstandingSamples} slips`} icon={BookOpenCheck} tint="purple" onClick={() => go("inventory/samples")} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Sales Trend" action={<ModeToggle value={m1} onChange={setM1} />}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendSeries(data, m1)}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Area isAnimationActive={false} type="monotone" dataKey="sales" name="Sales" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#salesFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Purchases vs Expenses" action={<ModeToggle value={m2} onChange={setM2} />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendSeries(data, m2)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar isAnimationActive={false} dataKey="purchases" name="Purchases" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="expenses" name="Expenses" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Profit Trend" action={<ModeToggle value={m3} onChange={setM3} />}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendSeries(data, m3)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Line isAnimationActive={false} type="monotone" dataKey="profit" name="Profit" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Stock Value by Category">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie isAnimationActive={false} data={stockByCategory(data)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {stockByCategory(data).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={`Top-Selling Books · ${rangeLabel}`}>
          <DataTable
            compact
            rows={topSellingBooks(data, r)}
            columns={[
              { key: "book", header: "Book", value: (x) => x.book.name, render: (x) => <span className="font-medium text-navy">{x.book.name}</span> },
              { key: "qty", header: "Qty", value: (x) => x.qty, align: "right" },
              { key: "amt", header: "Amount", value: (x) => x.amount, render: (x) => formatPKR(x.amount), align: "right" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Pending Orders">
          <DataTable
            compact
            rows={pendingOrders(data)}
            columns={[
              { key: "no", header: "Order", value: (o) => o.no, render: (o) => <span className="font-medium text-primary">{o.no}</span> },
              { key: "cust", header: "Customer", value: (o) => o.customer },
              { key: "amt", header: "Amount", value: (o) => o.amount, render: (o) => formatPKR(o.amount), align: "right" },
              { key: "st", header: "Status", value: (o) => o.status, render: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
        </ChartCard>
        <ChartCard title="Recent Transactions">
          <DataTable
            compact
            rows={recentTransactions(data, 6)}
            columns={[
              { key: "d", header: "Date", value: (t) => t.date, render: (t) => <span className="whitespace-nowrap text-xs">{formatDate(t.date)}</span> },
              { key: "no", header: "Ref", value: (t) => t.no, render: (t) => <span className="block font-medium text-navy">{t.no}<span className="block text-[11px] font-normal text-muted-foreground">{t.type}</span></span> },
              { key: "amt", header: "Amount", value: (t) => t.amount, render: (t) => formatPKR(t.amount), align: "right" },
              { key: "st", header: "Status", value: (t) => t.status, render: (t) => <StatusBadge status={t.status} /> },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}
