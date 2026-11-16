import type { ReactNode } from "react";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { lineDiscount, type DocType } from "@/shared/documents";
import { PrintPage } from "./PrintShell";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

export interface PrintCompany {
  name: string;
  address: string;
  phone: string;
  email: string;
  ntn: string;
}

const NAVY = "#0b2a5b";
const BLUE = "#1d5fd6";

/** Invoice-style print (sales, purchases, returns, stock notes, payroll): blue letterhead band, party card, priced table. */
export function InvoicePrint({
  type,
  title,
  doc: d,
  lines,
  company,
}: {
  type: DocType;
  title: string;
  doc: Row;
  lines: Row[];
  company: PrintCompany | null;
}) {
  const priced = ["SI", "SO", "SR", "PI", "PR"].includes(type);
  const supplierSide = type === "PI" || type === "PR";
  const partyLabel = supplierSide ? "Supplier" : type === "SR" ? "Credit to" : "Bill to";
  const journal = type === "JV" || type === "OB" || type === "CLOSE";

  const cols: { head: string; right?: boolean; cell: (l: Row) => ReactNode }[] =
    type === "PAYROLL"
      ? [
          {
            head: "Gross",
            right: true,
            cell: (l) => formatAmount(Number(l["basic"]) + Number(l["allowances"])),
          },
          {
            head: "Deductions",
            right: true,
            cell: (l) => formatAmount(Number(l["deductions"]), true),
          },
          { head: "Recovery", right: true, cell: (l) => formatAmount(Number(l["recovery"]), true) },
          { head: "Net", right: true, cell: (l) => formatAmount(Number(l["amount"])) },
        ]
      : journal
        ? [
            {
              head: "Debit",
              right: true,
              cell: (l) =>
                formatAmount(l["productId"] ? Number(l["amount"]) : Number(l["debit"]), true),
            },
            { head: "Credit", right: true, cell: (l) => formatAmount(Number(l["credit"]), true) },
          ]
        : [
            { head: "Qty", right: true, cell: (l) => formatQty(Number(l["qty"])) },
            ...(priced
              ? [
                  {
                    head: "Rate",
                    right: true,
                    cell: (l: Row) => `Rs ${formatAmount(Number(l["rate"]))}`,
                  },
                  { head: "Disc.", right: true, cell: (l: Row) => lineDiscount(l) },
                  {
                    head: "Amount",
                    right: true,
                    cell: (l: Row) => `Rs ${formatAmount(Number(l["amount"]))}`,
                  },
                ]
              : []),
          ];

  const details: [string, string][] = [
    ["Number", s(d, "docNo")],
    ["Date", formatDate(s(d, "date"))],
    ...(d["dueDate"] ? [["Due date", formatDate(s(d, "dueDate"))] as [string, string]] : []),
    ...(d["reference"] ? [["Reference", s(d, "reference")] as [string, string]] : []),
    ...(d["month"] ? [["Month", s(d, "month")] as [string, string]] : []),
    ["Prepared by", s(d, "createdByName")],
  ];
  const discount = Number(d["discount"]);
  const tax = Number(d["taxAmount"]);

  return (
    <PrintPage>
      <div className="text-[13px]">
        <header
          className="flex items-start justify-between rounded-lg px-6 py-5 text-white"
          style={{ background: `linear-gradient(110deg, ${NAVY} 0%, #123d8a 55%, ${BLUE} 100%)` }}
        >
          <div>
            <h1 className="text-2xl font-bold">{company?.name ?? "Turnkey Publishers"}</h1>
            <p className="mt-1 text-[11px] opacity-90">{company?.address}</p>
            <p className="text-[11px] opacity-90">
              {[
                company?.phone && `Phone ${company.phone}`,
                company?.email,
                company?.ntn && `NTN ${company.ntn}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold uppercase tracking-[0.15em]">{title}</h2>
            <p className="text-[11px] opacity-90"># {s(d, "docNo")}</p>
            <p className="text-[11px] opacity-90">{formatDate(s(d, "date"))}</p>
            <span className="mt-1 inline-block rounded border border-white px-3 py-0.5 text-[11px] font-semibold">
              {s(d, "status")}
            </span>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Card title={d["partyName"] ? partyLabel : "Details"}>
            {d["partyName"] ? (
              <>
                <p className="font-bold" style={{ color: NAVY }}>
                  {s(d, "partyName")}
                </p>
                {d["partyAddress"] && <p>{s(d, "partyAddress")}</p>}
                {d["partyPhone"] && <p>Phone {s(d, "partyPhone")}</p>}
                {d["partyNtn"] && <p>NTN {s(d, "partyNtn")}</p>}
                <p>{s(d, "partyCode")}</p>
              </>
            ) : (
              <>
                {d["issuedTo"] && (
                  <p>
                    Issued to: <b>{s(d, "issuedTo")}</b>
                  </p>
                )}
                {d["purpose"] && <p>Purpose: {s(d, "purpose")}</p>}
                {d["reason"] && <p>Reason: {s(d, "reason")}</p>}
                {d["condition"] && <p>Condition: {s(d, "condition")}</p>}
                {d["narration"] && <p>{s(d, "narration")}</p>}
              </>
            )}
          </Card>
          <Card title="Document details">
            {details.map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <b style={{ color: NAVY }}>{v}</b>
              </div>
            ))}
          </Card>
        </div>

        {lines.length > 0 && (
          <table className="mt-5 w-full border-collapse">
            <thead>
              <tr className="text-left text-[12px] text-white" style={{ background: BLUE }}>
                <th className="w-8 px-3 py-2">#</th>
                <th className="py-2">
                  {journal ? "Account" : type === "PAYROLL" ? "Employee" : "Description"}
                </th>
                {cols.map((c) => (
                  <th key={c.head} className={`px-3 py-2 ${c.right ? "text-right" : ""}`}>
                    {c.head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-200"
                  style={{ background: i % 2 ? "#f3f7fd" : undefined }}
                >
                  <td className="px-3 py-2 align-top">{i + 1}</td>
                  <td className="py-2">
                    {l["productName"] ? (
                      <>
                        <p>{s(l, "productName")}</p>
                        <p className="text-[10px] text-gray-500">{s(l, "productCode")}</p>
                      </>
                    ) : l["partyName"] ? (
                      s(l, "partyName")
                    ) : (
                      `${s(l, "accountCode")} ${s(l, "accountName")}`
                    )}
                    {l["description"] ? (
                      <p className="text-[10px] text-gray-500">{s(l, "description")}</p>
                    ) : null}
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.head}
                      className={`px-3 py-2 align-top ${c.right ? "text-right" : ""}`}
                    >
                      {c.cell(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-3 ml-auto w-72 space-y-1">
          {priced && (discount > 0 || tax > 0) && (
            <Line label="Gross amount" value={`Rs ${formatAmount(Number(d["subtotal"]))}`} />
          )}
          {priced && discount > 0 && (
            <Line label="Discount" value={`(Rs ${formatAmount(discount)})`} />
          )}
          {priced && tax > 0 && (
            <Line label={`Sales tax ${s(d, "taxPct")}%`} value={`Rs ${formatAmount(tax)}`} />
          )}
          <div
            className="flex justify-between rounded px-3 py-1.5 text-[14px] font-bold text-white"
            style={{ background: NAVY }}
          >
            <span>{type === "SMP" || type === "SMR" ? "Value at cost" : "Total"}</span>
            <span>Rs {formatAmount(Number(d["total"]))}</span>
          </div>
          {type === "SI" && Number(d["paidAmount"]) + Number(d["creditedAmount"]) > 0 && (
            <Line label="Balance due" value={`Rs ${formatAmount(Number(d["outstanding"]))}`} />
          )}
        </div>

        {(priced || type === "PAYROLL") && (
          <p
            className="mt-5 border-l-4 px-3 py-2 font-semibold"
            style={{ borderColor: BLUE, background: "#eef4fd", color: NAVY }}
          >
            Amount in words: {amountInWords(Number(d["total"]))}
          </p>
        )}
        {d["partyName"] && d["narration"] && (
          <p className="mt-2">
            <b>Remarks:</b> {s(d, "narration")}
          </p>
        )}

        <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[12px]">
          <Sign label="Prepared by" name={s(d, "createdByName")} />
          <Sign label="Approved by" name={s(d, "approvedByName")} />
          <Sign
            label={
              supplierSide
                ? "Received / checked in store"
                : priced
                  ? "Customer signature"
                  : "Checked by"
            }
          />
        </div>
        <p className="mt-8 text-center text-[10px] text-gray-500">
          Knowledge Today, A Brighter Tomorrow · This is a computer-generated document.
        </p>
      </div>
    </PrintPage>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-lg border px-4 py-3 leading-relaxed"
      style={{ borderColor: "#c9d8ee" }}
    >
      <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: BLUE }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function Sign({ label, name }: { label: string; name?: string }) {
  return (
    <div>
      <p className="h-5 text-[11px]">{name}</p>
      <div className="border-t border-gray-700 pt-1">{label}</div>
    </div>
  );
}
