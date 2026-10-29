import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  CalendarRange,
  TrendingUp,
  ShoppingBag,
  Package,
  Receipt,
  Wallet,
  PiggyBank,
  Coins,
  Landmark,
  HandCoins,
  CreditCard,
  Boxes,
  AlertTriangle,
  PackageX,
  BookOpenCheck,
} from "lucide-react";
import { useUiStore, resolveRange } from "@/store/uiStore";
import { useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { getDashboard } from "@/server/functions/reports";
import { KpiCard } from "@/components/shared/KpiCard";
import { ChartCard } from "@/components/shared/ChartCard";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { DocumentView } from "@/components/documents/DocumentView";
import { formatCompact, formatDate, formatPKR } from "@/lib/format";
import { DOC_DEFS, type DocType, todayISO } from "@/shared/documents";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard – MFAHH | Turnkey Publishers" }] }),
  component: Dashboard,
});

const PIE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const tooltipStyle = { borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 };
type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

/** % change vs the same period last month, for the KPI arrows. */
const trendOf = (now: number, before: number): "up" | "down" | undefined =>
  now === before ? undefined : now > before ? "up" : "down";
const pct = (now: number, before: number) =>
  before
    ? `${now >= before ? "+" : ""}${Math.round(((now - before) / Math.abs(before)) * 100)}% vs last month`
    : undefined;

