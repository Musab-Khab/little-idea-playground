import type { ReactNode } from "react";
import { formatAmount, formatDate } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { round2, type DocType } from "@/shared/documents";
import type { PrintCompany } from "./InvoicePrint";
import { PrintPage } from "./PrintShell";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

const TITLES: Partial<Record<DocType, string>> = {
  RV: "Receipt Voucher",
  PV: "Payment Voucher",
  EXP: "Expense Voucher",
  JV: "Journal Voucher",
  SALPAY: "Salary Voucher",
  LOAN: "Advance Voucher",
};

const NAVY = "#0b3a75";
const FIELD = "#e8f1fb";
const EDGE = "#8fb3e0";
const MIN_ROWS = 5;

/** Accounts voucher print (receipts, payments, expenses, journals, salary, advances). */
export function VoucherPrint({
  type,
  doc: d,
  lines,
  allocations,
  staffDepartment,
  company,
}: {
  type: DocType;
  doc: Row;
  lines: Row[];
  allocations: Row[];
  staffDepartment?: string;
  company: PrintCompany | null;
}) {
  const journal = type === "JV";
  const total = Number(d["total"]);

  // What the table lists for each voucher type.
  let rows: { text: string; amount?: number; debit?: number; credit?: number }[];
  if (journal) {
    rows = lines.map((l) => ({
      text: `${s(l, "accountCode")} ${s(l, "accountName")}${l["partyName"] ? ` · ${s(l, "partyName")}` : ""}${l["description"] ? ` — ${s(l, "description")}` : ""}`,
      debit: Number(l["debit"]),
      credit: Number(l["credit"]),
    }));
  } else if (type === "SALPAY") {
    rows = lines.map((l) => ({
      text: `Salary – ${s(l, "partyName")}`,
      amount: Number(l["amount"]),
    }));
  } else if ((type === "RV" || type === "PV") && allocations.length) {
    rows = allocations.map((a) => ({
      text: `Against ${s(a, "docNo")}${a["date"] ? ` dated ${formatDate(s(a, "date"))}` : ""}`,
      amount: Number(a["amount"]),
    }));
    const rest = round2(total - allocations.reduce((x, a) => x + Number(a["amount"]), 0));
    if (rest > 0) rows.push({ text: "On account (advance)", amount: rest });
  } else if (type === "LOAN") {
    rows = [
      {
        text: `${s(d, "loanType") || "Advance"} – recovery Rs ${formatAmount(Number(d["installment"]))} per month`,
        amount: total,
      },
    ];
  } else {
    rows = [
      {
        text:
          type === "EXP"
            ? s(d, "expenseHead")
            : type === "RV"
              ? `Received from ${s(d, "partyName")}`
              : `Paid to ${s(d, "partyName")}`,
        amount: total,
      },
    ];
  }
  const blanks = Math.max(0, MIN_ROWS - rows.length);

  const headField: [string, string] =
    type === "EXP"
      ? ["Expense Head", s(d, "expenseHead")]
      : type === "RV"
        ? ["Customer", s(d, "partyCode")]
        : type === "PV"
          ? ["Supplier", s(d, "partyCode")]
          : type === "LOAN"
            ? ["Employee", s(d, "partyCode")]
            : ["Reference", s(d, "reference")];
  const partyField: [string, string] | null = journal
    ? null
    : type === "RV"
      ? ["Received From", s(d, "partyName")]
      : type === "SALPAY"
        ? ["Paid To", "Staff (as listed)"]
        : ["Paid To", s(d, "paidTo") || s(d, "payee") || s(d, "partyName")];
  const department = s(d, "department") || staffDepartment || "";
  const method = s(d, "method");

  return (
    <PrintPage>
      <div
        className="relative overflow-hidden px-6 pb-6 pt-4 text-[13px]"
        style={{ color: "#10294f" }}
      >
        {/* Corner swooshes */}
        <div
          className="pointer-events-none absolute -left-60 -top-36 h-44 w-80 rounded-[50%] border-[10px]"
          style={{ borderColor: "#1e63c4", opacity: 0.8 }}
        />
        <div
          className="pointer-events-none absolute -bottom-36 -right-48 h-44 w-96 rounded-[50%] border-[10px]"
          style={{ borderColor: "#1e63c4", opacity: 0.8 }}
        />

        <header className="relative flex items-center justify-between pt-2">
          <img src="/brand/turnkey-logo.png" alt="Turnkey Publishers" className="h-20" />
          <div className="text-right text-[11px] leading-relaxed">
            <p className="text-lg font-extrabold" style={{ color: NAVY }}>
              {company?.name ?? "Turnkey Publishers"}
            </p>
            <p>{company?.address}</p>
            <p>
              {[
                company?.phone && `Phone ${company.phone}`,
                company?.email,
                company?.ntn && `NTN ${company.ntn}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        <div className="relative my-5 flex items-center gap-4">
          <div className="h-px flex-1" style={{ background: "#1e63c4" }} />
          <h1
            className="rounded-full border px-14 py-2 text-2xl font-extrabold uppercase tracking-wide"
            style={{ background: FIELD, borderColor: EDGE, color: NAVY }}
          >
            {TITLES[type] ?? "Voucher"}
          </h1>
          <div className="h-px flex-1" style={{ background: "#1e63c4" }} />
        </div>
        {s(d, "status") !== "Approved" && (
          <p className="relative -mt-3 mb-3 text-center text-xs font-bold uppercase text-red-600">
            {s(d, "status")}
          </p>
        )}

        <section
          className="relative grid grid-cols-[1fr_1.15fr] gap-x-6 gap-y-2 rounded-lg border bg-white px-5 py-4"
          style={{ borderColor: EDGE }}
        >
          <div className="space-y-2">
            <Field label="Voucher No:" value={s(d, "docNo")} />
            <Field label="Date:" value={formatDate(s(d, "date"))} />
            <Field label={`${headField[0]}:`} value={headField[1]} />
          </div>
          <div className="space-y-2">
            {partyField && <Field label={`${partyField[0]}:`} value={partyField[1]} />}
            {department && <Field label="Department:" value={department} />}
            {!department && d["reference"] && headField[0] !== "Reference" && (
              <Field label="Reference:" value={s(d, "reference")} />
            )}
            {method && (
              <div className="flex items-center gap-2.5">
                <span className="w-28 shrink-0 font-bold" style={{ color: NAVY }}>
                  Payment:
                </span>
                {["Cash", "Bank", "Cheque"].map((m) => (
                  <span key={m} className="flex items-center gap-1">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full border-2"
                      style={{
                        borderColor: "#1e63c4",
                        background: m === method ? "#1e63c4" : "white",
                        boxShadow: m === method ? "inset 0 0 0 2px white" : undefined,
                      }}
                    />
                    {m}
                  </span>
                ))}
              </div>
            )}
            {(d["bankName"] || d["chequeNo"]) && (
              <p className="pl-[7.6rem] text-[11px]">
                {[s(d, "bankName"), d["chequeNo"] ? `Cheque # ${s(d, "chequeNo")}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </section>

        <table className="relative mt-5 w-full border-collapse">
          <thead>
            <tr className="text-white" style={{ background: NAVY }}>
              <th className="w-14 border-r border-white/40 py-2">#</th>
              <th className="border-r border-white/40 py-2">Description</th>
              {journal ? (
                <>
                  <th className="w-36 border-r border-white/40 py-2">Debit (PKR)</th>
                  <th className="w-36 py-2">Credit (PKR)</th>
                </>
              ) : (
                <th className="w-44 py-2">Amount (PKR)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <Cell center>{i + 1}</Cell>
                <Cell>{r.text}</Cell>
                {journal ? (
                  <>
                    <Cell right>{formatAmount(r.debit, true)}</Cell>
                    <Cell right>{formatAmount(r.credit, true)}</Cell>
                  </>
                ) : (
                  <Cell right>{formatAmount(r.amount)}</Cell>
                )}
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <tr key={`b${i}`}>
                <Cell center>{rows.length + i + 1}</Cell>
                <Cell>&nbsp;</Cell>
                {journal ? (
                  <>
                    <Cell>&nbsp;</Cell>
                    <Cell>&nbsp;</Cell>
                  </>
                ) : (
                  <Cell>&nbsp;</Cell>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="relative mt-5 grid grid-cols-2 gap-4">
          <div
            className="rounded-lg border px-4 py-3"
            style={{ background: FIELD, borderColor: EDGE }}
          >
            <p className="text-base font-bold" style={{ color: NAVY }}>
              Remarks:
            </p>
            <p>{s(d, "narration")}</p>
            {d["reference"] && headField[0] !== "Reference" && department && (
              <p className="text-[11px]">Ref: {s(d, "reference")}</p>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border" style={{ borderColor: NAVY }}>
            <div className="grid grid-cols-[42%_58%]">
              <span className="px-4 py-2 font-bold text-white" style={{ background: NAVY }}>
                Total Amount:
              </span>
              <span
                className="px-4 py-2 text-right text-lg font-bold"
                style={{ background: FIELD }}
              >
                {formatAmount(total)}
              </span>
              <span
                className="border-t border-white/30 px-4 py-2 font-bold text-white"
                style={{ background: NAVY }}
              >
                Amount in Words:
              </span>
              <span
                className="border-t px-4 py-2 text-[12px]"
                style={{ background: FIELD, borderColor: EDGE }}
              >
                {amountInWords(total).replace(/^Rupees /, "")}
              </span>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-4 gap-3">
          <SignBox label="Prepared By" name={s(d, "createdByName")} />
          <SignBox label="Checked By" />
          <SignBox label="Approved By" name={s(d, "approvedByName")} />
          <SignBox label={type === "RV" ? "Paid By" : "Received By"} />
        </div>
      </div>
    </PrintPage>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 font-bold" style={{ color: NAVY }}>
        {label}
      </span>
      <span
        className="min-h-[30px] flex-1 rounded-md border px-3 py-1"
        style={{ background: FIELD, borderColor: EDGE }}
      >
        {value || " "}
      </span>
    </div>
  );
}

function Cell({
  children,
  center,
  right,
}: {
  children: ReactNode;
  center?: boolean;
  right?: boolean;
}) {
  return (
    <td
      className={`border px-3 py-1.5 ${center ? "text-center" : ""} ${right ? "text-right" : ""}`}
      style={{ borderColor: NAVY }}
    >
      {children}
    </td>
  );
}

function SignBox({ label, name }: { label: string; name?: string }) {
  return (
    <div className="rounded-lg border px-3 pb-3 pt-2 text-center" style={{ borderColor: EDGE }}>
      <p className="font-bold" style={{ color: NAVY }}>
        {label}
      </p>
      <p className="mt-3 h-4 text-[11px]">{name}</p>
      <div className="mx-2 mt-1 border-t border-gray-600" />
    </div>
  );
}
