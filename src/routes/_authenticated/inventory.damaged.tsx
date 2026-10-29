import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/inventory/damaged")({
  head: () => ({ meta: [{ title: "Damaged & Obsolete Stock – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Damaged & Obsolete Stock"
      section="Inventory"
      types={["DMG"]}
      create={["DMG"]}
      columns={["docNo", "date", "condition", "reason", "total", "status", "createdBy"]}
    />
  ),
});
