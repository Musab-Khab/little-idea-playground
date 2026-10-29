import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/inventory/samples")({
  head: () => ({ meta: [{ title: "Samples – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Samples"
      section="Inventory"
      types={["SMP", "SMR"]}
      create={["SMP", "SMR"]}
      columns={[
        "docNo",
        "type",
        "date",
        "party",
        "issuedTo",
        "purpose",
        "qty",
        "total",
        "progress",
      ]}
    />
  ),
});
