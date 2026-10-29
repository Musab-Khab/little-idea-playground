import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/sales/invoices")({
  head: () => ({ meta: [{ title: "Sales Invoices – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Sales Invoices"
      section="Sales"
      types={["SI"]}
      create={["SI"]}
      columns={[
        "docNo",
        "date",
        "party",
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
