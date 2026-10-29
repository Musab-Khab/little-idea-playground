import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/sales/receipts")({
  head: () => ({ meta: [{ title: "Customer Receipts – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Customer Receipts"
      section="Sales"
      types={["RV"]}
      create={["RV"]}
      columns={["docNo", "date", "party", "method", "reference", "total", "status", "createdBy"]}
    />
  ),
});
