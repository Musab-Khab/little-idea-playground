import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/purchases/payments")({
  head: () => ({ meta: [{ title: "Supplier Payments – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Supplier Payments"
      section="Purchases"
      types={["PV"]}
      create={["PV"]}
      columns={["docNo", "date", "party", "method", "reference", "total", "status", "createdBy"]}
    />
  ),
});
