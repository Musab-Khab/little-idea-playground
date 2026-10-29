import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeInputs } from "@/components/shared/Field";
import { DataTable } from "@/components/shared/DataTable";
import { DocumentView } from "@/components/documents/DocumentView";
import { useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { formatAmount, formatDate, formatPKR, formatQty } from "@/lib/format";
import { getPartyStatement, getStockMovement } from "@/server/functions/reports";
import { DOC_DEFS, type DocType, todayISO } from "@/shared/documents";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

export function usePeriod() {
  const { data: lk } = useLookups();
  const today = lk?.today ?? todayISO();
  const fyStart =
    lk?.financialYears.find((f) => f.startDate <= today && f.endDate >= today)?.startDate ??
    `${today.slice(0, 4)}-01-01`;
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  return {
    from: range?.from ?? fyStart,
    to: range?.to ?? today,
    today,
    setRange: (from: string, to: string) => setRange({ from, to }),
    ready: Boolean(lk),
  };
}

/** Running-balance ledger with opening and closing lines; rows open the source document. */
export function LedgerTable({
  opening,
  closing,
  rows,
  name,
  title,
  balanceLabel = "Balance",
}: {
  opening: number;
  closing: number;
  rows: Row[];
  name: string;
  title?: string;
  balanceLabel?: string;
}) {
  const [viewId, setViewId] = useState<string | null>(null);
  const debit = rows.reduce((t, r) => t + Number(r["debit"] ?? 0), 0);
  const credit = rows.reduce((t, r) => t + Number(r["credit"] ?? 0), 0);
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4 text-sm">
        <span>
          Opening: <b className="tabular-nums">{formatAmount(opening)}</b>
        </span>
        <span>
          Debits: <b className="tabular-nums">{formatAmount(debit)}</b>
        </span>
        <span>
          Credits: <b className="tabular-nums">{formatAmount(credit)}</b>
        </span>
        <span>
          Closing: <b className="tabular-nums text-navy">{formatAmount(closing)}</b>
        </span>
      </div>
      <DataTable
        rows={rows}
        pageSize={50}
        exportName={name}
        {...(title ? { exportTitle: title } : {})}
        onRowClick={(r) => setViewId(s(r, "docId"))}
        columns={[
          {
            key: "date",
            header: "Date",
            value: (r) => s(r, "date"),
            render: (r) => <span className="whitespace-nowrap">{formatDate(s(r, "date"))}</span>,
          },
          {
            key: "docNo",
            header: "Document",
            value: (r) => s(r, "docNo"),
            render: (r) => (
              <span className="font-medium text-primary">
                {s(r, "docNo")}
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {DOC_DEFS[s(r, "type") as DocType]?.label}
                </span>
              </span>
            ),
          },
          {
            key: "narration",
            header: "Particulars",
            value: (r) => `${s(r, "narration")} ${s(r, "reference")}`,
            render: (r) => (
              <span className={r["reversal"] ? "italic text-muted-foreground" : ""}>
                {s(r, "narration")}
                {r["reference"] ? ` · ${s(r, "reference")}` : ""}
              </span>
            ),
          },
          {
            key: "debit",
            header: "Debit",
            value: (r) => Number(r["debit"]),
            render: (r) => formatAmount(Number(r["debit"]), true),
            align: "right",
          },
          {
            key: "credit",
            header: "Credit",
            value: (r) => Number(r["credit"]),
            render: (r) => formatAmount(Number(r["credit"]), true),
            align: "right",
          },
          {
            key: "balance",
            header: balanceLabel,
            value: (r) => Number(r["balance"]),
            render: (r) => (
              <span className="font-medium">{formatAmount(Number(r["balance"]))}</span>
            ),
            align: "right",
          },
        ]}
      />
      {viewId && <DocumentView id={viewId} onClose={() => setViewId(null)} />}
    </>
  );
}

export function PartyStatement({
  partyType,
  partyId,
  partyName,
}: {
  partyType: "customer" | "supplier" | "staff";
  partyId: string;
  partyName: string;
}) {
  const p = usePeriod();
  const q = useApi(
    ["statement", partyType, partyId, p.from, p.to],
    () => getPartyStatement({ data: { partyType, partyId, from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-end justify-between gap-2">
        <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            window.open(
              `/print/statement?partyType=${partyType}&partyId=${partyId}&from=${p.from}&to=${p.to}`,
              "_blank",
              "noopener",
            )
          }
        >
          <Printer />
          Printable statement
        </Button>
      </div>
      {q.data ? (
        <LedgerTable
          opening={q.data.opening}
          closing={q.data.closing}
          rows={q.data.rows}
          name={`statement-${partyName}`}
          title={`Statement of account – ${partyName} (${formatDate(p.from)} to ${formatDate(p.to)})`}
          balanceLabel={
            partyType === "supplier"
              ? "Payable"
              : partyType === "customer"
                ? "Receivable"
                : "Balance"
          }
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q.error ? String((q.error as Error).message) : "Loading…"}
        </p>
      )}
    </div>
  );
}

export function StockMovement({ productId }: { productId: string }) {
  const p = usePeriod();
  const [viewId, setViewId] = useState<string | null>(null);
  const q = useApi(
    ["stock-movement", productId, p.from, p.to],
    () => getStockMovement({ data: { productId, from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  return (
    <div className="space-y-3">
      <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
      {q.data && (
        <>
          <p className="text-sm">
            Opening quantity: <b>{formatQty(q.data.openingQty)}</b> · Current stock:{" "}
            <b>{formatQty(q.data.product.stockQty)}</b> · Average cost:{" "}
            <b>{formatPKR(q.data.product.avgCost)}</b>
          </p>
          <DataTable
            rows={q.data.rows}
            pageSize={50}
            exportName="stock-movement"
            onRowClick={(r) => setViewId(s(r, "docId"))}
            columns={[
              {
                key: "date",
                header: "Date",
                value: (r) => s(r, "date"),
                render: (r) => formatDate(s(r, "date")),
              },
              {
                key: "docNo",
                header: "Document",
                value: (r) => s(r, "docNo"),
                render: (r) => (
                  <span className="font-medium text-primary">
                    {s(r, "docNo")}{" "}
                    <span className="text-[11px] text-muted-foreground">
                      {DOC_DEFS[s(r, "type") as DocType]?.label}
                      {r["reversal"] ? " (reversal)" : ""}
                    </span>
                  </span>
                ),
              },
              {
                key: "qtyIn",
                header: "In",
                value: (r) => Number(r["qtyIn"]),
                render: (r) => (Number(r["qtyIn"]) ? formatQty(Number(r["qtyIn"])) : ""),
                align: "right",
              },
              {
                key: "qtyOut",
                header: "Out",
                value: (r) => Number(r["qtyOut"]),
                render: (r) => (Number(r["qtyOut"]) ? formatQty(Number(r["qtyOut"])) : ""),
                align: "right",
              },
              {
                key: "unitCost",
                header: "Unit cost",
                value: (r) => Number(r["unitCost"]),
                render: (r) => formatAmount(Number(r["unitCost"])),
                align: "right",
              },
              {
                key: "value",
                header: "Value",
                value: (r) => Number(r["value"]),
                render: (r) => formatAmount(Number(r["value"])),
                align: "right",
              },
              {
                key: "balanceQty",
                header: "Balance qty",
                value: (r) => Number(r["balanceQty"]),
                render: (r) => <b>{formatQty(Number(r["balanceQty"]))}</b>,
                align: "right",
              },
            ]}
          />
        </>
      )}
      {viewId && <DocumentView id={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
