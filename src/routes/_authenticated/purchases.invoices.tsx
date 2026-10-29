import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/purchases/invoices")({
  head: () => ({ meta: [{ title: "Purchase Invoices – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Purchase Invoices"
      section="Purchases"
      types={["PI"]}
      create={["PI"]}
      columns={[
        "docNo",
        "date",
        "party",
        "kind",
        "reference",
        "total",
        "outstanding",
        "dueDate",
        "status",
        "progress",
      ]}
    />
  ),
});
