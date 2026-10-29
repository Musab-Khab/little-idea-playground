import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { getAuthState } from "@/server/functions/auth";
import { getDocument } from "@/server/functions/documents";
import { getLookups } from "@/server/functions/masters";
import { PrintShell } from "@/components/print/PrintShell";
import { formatAmount, formatDate } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import type { DocType } from "@/shared/documents";

/** Printable invoice / voucher / slip. Opens the browser print dialog (use "Save as PDF" for a PDF). */
export const Route = createFileRoute("/print/$id")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
  },
  loader: async ({ params }) => ({
    detail: await getDocument({ data: { id: params.id } }),
    lookups: await getLookups(),
  }),
  head: () => ({ meta: [{ title: "Print – MFAHH" }] }),
  component: PrintDocument,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

const TITLES: Partial<Record<DocType, string>> = {
  SI: "Sales Invoice",
  SO: "Sales Order",
  SR: "Credit Note (Sales Return)",
  RV: "Receipt Voucher",
  PI: "Purchase Invoice",
  PR: "Debit Note (Purchase Return)",
  PV: "Payment Voucher",
  EXP: "Expense Payment Voucher",
  JV: "Journal Voucher",
  SMP: "Sample Issue Slip",
  SMR: "Sample Return Note",
  ADJ: "Stock Adjustment Note",
  DMG: "Damaged Stock Write-off Note",
  OB: "Opening Balances",
  PAYROLL: "Salary Sheet",
  SALPAY: "Salary Payment Voucher",
  LOAN: "Staff Advance / Loan Voucher",
  CLOSE: "Year-end Closing Entry",
};

