import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/sales/orders")({
  head: () => ({ meta: [{ title: "Sales Orders – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Sales Orders"
      section="Sales"
      types={["SO"]}
      create={["SO"]}
      columns={["docNo", "date", "party", "reference", "qty", "total", "status", "progress"]}
    />
  ),
});
