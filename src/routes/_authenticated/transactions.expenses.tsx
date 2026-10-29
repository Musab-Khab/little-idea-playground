import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/transactions/expenses")({
  head: () => ({ meta: [{ title: "Expenses – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Expenses"
      section="Accounts"
      types={["EXP"]}
      create={["EXP"]}
      columns={["docNo", "date", "head", "narration", "method", "total", "status", "createdBy"]}
    />
  ),
});
