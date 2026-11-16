import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { getAuthState } from "@/server/functions/auth";
import { getMonthlyPack } from "@/server/functions/reports";
import { PrintPage } from "@/components/print/PrintShell";
import { formatAmount, formatQty } from "@/lib/format";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Month-end report pack in Turnkey's filing format: cover page, then one report per page. */
export const Route = createFileRoute("/print/monthly-pack")({
  ssr: false,
  validateSearch: z.object({ from: isoDate, to: isoDate }),
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({ pack: await getMonthlyPack({ data: deps }), deps }),
  head: () => ({ meta: [{ title: "Monthly Reports – Turnkey Publishers" }] }),
  component: MonthlyPack,
});

type Row = Record<string, string | number | boolean | null>;
const dmy = (d: unknown) => (d ? format(parseISO(String(d)), "dd-MM-yyyy") : "");
const sum = (rows: Row[], k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const REPORTS = [
  "Receiving",
  "Sales Report Product Wise",
  "Sales Reports Customer Wise",
  "Receivables",
  "Expense Report",
  "Inventory Report",
];

function MonthlyPack() {
  const { pack, deps } = Route.useLoaderData();
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  const generated = format(new Date(), "dd-MMM-yyyy HH:mm:ss");
  const period = `${dmy(deps.from)} - ${dmy(deps.to)}`;
  const wholeMonth = deps.from.endsWith("-01") && deps.to.slice(0, 7) === deps.from.slice(0, 7);
  const coverPeriod = wholeMonth ? format(parseISO(deps.from), "MMMM yyyy") : period;
  const page = { generated, period };

  return (
    <PrintPage>
      <div style={{ fontFamily: '"Times New Roman", Times, serif' }} className="text-black">
        <section className="flex min-h-[250mm] flex-col justify-center pl-16">
          {["Turnkey Publishers", "Monthly Reports", coverPeriod].map((l) => (
            <h1
              key={l}
              className="mb-8 self-start text-[34px] font-bold"
              style={{
                fontFamily: "Arial, sans-serif",
                textDecoration: "underline double",
                textUnderlineOffset: 8,
              }}
            >
              {l}
            </h1>
          ))}
          <ol
            className="mt-16 space-y-1 text-[20px] font-bold"
            style={{ fontFamily: "Arial, sans-serif" }}
          >
            {REPORTS.map((r, i) => (
              <li key={r}>
                {i + 1}.{r}
              </li>
            ))}
          </ol>
        </section>

        <Report title="Receivings" {...page}>
          <Table
            head={["Date", "Customer", "Description", "Amount"]}
            right={[3]}
            rows={pack.receipts.map((r) => [
              dmy(r["date"]),
              r["customer"],
              r["description"],
              formatAmount(Number(r["amount"])),
            ])}
            total={[
              "Total",
              "",
              count(pack.receipts.length, "receipt"),
              formatAmount(sum(pack.receipts, "amount")),
            ]}
          />
        </Report>

        <Report title="Sales Report Product Wise" {...page}>
          <Table
            head={["Code", "Product", "Category", "Qty", "Amount"]}
            right={[3, 4]}
            rows={pack.salesByProduct.map((r) => [
              r["code"],
              r["name"],
              r["category"],
              formatQty(Number(r["qty"])),
              formatAmount(Number(r["amount"])),
            ])}
            total={[
              "Total",
              "",
              "",
              formatQty(sum(pack.salesByProduct, "qty")),
              formatAmount(sum(pack.salesByProduct, "amount")),
            ]}
          />
        </Report>

        <Report title="Sales Report Customer Wise" {...page}>
          <Table
            head={["Customer", "Invoices", "Qty", "Amount"]}
            right={[1, 2, 3]}
            rows={pack.salesByCustomer.map((r) => [
              r["customer"],
              r["invoices"],
              formatQty(Number(r["qty"])),
              formatAmount(Number(r["amount"])),
            ])}
            total={[
              "Total",
              String(sum(pack.salesByCustomer, "invoices")),
              formatQty(sum(pack.salesByCustomer, "qty")),
              formatAmount(sum(pack.salesByCustomer, "amount")),
            ]}
          />
        </Report>

        <Report title="Receivables" {...page}>
          <Table
            head={["Customer", "Opening", "Sales / Debits", "Received / Credits", "Balance"]}
            right={[1, 2, 3, 4]}
            rows={pack.receivables.map((r) => [
              r["customer"],
              formatAmount(Number(r["opening"])),
              formatAmount(Number(r["debits"]), true),
              formatAmount(Number(r["credits"]), true),
              formatAmount(Number(r["closing"])),
            ])}
            total={[
              "Total",
              formatAmount(sum(pack.receivables, "opening")),
              formatAmount(sum(pack.receivables, "debits")),
              formatAmount(sum(pack.receivables, "credits")),
              formatAmount(sum(pack.receivables, "closing")),
            ]}
          />
        </Report>

        <Report title="Expense Report" {...page}>
          <Table
            head={["Date", "Expense Head", "Description", "Amount"]}
            right={[3]}
            rows={pack.expenses.map((r) => [
              dmy(r["date"]),
              r["head"],
              r["description"],
              formatAmount(Number(r["amount"])),
            ])}
            total={[
              "Total",
              "",
              count(pack.expenses.length, "voucher"),
              formatAmount(sum(pack.expenses, "amount")),
            ]}
          />
          <h3 className="mt-6 mb-1 text-[15px] font-bold underline">Summary by Expense Head</h3>
          <Table
            head={["Expense Head", "Vouchers", "Amount"]}
            right={[1, 2]}
            rows={headSummary(pack.expenses).map((h) => [h.head, h.count, formatAmount(h.amount)])}
            total={[
              "Total",
              String(pack.expenses.length),
              formatAmount(sum(pack.expenses, "amount")),
            ]}
          />
        </Report>

        <Report title="Inventory Report" {...page}>
          <Table
            head={["Code", "Product", "Opening", "Received", "Issued", "Closing"]}
            right={[2, 3, 4, 5]}
            rows={pack.inventory.map((r) => [
              r["code"],
              r["name"],
              formatQty(Number(r["opening"])),
              formatQty(Number(r["qtyIn"])),
              formatQty(Number(r["qtyOut"])),
              formatQty(Number(r["closing"])),
            ])}
            total={[
              "Total",
              "",
              formatQty(sum(pack.inventory, "opening")),
              formatQty(sum(pack.inventory, "qtyIn")),
              formatQty(sum(pack.inventory, "qtyOut")),
              formatQty(sum(pack.inventory, "closing")),
            ]}
          />
        </Report>
      </div>
    </PrintPage>
  );
}

function headSummary(rows: Row[]) {
  const m = new Map<string, { head: string; count: number; amount: number }>();
  for (const r of rows) {
    const k = String(r["head"]);
    const h = m.get(k) ?? { head: k, count: 0, amount: 0 };
    h.count++;
    h.amount += Number(r["amount"]);
    m.set(k, h);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

function Report({
  title,
  period,
  generated,
  children,
}: {
  title: string;
  period: string;
  generated: string;
  children: ReactNode;
}) {
  return (
    <section className="break-before-page pt-2">
      <p className="text-right text-[11px]">Generated on: {generated}</p>
      <h2 className="text-center text-[17px] font-bold underline">{title}</h2>
      <p className="mb-3 text-center text-[13px] font-bold underline">{period}</p>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
  right,
  total,
}: {
  head: string[];
  rows: (string | number | boolean | null | undefined)[][];
  right: number[];
  total: string[];
}) {
  const align = (i: number) => (right.includes(i) ? "text-right" : "text-left");
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead className="table-header-group">
        <tr className="border-b border-black">
          {head.map((h, i) => (
            <th key={h} className={`px-1.5 py-1 font-bold ${align(i)}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={head.length} className="py-3 text-center italic">
              No entries in this period.
            </td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid border-b border-gray-500">
            {r.map((c, j) => (
              <td key={j} className={`px-1.5 py-1 align-top ${align(j)}`}>
                {String(c ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="border-y-2 border-black font-bold">
            {total.map((c, i) => (
              <td key={i} className={`px-1.5 py-1 ${align(i)}`}>
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
