import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/inventory/adjustments")({
  head: () => ({ meta: [{ title: "Stock Adjustments – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Stock Adjustments"
      section="Inventory"
      types={["ADJ"]}
      create={["ADJ"]}
      columns={["docNo", "date", "reference", "reason", "total", "status", "createdBy"]}
    />
  ),
});
