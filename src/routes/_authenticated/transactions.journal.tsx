import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/transactions/journal")({
  head: () => ({ meta: [{ title: "Journal Vouchers – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Journal Vouchers"
      section="Accounts"
      types={["JV"]}
      create={["JV"]}
      columns={["docNo", "date", "narration", "total", "status", "createdBy"]}
    />
  ),
});
