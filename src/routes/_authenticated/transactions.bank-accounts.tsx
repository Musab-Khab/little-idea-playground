import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";
import { CashBankBook } from "@/components/reports/AccountLedger";
import { formatPKR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions/bank-accounts")({
  head: () => ({ meta: [{ title: "Bank Accounts – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="bankAccounts"
      title="Bank Accounts"
      section="Accounts"
      singular="Bank Account"
      editPerm="accounts.manage"
      fields={[
        { key: "name", label: "Bank name", required: true },
        { key: "accountNo", label: "Account number / IBAN", required: true },
        { key: "branch", label: "Branch" },
      ]}
      columns={[
        { key: "name", header: "Bank" },
        { key: "accountNo", header: "Account no." },
        { key: "branch", header: "Branch" },
        { key: "glCode", header: "GL code" },
        { key: "balance", header: "Current balance", kind: "money" },
        { key: "status", header: "Status", kind: "status" },
      ]}
      kpis={(rows) => [
        {
          title: "Active accounts",
          value: String(rows.filter((r) => r["status"] === "Active").length),
        },
        {
          title: "Total bank balance",
          value: formatPKR(
            rows
              .filter((r) => r["status"] === "Active")
              .reduce((s, r) => s + Number(r["balance"] ?? 0), 0),
          ),
        },
      ]}
      headerExtra={
        <p className="text-sm text-muted-foreground">
          A ledger account is created automatically for each bank. Enter the opening balance under
          Accounts → Opening Balances.
        </p>
      }
      tabs={(r) => [
        {
          id: "book",
          label: "Bank book",
          content: <CashBankBook bankAccountId={String(r["id"])} />,
        },
      ]}
    />
  ),
});
