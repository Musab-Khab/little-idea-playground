import { useState } from "react";
import {
  Ban,
  Check,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Undo2,
  HandCoins,
  FileOutput,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAction, useApi } from "@/lib/api";
import { formatAmount, formatDate, formatDateTime, formatPKR } from "@/lib/format";
import { getDocument, transitionDocument, type DocumentDetail } from "@/server/functions/documents";
import type { DocType } from "@/shared/documents";
import type { DocInput } from "@/server/posting/prepare";
import { DocumentEditor } from "./DocumentEditor";

type Row = DocumentDetail["doc"];
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

/** Converts a stored draft back into editor input. */
function toInput(d: DocumentDetail): Partial<DocInput> {
  const doc = d.doc;
  const extraKeys = [
    "issuedTo",
    "purpose",
    "expectedReturn",
    "reason",
    "condition",
    "month",
    "loanType",
    "installment",
  ];
  return {
    date: s(doc, "date"),
    partyId: (doc["partyId"] as string) ?? null,
    dueDate: (doc["dueDate"] as string) ?? null,
    refDocId: (doc["refDocId"] as string) ?? null,
    reference: s(doc, "reference"),
    method: (doc["method"] as DocInput["method"]) ?? null,
    bankAccountId: (doc["bankAccountId"] as string) ?? null,
    chequeNo: s(doc, "chequeNo"),
    expenseHeadId: (doc["expenseHeadId"] as string) ?? null,
    kind: (doc["kind"] as DocInput["kind"]) ?? null,
    narration: s(doc, "narration"),
    discount: Number(doc["discount"] ?? 0),
    taxPct: Number(doc["taxPct"] ?? 0),
    amount: Number(doc["total"] ?? 0),
    extra: Object.fromEntries(
      extraKeys
        .filter((k) => doc[k] !== undefined && doc[k] !== null)
        .map((k) => [k, doc[k] as string | number]),
    ),
    lines: d.lines.map((l) => ({
      productId: (l["productId"] as string) ?? null,
      accountId: (l["accountId"] as string) ?? null,
      partyType: (l["partyType"] as "customer") ?? null,
      partyId: (l["partyId"] as string) ?? null,
      description: s(l, "description"),
      qty: Number(l["qty"] ?? 0),
      rate: Number(l["rate"] ?? 0),
      discountPct: Number(l["discountPct"] ?? 0),
      debit: Number(l["debit"] ?? 0),
      credit: Number(l["credit"] ?? 0),
      refLineId: (l["refLineId"] as string) ?? null,
      extra: {
        basic: Number(l["basic"] ?? 0),
        allowances: Number(l["allowances"] ?? 0),
        deductions: Number(l["deductions"] ?? 0),
        recovery: Number(l["recovery"] ?? 0),
      },
    })),
    allocations: d.allocations
      .filter((a) => a["direction"] === "allocated to")
      .map((a) => ({ invoiceId: String(a["invoiceId"]), amount: Number(a["amount"]) })),
  };
}

