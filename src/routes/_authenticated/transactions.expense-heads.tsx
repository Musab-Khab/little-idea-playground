import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";

export const Route = createFileRoute("/_authenticated/transactions/expense-heads")({
  head: () => ({ meta: [{ title: "Expense Heads – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="expenseHeads"
      title="Expense Heads"
      section="Accounts"
      singular="Expense Head"
      editPerm="accounts.manage"
      fields={[
        { key: "name", label: "Expense head", required: true },
        {
          key: "accountId",
          label: "Posts to expense account",
          type: "account",
          accountType: "Expense",
          required: true,
        },
      ]}
      columns={[
        { key: "name", header: "Expense head" },
        { key: "account", header: "Ledger account" },
        { key: "status", header: "Status", kind: "status" },
      ]}
    />
  ),
});
