import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Unlock, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TextField } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatDate, formatDateTime, formatPKR } from "@/lib/format";
import {
  closeFinancialYear,
  createFinancialYear,
  listFinancialYears,
  reopenFinancialYear,
} from "@/server/functions/admin";

export const Route = createFileRoute("/_authenticated/settings/financial-years")({
  head: () => ({ meta: [{ title: "Financial Years – MFAHH" }] }),
  component: FinancialYears,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

function FinancialYears() {
  const { user } = useSession();
  const q = useApi(["fys"], () => listFinancialYears());
  const [form, setForm] = useState({ label: "", startDate: "", endDate: "" });
  const [confirm, setConfirm] = useState<{ row: Row; action: "close" | "reopen" } | null>(null);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const create = useAction(() => createFinancialYear({ data: form }), "Financial year created");
  const close = useAction(
    (id: string) => closeFinancialYear({ data: { id, code } }),
    (r) =>
      `Year closed. Net profit ${formatPKR(r.netProfit)} transferred to retained earnings (${r.closingEntry}).`,
  );
  const reopen = useAction(
    (id: string) => reopenFinancialYear({ data: { id, code, reason } }),
    "Year re-opened",
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Financial Years" crumbs={["Home", "Settings", "Financial Years"]} />
      <section className="card-surface flex flex-wrap items-end gap-3 p-4">
        <TextField
          label="Label"
          placeholder="2026-27"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
        />
        <TextField
          label="Starts"
          type="date"
          value={form.startDate}
          onChange={(v) => setForm({ ...form, startDate: v })}
        />
        <TextField
          label="Ends"
          type="date"
          value={form.endDate}
          onChange={(v) => setForm({ ...form, endDate: v })}
        />
        <Button disabled={create.isPending} onClick={() => create.mutate(undefined)}>
          <Plus />
          Create year
        </Button>
      </section>
      <section className="card-surface p-4">
        <DataTable
          rows={q.data ?? []}
          exportName="financial-years"
          columns={[
            {
              key: "label",
              header: "Year",
              value: (r) => s(r, "label"),
              render: (r) => <b>{s(r, "label")}</b>,
            },
            {
              key: "startDate",
              header: "Starts",
              value: (r) => s(r, "startDate"),
              render: (r) => formatDate(s(r, "startDate")),
            },
            {
              key: "endDate",
              header: "Ends",
              value: (r) => s(r, "endDate"),
              render: (r) => formatDate(s(r, "endDate")),
            },
            {
              key: "unposted",
              header: "Unapproved docs",
              value: (r) => Number(r["unposted"]),
              align: "right",
            },
            {
              key: "status",
              header: "Status",
              value: (r) => s(r, "status"),
              render: (r) => <StatusBadge status={s(r, "status")} />,
            },
            {
              key: "closedAt",
              header: "Closed",
              value: (r) => s(r, "closedAt"),
              render: (r) => formatDateTime(s(r, "closedAt")),
            },
            {
              key: "actions",
              header: "Actions",
              value: () => "",
              render: (r) =>
                r["status"] === "Open" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCode("");
                      setConfirm({ row: r, action: "close" });
                    }}
                  >
                    <Lock />
                    Close year
                  </Button>
                ) : (
                  user.roleId === "admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCode("");
                        setReason("");
                        setConfirm({ row: r, action: "reopen" });
                      }}
                    >
                      <Unlock />
                      Re-open
                    </Button>
                  )
                ),
            },
          ]}
        />
      </section>
      {confirm && (
        <Dialog open onOpenChange={() => setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirm.action === "close" ? "Close" : "Re-open"} financial year{" "}
                {s(confirm.row, "label")}
              </DialogTitle>
              <DialogDescription>
                {confirm.action === "close"
                  ? "All documents must be approved or cancelled. Income and expense balances are transferred to Retained Earnings and the year becomes read-only. Previous years stay viewable."
                  : "The closing entry will be reversed and the year becomes editable again. This is recorded in the audit log."}
              </DialogDescription>
            </DialogHeader>
            {confirm.action === "reopen" && (
              <TextField label="Reason" required value={reason} onChange={setReason} />
            )}
            <label className="text-sm font-medium" htmlFor="mfa-code">
              Your authenticator code
            </label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={code.length !== 6 || close.isPending || reopen.isPending}
                onClick={() =>
                  (confirm.action === "close" ? close : reopen).mutate(s(confirm.row, "id"), {
                    onSuccess: () => setConfirm(null),
                  })
                }
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
