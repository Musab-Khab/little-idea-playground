import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/sales/returns")({
  head: () => ({ meta: [{ title: "Sales Returns – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Sales Returns"
      section="Sales"
      types={["SR"]}
      create={["SR"]}
      columns={["docNo", "date", "party", "reason", "total", "status"]}
    />
  ),
});
