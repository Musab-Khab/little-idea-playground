import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/purchases/returns")({
  head: () => ({ meta: [{ title: "Purchase Returns – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Purchase Returns"
      section="Purchases"
      types={["PR"]}
      create={["PR"]}
      columns={["docNo", "date", "party", "reason", "total", "status"]}
    />
  ),
});
