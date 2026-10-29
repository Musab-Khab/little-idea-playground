import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeInputs, TextField } from "@/components/shared/Field";
import { usePeriod } from "@/components/reports/Ledger";
import { Button } from "@/components/ui/button";
import { useAction, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { listAuditLog, verifyAuditChain } from "@/server/functions/admin";

export const Route = createFileRoute("/_authenticated/settings/audit-log")({
  head: () => ({ meta: [{ title: "Audit Log – MFAHH" }] }),
  component: AuditLog,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

function AuditLog() {
  const p = usePeriod();
  const [search, setSearch] = useState("");
  const q = useApi(
    ["audit", p.from, p.to, search],
    () => listAuditLog({ data: { from: p.from, to: p.to, search } }),
    { enabled: p.ready },
  );
  const verify = useAction(
    () => verifyAuditChain(),
    (r) =>
      r.intact
        ? `Audit trail intact (${r.entries} entries verified).`
        : `WARNING: audit trail was altered at entry #${r.brokenAt}.`,
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        crumbs={["Home", "Settings", "Audit Log"]}
        actions={
          <Button
            variant="outline"
            disabled={verify.isPending}
            onClick={() => verify.mutate(undefined)}
          >
            <ShieldCheck />
            Verify audit trail
          </Button>
        }
      />
      <section className="card-surface space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <TextField
            label="Filter by user, action, entity or reference"
            className="w-80"
            value={search}
            onChange={setSearch}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Every create, edit, approval, cancellation, sign-in, permission change, export and backup
          is recorded here. Entries are chained with cryptographic hashes, so changes made directly
          in the database are detectable with "Verify audit trail".
        </p>
        <DataTable
          rows={q.data ?? []}
          pageSize={50}
          exportName="audit-log"
          columns={[
            {
              key: "at",
              header: "When",
              value: (r) => s(r, "at"),
              render: (r) => (
                <span className="whitespace-nowrap">{formatDateTime(s(r, "at"))}</span>
              ),
            },
            { key: "user", header: "User", value: (r) => s(r, "user") },
            {
              key: "action",
              header: "Action",
              value: (r) => s(r, "action"),
              render: (r) => <b>{s(r, "action")}</b>,
            },
            { key: "entity", header: "Record", value: (r) => s(r, "entity") },
            { key: "ref", header: "Reference", value: (r) => s(r, "ref") },
            { key: "ip", header: "IP", value: (r) => s(r, "ip") },
            {
              key: "details",
              header: "Details",
              value: (r) => s(r, "details"),
              render: (r) => (
                <span className="line-clamp-2 max-w-md break-all font-mono text-[11px]">
                  {s(r, "details") === "{}" ? "" : s(r, "details")}
                </span>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