function PrintDocument() {
  const { detail, lookups } = Route.useLoaderData();
  const d = detail.doc;
  const type = s(d, "type") as DocType;
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  const money = ["RV", "PV", "EXP", "SALPAY", "LOAN"].includes(type);
  const priced = ["SI", "SO", "SR", "PI", "PR"].includes(type);
  const party =
    lookups.customers.find((c) => c.id === d["partyId"]) ??
    lookups.suppliers.find((c) => c.id === d["partyId"]) ??
    lookups.staff.find((c) => c.id === d["partyId"]);

  return (
    <PrintShell
      company={lookups.company}
      title={TITLES[type] ?? s(d, "typeLabel")}
      status={s(d, "status")}
    >
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          {party && (
            <>
              <p className="text-xs uppercase text-gray-500">
                {type.startsWith("P") && type !== "PAYROLL"
                  ? "Supplier"
                  : type === "LOAN"
                    ? "Employee"
                    : "Customer"}
              </p>
              <p className="font-semibold">{party.name}</p>
              <p>{party.code}</p>
            </>
          )}
          {d["issuedTo"] && (
            <p>
              Issued to: <b>{s(d, "issuedTo")}</b> · Purpose: {s(d, "purpose")}
            </p>
          )}
          {d["expenseHead"] && (
            <p>
              Expense head: <b>{s(d, "expenseHead")}</b>
            </p>
          )}
        </div>
        <div className="text-right">
          <p>
            No: <b>{s(d, "docNo")}</b>
          </p>
          <p>Date: {formatDate(s(d, "date"))}</p>
          {d["dueDate"] && <p>Due: {formatDate(s(d, "dueDate"))}</p>}
          {d["reference"] && <p>Ref: {s(d, "reference")}</p>}
          {d["method"] && (
            <p>
              {s(d, "method")}
              {d["bankName"] ? ` · ${s(d, "bankName")}` : ""}
              {d["chequeNo"] ? ` · Chq # ${s(d, "chequeNo")}` : ""}
            </p>
          )}
          {d["month"] && <p>Month: {s(d, "month")}</p>}
        </div>
      </div>

      {detail.lines.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-gray-800 text-left">
              <th className="py-1">#</th>
              <th>
                {type === "JV" || type === "OB"
                  ? "Account"
                  : type === "PAYROLL" || type === "SALPAY"
                    ? "Employee"
                    : "Description"}
              </th>
              {type === "PAYROLL" ? (
                <>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Recovery</th>
                  <th className="text-right">Net</th>
                </>
              ) : type === "JV" || type === "OB" ? (
                <>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </>
              ) : type === "SALPAY" ? (
                <th className="text-right">Amount</th>
              ) : (
                <>
                  <th className="text-right">Qty</th>
                  {priced && (
                    <>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Disc %</th>
                      <th className="text-right">Amount</th>
                    </>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="py-1">{i + 1}</td>
                <td>
                  {l["productName"]
                    ? `${s(l, "productCode")} · ${s(l, "productName")}`
                    : l["partyName"]
                      ? s(l, "partyName")
                      : `${s(l, "accountCode")} ${s(l, "accountName")}`}
                  {l["description"] ? ` — ${s(l, "description")}` : ""}
                </td>
                {type === "PAYROLL" ? (
                  <>
                    <td className="text-right">
                      {formatAmount(Number(l["basic"]) + Number(l["allowances"]))}
                    </td>
                    <td className="text-right">{formatAmount(Number(l["deductions"]), true)}</td>
                    <td className="text-right">{formatAmount(Number(l["recovery"]), true)}</td>
                    <td className="text-right">{formatAmount(Number(l["amount"]))}</td>
                  </>
                ) : type === "JV" || type === "OB" ? (
                  <>
                    <td className="text-right">
                      {formatAmount(
                        l["productId"] ? Number(l["amount"]) : Number(l["debit"]),
                        true,
                      )}
                    </td>
                    <td className="text-right">{formatAmount(Number(l["credit"]), true)}</td>
                  </>
                ) : type === "SALPAY" ? (
                  <td className="text-right">{formatAmount(Number(l["amount"]))}</td>
                ) : (
                  <>
                    <td className="text-right">{s(l, "qty")}</td>
                    {priced && (
                      <>
                        <td className="text-right">{formatAmount(Number(l["rate"]))}</td>
                        <td className="text-right">{Number(l["discountPct"]) || ""}</td>
                        <td className="text-right">{formatAmount(Number(l["amount"]))}</td>
                      </>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 ml-auto w-72 space-y-0.5 text-sm">
        {priced && (
          <>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatAmount(Number(d["subtotal"]))}</span>
            </div>
            {Number(d["discount"]) > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>({formatAmount(Number(d["discount"]))})</span>
              </div>
            )}
            {Number(d["taxAmount"]) > 0 && (
              <div className="flex justify-between">
                <span>Sales tax {s(d, "taxPct")}%</span>
                <span>{formatAmount(Number(d["taxAmount"]))}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between border-t-2 border-gray-800 pt-1 text-base font-bold">
          <span>{type === "SMP" || type === "SMR" ? "Value at cost" : "Total"}</span>
          <span>Rs {formatAmount(Number(d["total"]))}</span>
        </div>
        {type === "SI" && Number(d["paidAmount"]) + Number(d["creditedAmount"]) > 0 && (
          <div className="flex justify-between">
            <span>Balance due</span>
            <span>Rs {formatAmount(Number(d["outstanding"]))}</span>
          </div>
        )}
      </div>
      {(money || priced || type === "PAYROLL") && (
        <p className="mt-3 text-sm">
          <b>Amount in words:</b> {amountInWords(Number(d["total"]))}
        </p>
      )}
      {d["narration"] && (
        <p className="mt-2 text-sm">
          <b>Remarks:</b> {s(d, "narration")}
        </p>
      )}
      {detail.allocations.length > 0 && money && (
        <p className="mt-2 text-sm">
          <b>Against:</b>{" "}
          {detail.allocations
            .map((a) => `${s(a, "docNo")} (Rs ${formatAmount(Number(a["amount"]))})`)
            .join(", ")}
        </p>
      )}

      <div className="mt-16 grid grid-cols-3 gap-8 text-center text-xs">
        <div className="border-t border-gray-600 pt-1">
          Prepared by
          <br />
          {s(d, "createdByName")}
        </div>
        <div className="border-t border-gray-600 pt-1">
          Approved by
          <br />
          {s(d, "approvedByName")}
        </div>
        <div className="border-t border-gray-600 pt-1">
          {money
            ? "Received by"
            : type === "PI" || type === "PR"
              ? "Received / checked in store"
              : priced
                ? "Customer signature & stamp"
                : "Checked by"}
        </div>
      </div>
    </PrintShell>
  );
}
