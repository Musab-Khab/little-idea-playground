import { useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatDate, formatPKR } from "@/lib/format";
import { listDocuments } from "@/server/functions/documents";
import { DOC_DEFS, type DocType } from "@/shared/documents";
import { DocumentView } from "./DocumentView";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

/** Compact list of a party's documents (types the user may see). */
export function DocumentListInline({ types, partyId }: { types: DocType[]; partyId: string }) {
  const { canAny } = useSession();
  const visible = types.filter((t) =>
    canAny(DOC_DEFS[t].createPerm, DOC_DEFS[t].approvePerm, "reports.view"),
  );
  const q = useApi(
    ["documents-inline", visible, partyId],
    () => listDocuments({ data: { types: visible, partyId, limit: 500 } }),
    { enabled: visible.length > 0 },
  );
  const [viewId, setViewId] = useState<string | null>(null);
  return (
    <>
      <DataTable
        rows={q.data ?? []}
        pageSize={10}
        exportName="documents"
        onRowClick={(r) => setViewId(s(r, "id"))}
        columns={[
          {
            key: "docNo",
            header: "Number",
            value: (r) => s(r, "docNo"),
            render: (r) => <span className="font-medium text-primary">{s(r, "docNo")}</span>,
          },
          {
            key: "type",
            header: "Type",
            value: (r) => DOC_DEFS[s(r, "type") as DocType]?.label ?? "",
          },
          {
            key: "date",
            header: "Date",
            value: (r) => s(r, "date"),
            render: (r) => formatDate(s(r, "date")),
          },
          {
            key: "total",
            header: "Amount",
            value: (r) => Number(r["total"]),
            render: (r) => formatPKR(Number(r["total"])),
            align: "right",
          },
          {
            key: "outstanding",
            header: "Outstanding",
            value: (r) => Number(r["outstanding"] ?? 0),
            render: (r) => (r["outstanding"] === null ? "" : formatPKR(Number(r["outstanding"]))),
            align: "right",
          },
          {
            key: "progress",
            header: "Status",
            value: (r) => s(r, "progress"),
            render: (r) => <StatusBadge status={s(r, "progress")} />,
          },
        ]}
      />
      {viewId && <DocumentView id={viewId} onClose={() => setViewId(null)} />}
    </>
  );
}
