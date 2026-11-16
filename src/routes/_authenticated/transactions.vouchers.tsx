import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";
import { useSession } from "@/lib/session";
import { VOUCHER_TYPES } from "@/lib/nav";
import { DOC_DEFS } from "@/shared/documents";

export const Route = createFileRoute("/_authenticated/transactions/vouchers")({
  head: () => ({ meta: [{ title: "Vouchers – Turnkey Publishers" }] }),
  component: Vouchers,
});

/** Receipts, supplier payments and expenses in one list (only the kinds this user may see). */
function Vouchers() {
  const { can } = useSession();
  const types = VOUCHER_TYPES.filter(
    (t) => can(DOC_DEFS[t].createPerm) || can(DOC_DEFS[t].approvePerm) || can("reports.view"),
  );
  if (!types.length) return null;
  return (
    <DocumentListPage
      title="Receipt & Payment Vouchers"
      section="Accounts"
      types={types}
      columns={["docNo", "date", "type", "counterparty", "method", "total", "status"]}
    />
  );
}