function Dashboard() {
  const navigate = useNavigate();
  const { data: lk } = useLookups();
  const { range, customFrom, customTo } = useUiStore();
  const today = lk?.today ?? todayISO();
  const r = resolveRange(range, today, customFrom, customTo);
  const q = useApi(
    ["dashboard", r.from, r.to],
    () => getDashboard({ data: { from: r.from, to: r.to } }),
    // Live: figures refresh every 30 seconds, and immediately after any save or approval.
    { enabled: Boolean(lk), refetchInterval: 30_000 },
  );
  const [viewId, setViewId] = useState<string | null>(null);
  const go = (to: string) => navigate({ to });
  const k = q.data;

  if (!k) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dashboard" crumbs={["Home", "Dashboard"]} />
        <p className="py-16 text-center text-muted-foreground">
          {q.error ? String((q.error as Error).message) : "Loading figures…"}
        </p>
      </div>
    );
  }
  const bankTotal = k.banks.reduce((t, b) => t + Number(b["balance"] ?? 0), 0);
  const trend = k.trend.map((t) => ({ ...t, label: formatDate(`${s(t, "month")}-01`).slice(3) }));
  const sub = (x: string | undefined) => (x ? { sub: x } : {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        crumbs={["Home", "Dashboard"]}
        actions={
          <span className="text-sm text-muted-foreground">
            Welcome back — figures as of {formatDate(k.today)} · Period: {r.label}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Today's Sales"
          value={formatPKR(k.kpis.todaySales)}
          icon={CalendarDays}
          tint="blue"
          trend={trendOf(k.kpis.todaySales, k.kpis.yesterdaySales)}
          sub="Net of returns"
        />
        <KpiCard
          title="Monthly Sales"
          value={formatPKR(k.kpis.monthSales)}
          icon={CalendarRange}
          tint="green"
          trend={trendOf(k.kpis.monthSales, k.kpis.lastMonthSales)}
          {...sub(pct(k.kpis.monthSales, k.kpis.lastMonthSales))}
        />
        <KpiCard
          title="Yearly Sales"
          value={formatPKR(k.kpis.yearSales)}
          icon={TrendingUp}
          tint="purple"
          sub="Financial year to date"
        />
        <KpiCard
          title="Today's Purchases"
          value={formatPKR(k.kpis.todayPurchases)}
          icon={ShoppingBag}
          tint="orange"
          onClick={() => go("/purchases/invoices")}
        />
        <KpiCard
          title="Monthly Purchases"
          value={formatPKR(k.kpis.monthPurchases)}
          icon={Package}
          tint="pink"
          trend={trendOf(k.kpis.monthPurchases, k.kpis.lastMonthPurchases)}
          {...sub(pct(k.kpis.monthPurchases, k.kpis.lastMonthPurchases))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Today's Expenses"
          value={formatPKR(k.kpis.todayExpenses)}
          icon={Receipt}
          tint="pink"
          onClick={() => go("/transactions/expenses")}
        />
        <KpiCard
          title="Monthly Expenses"
          value={formatPKR(k.kpis.monthExpenses)}
          icon={Wallet}
          tint="orange"
          trend={trendOf(k.kpis.monthExpenses, k.kpis.lastMonthExpenses)}
          {...sub(pct(k.kpis.monthExpenses, k.kpis.lastMonthExpenses))}
        />
        {k.canSeeFinance && (
          <>
            <KpiCard
              title="Gross Profit"
              sub={r.label}
              value={formatPKR(k.grossProfit)}
              icon={PiggyBank}
              tint="green"
              trend={(k.grossProfit ?? 0) >= 0 ? "up" : "down"}
            />
            <KpiCard
              title="Net Profit"
              sub={r.label}
              value={formatPKR(k.netProfit)}
              icon={Coins}
              tint="blue"
              trend={(k.netProfit ?? 0) >= 0 ? "up" : "down"}
            />
            <KpiCard
              title="Cash Balance"
              value={formatPKR(k.cash)}
              icon={HandCoins}
              tint="purple"
              onClick={() => go("/transactions/cash-book")}
            />
            <KpiCard
              title="Bank Balance"
              value={formatPKR(bankTotal)}
              sub={`${k.banks.length} active account${k.banks.length === 1 ? "" : "s"}`}
              icon={Landmark}
              tint="blue"
              onClick={() => go("/transactions/bank-accounts")}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {k.canSeeFinance && (
          <>
            <KpiCard
              title="Receivables"
              value={formatPKR(k.receivables)}
              sub={`Overdue ${formatPKR(k.receivablesOverdue)}`}
              subTone="danger"
              icon={CreditCard}
              tint="green"
              onClick={() => go("/customers")}
            />
            <KpiCard
              title="Payables"
              value={formatPKR(k.payables)}
              sub={`Overdue ${formatPKR(k.payablesOverdue)}`}
              subTone="danger"
              icon={Wallet}
              tint="pink"
              onClick={() => go("/suppliers")}
            />
          </>
        )}
        <KpiCard
          title="Stock Summary"
          value={`${k.stockUnits.toLocaleString()} units`}
          sub={`Value ${formatPKR(k.stockValue)}`}
          icon={Boxes}
          tint="blue"
          onClick={() => go("/inventory/stock")}
        />
        <KpiCard
          title="Low Stock Alert"
          value={`${k.lowStock.length} items`}
          icon={AlertTriangle}
          tint="orange"
          onClick={() => go("/inventory/stock")}
        />
        <KpiCard
          title="Out of Stock"
          value={`${k.outOfStock.length} items`}
          icon={PackageX}
          tint="pink"
          onClick={() => go("/inventory/stock")}
        />
        <KpiCard
          title="Outstanding Samples"
          value={`${k.outstandingSamples.slips} slips`}
          sub={`${k.outstandingSamples.qty} books not returned`}
          icon={BookOpenCheck}
          tint="purple"
          onClick={() => go("/inventory/samples")}
        />
      </div>

      {k.banks.length > 1 && k.canSeeFinance && (
        <div className="flex flex-wrap gap-2 text-xs">
          {k.banks.map((b) => (
            <span key={s(b, "accountNo")} className="rounded-full border bg-card px-3 py-1">
              {s(b, "name")}: <b>{formatPKR(Number(b["balance"]))}</b>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Sales Trend (12 months)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="sales"
                name="Net sales"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill="url(#salesFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Purchases vs Expenses">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar
                isAnimationActive={false}
                dataKey="purchases"
                name="Purchases"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="expenses"
                name="Expenses"
                fill="var(--chart-3)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {k.canSeeFinance && (
          <ChartCard title="Profit Trend">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={formatCompact}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="profit"
                  name="Net profit"
                  stroke="var(--chart-2)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        <ChartCard title="Stock Value by Category">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                isAnimationActive={false}
                data={k.stockByCategory}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
              >
                {k.stockByCategory.map((_, i) => (
                  <Cell key={i} fill={PIE[i % PIE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatPKR(v)} contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={`Top-Selling Books · ${r.label}`}>
          <DataTable
            compact
            rows={k.topBooks}
            columns={[
              {
                key: "name",
                header: "Book",
                value: (x) => s(x, "name"),
                render: (x) => <span className="font-medium text-navy">{s(x, "name")}</span>,
              },
              { key: "qty", header: "Qty sold", value: (x) => Number(x["qty"]), align: "right" },
              {
                key: "value",
                header: "Sales value",
                value: (x) => Number(x["value"]),
                render: (x) => formatPKR(Number(x["value"])),
                align: "right",
              },
            ]}
          />
        </ChartCard>
        <ChartCard title="Pending Orders">
          <DataTable
            compact
            rows={k.pendingOrders}
            onRowClick={(o) => setViewId(s(o, "id"))}
            columns={[
              {
                key: "docNo",
                header: "Order",
                value: (o) => s(o, "docNo"),
                render: (o) => <span className="font-medium text-primary">{s(o, "docNo")}</span>,
              },
              { key: "customer", header: "Customer", value: (o) => s(o, "customer") },
              {
                key: "qty",
                header: "Delivered",
                value: (o) => Number(o["delivered"]),
                render: (o) => `${s(o, "delivered")}/${s(o, "qty")}`,
                align: "right",
              },
              {
                key: "total",
                header: "Value",
                value: (o) => Number(o["total"]),
                render: (o) => formatPKR(Number(o["total"])),
                align: "right",
              },
              {
                key: "status",
                header: "Status",
                value: (o) => s(o, "status"),
                render: (o) => <StatusBadge status={s(o, "status")} />,
              },
            ]}
          />
        </ChartCard>
        <ChartCard title="Recent Transactions">
          <DataTable
            compact
            rows={k.recent}
            onRowClick={(t) => setViewId(s(t, "id"))}
            columns={[
              {
                key: "date",
                header: "Date",
                value: (t) => s(t, "date"),
                render: (t) => (
                  <span className="whitespace-nowrap text-xs">{formatDate(s(t, "date"))}</span>
                ),
              },
              {
                key: "docNo",
                header: "Ref",
                value: (t) => s(t, "docNo"),
                render: (t) => (
                  <span className="block font-medium text-navy">
                    {s(t, "docNo")}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {DOC_DEFS[s(t, "type") as DocType]?.label} · {s(t, "party")}
                    </span>
                  </span>
                ),
              },
              {
                key: "total",
                header: "Amount",
                value: (t) => Number(t["total"]),
                render: (t) => formatPKR(Number(t["total"])),
                align: "right",
              },
              {
                key: "status",
                header: "Status",
                value: (t) => s(t, "status"),
                render: (t) => <StatusBadge status={s(t, "status")} />,
              },
            ]}
          />
        </ChartCard>
      </div>

      {(k.lowStock.length > 0 || k.outOfStock.length > 0) && (
        <ChartCard title="Stock alerts">
          <DataTable
            compact
            rows={[...k.outOfStock, ...k.lowStock]}
            columns={[
              { key: "code", header: "Code", value: (p) => s(p, "code") },
              { key: "name", header: "Book", value: (p) => s(p, "name") },
              {
                key: "stockQty",
                header: "In stock",
                value: (p) => Number(p["stockQty"]),
                align: "right",
              },
              {
                key: "minStock",
                header: "Minimum",
                value: (p) => Number(p["minStock"]),
                align: "right",
              },
              {
                key: "st",
                header: "",
                value: (p) => (Number(p["stockQty"]) <= 0 ? "Out of Stock" : "Low Stock"),
                render: (p) => (
                  <StatusBadge status={Number(p["stockQty"]) <= 0 ? "Out of Stock" : "Low Stock"} />
                ),
              },
            ]}
          />
        </ChartCard>
      )}
      {viewId && <DocumentView id={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
