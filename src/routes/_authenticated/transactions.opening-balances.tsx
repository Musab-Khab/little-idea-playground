import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/transactions/opening-balances")({
  head: () => ({ meta: [{ title: "Opening Balances – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Opening Balances"
      section="Accounts"
      types={["OB"]}
      create={["OB"]}
      columns={["docNo", "date", "narration", "total", "status", "createdBy"]}
    />
  ),
});
