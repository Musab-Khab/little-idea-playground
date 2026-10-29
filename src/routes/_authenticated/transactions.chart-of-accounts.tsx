import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";
import { AccountLedger } from "@/components/reports/AccountLedger";
import { ACCOUNT_TYPES } from "@/shared/masters";

const isSystem = (r: Record<string, unknown>) => Boolean(r["systemKey"]);

export const Route = createFileRoute("/_authenticated/transactions/chart-of-accounts")({
  head: () => ({ meta: [{ title: "Chart of Accounts – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="accounts"
      title="Chart of Accounts"
      section="Accounts"
      singular="Account"
      editPerm="accounts.manage"
      fields={[
        { key: "code", label: "Account code", required: true, lockWhen: isSystem },
        { key: "name", label: "Account name", required: true },
        {
          key: "type",
          label: "Type",
          type: "select",
          options: ACCOUNT_TYPES,
          required: true,
          lockWhen: isSystem,
        },
        {
          key: "parentId",
          label: "Parent group",
          type: "groupAccount",
          accountType: "same",
          lockWhen: isSystem,
        },
        {
          key: "isGroup",
          label: "This is a group (heading) account",
          type: "checkbox",
          lockWhen: isSystem,
        },
      ]}
      defaults={{ type: "Expense", isGroup: false, parentId: null }}
      columns={[
        { key: "code", header: "Code" },
        { key: "name", header: "Name" },
        { key: "type", header: "Type" },
        { key: "systemKey", header: "System use" },
        { key: "isGroup", header: "Group" },
        { key: "balance", header: "Balance (Dr + / Cr −)", kind: "money" },
        { key: "status", header: "Status", kind: "status" },
      ]}
      filters={[{ key: "type", label: "Types" }]}
      kpis={(rows) =>
        ["Asset", "Liability", "Income", "Expense"].map((t) => ({
          title: `${t} accounts`,
          value: String(rows.filter((r) => r["type"] === t && !r["isGroup"]).length),
        }))
      }
      tabs={(r) =>
        r["isGroup"]
          ? []
          : [
              {
                id: "ledger",
                label: "Ledger",
                content: <AccountLedger accountId={String(r["id"])} />,
              },
            ]
      }
    />
  ),
});