export function DocumentView({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useApi(["document", id], () => getDocument({ data: { id } }));
  const [reasonFor, setReasonFor] = useState<"reject" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [follow, setFollow] = useState<{
    type: DocInput["type"];
    initial: Partial<DocInput>;
  } | null>(null);
  const act = useAction(
    (v: { action: "submit" | "approve" | "reject" | "cancel"; reason?: string }) =>
      transitionDocument({ data: { id, action: v.action, reason: v.reason ?? "" } }),
    () => null,
  );

  const run = async (action: "submit" | "approve" | "reject" | "cancel", r = "") => {
    const msgs = {
      submit: "Sent for approval",
      approve: "Approved and posted to the ledgers",
      reject: "Returned to draft",
      cancel: "Cancelled; all postings reversed",
    };
    try {
      await act.mutateAsync({ action, reason: r });
      setReasonFor(null);
      setReason("");
      toast.success(msgs[action]);
    } catch {
      /* useAction already showed the error */
    }
  };

  if (!q.data) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading…</DialogTitle>
          </DialogHeader>
          {q.error && (
            <p className="text-sm text-destructive">{String((q.error as Error).message)}</p>
          )}
        </DialogContent>
      </Dialog>
    );
  }
  const d = q.data;
  const doc = d.doc;
  const type = s(doc, "type") as DocType;
  const status = s(doc, "status");
  const progress = s(doc, "progress");
  const hasMoney = ["SI", "PI", "SR", "PR", "SO"].includes(type);

  if (editing && type !== "CLOSE")
    return (
      <DocumentEditor
        type={type as DocInput["type"]}
        id={id}
        initial={toInput(d)}
        onClose={() => setEditing(false)}
      />
    );
  if (follow)
    return (
      <DocumentEditor type={follow.type} initial={follow.initial} onClose={() => setFollow(null)} />
    );

  const info: [string, string][] = [
    ["Date", formatDate(s(doc, "date"))],
    ...(doc["partyName"]
      ? [["Party", `${s(doc, "partyName")} (${s(doc, "partyCode")})`] as [string, string]]
      : []),
    ...(doc["dueDate"] ? [["Due date", formatDate(s(doc, "dueDate"))] as [string, string]] : []),
    ...(doc["kind"] ? [["Purchase of", s(doc, "kind")] as [string, string]] : []),
    ...(doc["method"]
      ? [
          [
            "Paid through",
            `${s(doc, "method")}${doc["bankName"] ? ` · ${s(doc, "bankName")}` : ""}${doc["chequeNo"] ? ` · Chq ${s(doc, "chequeNo")}` : ""}`,
          ] as [string, string],
        ]
      : []),
    ...(doc["expenseHead"] ? [["Expense head", s(doc, "expenseHead")] as [string, string]] : []),
    ...(doc["reference"] ? [["Reference", s(doc, "reference")] as [string, string]] : []),
    ...["issuedTo", "purpose", "expectedReturn", "reason", "condition", "month", "loanType"]
      .filter((k) => doc[k])
      .map(
        (k) =>
          [
            k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
            k === "expectedReturn" ? formatDate(s(doc, k)) : s(doc, k),
          ] as [string, string],
      ),
    ...(doc["installment"]
      ? [["Monthly recovery", formatPKR(Number(doc["installment"]))] as [string, string]]
      : []),
    ["Created by", `${s(doc, "createdByName") || "—"} · ${formatDateTime(s(doc, "createdAt"))}`],
    ...(doc["approvedByName"]
      ? [
          [
            "Approved by",
            `${s(doc, "approvedByName")} · ${formatDateTime(s(doc, "approvedAt"))}`,
          ] as [string, string],
        ]
      : []),
    ...(doc["cancelReason"]
      ? [
          ["Cancelled", `${formatDateTime(s(doc, "cancelledAt"))} — ${s(doc, "cancelReason")}`] as [
            string,
            string,
          ],
        ]
      : []),
  ];

  const followUps: {
    label: string;
    icon: typeof Undo2;
    type: DocInput["type"];
    initial: Partial<DocInput>;
  }[] = [];
  if (status === "Approved") {
    const partyId = (doc["partyId"] as string) ?? null;
    const out = Number(doc["outstanding"] ?? 0);
    if (type === "SO" && progress !== "Delivered")
      followUps.push({
        label: "Create invoice",
        icon: FileOutput,
        type: "SI",
        initial: { partyId, refDocId: null },
      });
    if (type === "SI") {
      followUps.push({
        label: "Record return",
        icon: Undo2,
        type: "SR",
        initial: { partyId, refDocId: null },
      });
      if (out > 0)
        followUps.push({
          label: "Receive payment",
          icon: HandCoins,
          type: "RV",
          initial: { partyId, amount: out, allocations: [{ invoiceId: id, amount: out }] },
        });
    }
    if (type === "PI") {
      followUps.push({
        label: "Record return",
        icon: Undo2,
        type: "PR",
        initial: { partyId, refDocId: null },
      });
      if (out > 0)
        followUps.push({
          label: "Make payment",
          icon: HandCoins,
          type: "PV",
          initial: { partyId, amount: out, allocations: [{ invoiceId: id, amount: out }] },
        });
    }
    if (type === "SMP" && progress !== "Returned")
      followUps.push({
        label: "Receive returned samples",
        icon: Undo2,
        type: "SMR",
        initial: { partyId },
      });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            <span>
              {s(doc, "typeLabel")} {s(doc, "docNo")}
            </span>
            <StatusBadge status={status} />
            {progress && progress !== status && <StatusBadge status={progress} />}
          </DialogTitle>
        </DialogHeader>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        {s(doc, "narration") && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">{s(doc, "narration")}</p>
        )}

        <Tabs defaultValue="lines">
          <TabsList className="flex-wrap">
            <TabsTrigger value="lines">Details</TabsTrigger>
            <TabsTrigger value="gl">Accounting entries ({d.gl.length})</TabsTrigger>
            {d.stock.length > 0 && <TabsTrigger value="stock">Stock movement</TabsTrigger>}
            {(d.allocations.length > 0 || d.related.length > 0) && (
              <TabsTrigger value="links">Linked documents</TabsTrigger>
            )}
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="space-y-3">
            <LinesTable type={type} lines={d.lines} />
            {(hasMoney || doc["total"] !== undefined) && (
              <div className="ml-auto max-w-xs space-y-1 text-sm">
                {hasMoney && (
                  <>
                    <Line k="Subtotal" v={Number(doc["subtotal"])} />
                    {Number(doc["discount"]) > 0 && (
                      <Line k="Discount" v={-Number(doc["discount"])} />
                    )}
                    {Number(doc["taxAmount"]) > 0 && (
                      <Line k={`Tax ${s(doc, "taxPct")}%`} v={Number(doc["taxAmount"])} />
                    )}
                  </>
                )}
                <Line
                  k={type === "SMP" || type === "SMR" ? "Value at cost" : "Total"}
                  v={Number(doc["total"])}
                  bold
                />
                {(type === "SI" || type === "PI") && status === "Approved" && (
                  <>
                    <Line k="Paid" v={Number(doc["paidAmount"])} />
                    {Number(doc["creditedAmount"]) > 0 && (
                      <Line k="Returns credited" v={Number(doc["creditedAmount"])} />
                    )}
                    <Line k="Outstanding" v={Number(doc["outstanding"])} bold />
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="gl">
            {d.gl.length ? (
              <SimpleTable
                rows={d.gl}
                cols={[
                  ["account", "Account"],
                  ["party", "Party"],
                  ["narration", "Narration"],
                  ["debit", "Debit", "amt"],
                  ["credit", "Credit", "amt"],
                ]}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {status === "Approved"
                  ? "This document does not post to the ledger."
                  : "Entries are posted when the document is approved."}
              </p>
            )}
          </TabsContent>
          <TabsContent value="stock">
            <SimpleTable
              rows={d.stock}
              cols={[
                ["product", "Book"],
                ["qtyIn", "In"],
                ["qtyOut", "Out"],
                ["unitCost", "Unit cost", "amt"],
                ["value", "Value", "amt"],
                ["balanceQty", "Balance qty"],
              ]}
            />
          </TabsContent>
          <TabsContent value="links" className="space-y-3">
            {d.allocations.length > 0 && (
              <SimpleTable
                rows={d.allocations}
                cols={[
                  ["direction", ""],
                  ["docNo", "Document"],
                  ["date", "Date", "date"],
                  ["amount", "Amount", "amt"],
                ]}
              />
            )}
            {d.related.length > 0 && (
              <SimpleTable
                rows={d.related}
                cols={[
                  ["typeLabel", "Type"],
                  ["docNo", "Number"],
                  ["date", "Date", "date"],
                  ["status", "Status"],
                  ["total", "Total", "amt"],
                ]}
              />
            )}
          </TabsContent>
          <TabsContent value="history">
            <SimpleTable
              rows={d.history}
              cols={[
                ["at", "When", "datetime"],
                ["user", "User"],
                ["action", "Action"],
                ["details", "Details"],
              ]}
            />
          </TabsContent>
        </Tabs>

        {reasonFor && (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <Label htmlFor="reason">
              {reasonFor === "cancel"
                ? status === "Approved"
                  ? "Reason for cancelling — stock, ledgers and balances will be reversed"
                  : "Reason for cancelling"
                : "Reason for returning to draft"}
            </Label>
            <Input
              id="reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={reason.trim().length < 3 || act.isPending}
                onClick={() => run(reasonFor, reason)}
              >
                Confirm
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReasonFor(null)}>
                Keep
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {followUps.map((f) => (
              <Button
                key={f.label}
                variant="secondary"
                size="sm"
                onClick={() => setFollow({ type: f.type, initial: f.initial })}
              >
                <f.icon />
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/print/${id}`, "_blank", "noopener")}
            >
              <Printer />
              Print / PDF
            </Button>
            {d.can.edit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
            )}
            {d.can.submit && (
              <Button
                variant="outline"
                size="sm"
                disabled={act.isPending}
                onClick={() => run("submit")}
              >
                <Send />
                Submit for approval
              </Button>
            )}
            {d.can.reject && (
              <Button variant="outline" size="sm" onClick={() => setReasonFor("reject")}>
                <RotateCcw />
                Return to draft
              </Button>
            )}
            {d.can.cancel && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setReasonFor("cancel")}
              >
                <Ban />
                {status === "Approved" ? "Cancel & reverse" : "Cancel"}
              </Button>
            )}
            {d.can.approve && (
              <Button size="sm" disabled={act.isPending} onClick={() => run("approve")}>
                <Check />
                Approve & post
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t pt-1 font-bold text-navy" : ""}`}>
      <span>{k}</span>
      <span className="tabular-nums">{formatPKR(v)}</span>
    </div>
  );
}

type Col = [key: string, header: string, kind?: "amt" | "date" | "datetime"];
export function SimpleTable({ rows, cols }: { rows: Row[]; cols: Col[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {cols.map(([k, h, kind]) => (
              <th
                key={k}
                className={`px-3 py-2 text-left text-xs font-semibold text-muted-foreground ${kind === "amt" ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`border-t ${r["reversal"] === true ? "text-muted-foreground italic" : ""}`}
            >
              {cols.map(([k, , kind]) => (
                <td
                  key={k}
                  className={`px-3 py-1.5 ${kind === "amt" ? "text-right tabular-nums" : ""}`}
                >
                  {kind === "amt"
                    ? formatAmount(Number(r[k] ?? 0), true)
                    : kind === "date"
                      ? formatDate(s(r, k))
                      : kind === "datetime"
                        ? formatDateTime(s(r, k))
                        : s(r, k)}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={cols.length} className="p-4 text-center text-muted-foreground">
                Nothing to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LinesTable({ type, lines }: { type: DocType; lines: Row[] }) {
  if (type === "JV" || type === "OB" || type === "CLOSE") {
    return (
      <SimpleTable
        rows={lines.map((l) => ({
          ...l,
          item: l["productName"]
            ? `${s(l, "productCode")} ${s(l, "productName")}`
            : l["partyName"]
              ? `${s(l, "partyType")}: ${s(l, "partyName")}`
              : `${s(l, "accountCode")} ${s(l, "accountName")}`,
          value: l["productId"] ? Number(l["amount"]) : Number(l["debit"]),
        }))}
        cols={[
          ["item", "Account / item"],
          ["description", "Note"],
          ["qty", "Qty"],
          ["value", "Debit / value", "amt"],
          ["credit", "Credit", "amt"],
        ]}
      />
    );
  }
  if (type === "PAYROLL") {
    return (
      <SimpleTable
        rows={lines}
        cols={[
          ["partyName", "Employee"],
          ["basic", "Basic", "amt"],
          ["allowances", "Allowances", "amt"],
          ["deductions", "Deductions", "amt"],
          ["recovery", "Recovery", "amt"],
          ["amount", "Net", "amt"],
        ]}
      />
    );
  }
  if (type === "SALPAY")
    return (
      <SimpleTable
        rows={lines}
        cols={[
          ["partyName", "Employee"],
          ["amount", "Paid", "amt"],
        ]}
      />
    );
  if (["RV", "PV", "EXP", "LOAN"].includes(type)) return null;
  const rows = lines.map((l) => ({
    ...l,
    item: l["productName"]
      ? `${s(l, "productCode")} · ${s(l, "productName")}`
      : `${s(l, "accountName")}: ${s(l, "description")}`,
  }));
  const cols: Col[] = [
    ["item", "Item"],
    ["qty", "Qty"],
  ];
  if (type === "SO" || type === "SMP" || type === "SI" || type === "PI")
    cols.push(["doneQty", type === "SO" ? "Delivered" : "Returned"]);
  if (!["SMP", "SMR", "ADJ", "DMG"].includes(type))
    cols.push(["rate", "Rate", "amt"], ["discountPct", "Disc %"], ["amount", "Amount", "amt"]);
  else cols.push(["unitCost", "Unit cost", "amt"]);
  return <SimpleTable rows={rows} cols={cols} />;
}
