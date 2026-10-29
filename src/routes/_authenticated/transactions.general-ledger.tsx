import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Field } from "@/components/shared/Field";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { AccountLedger } from "@/components/reports/AccountLedger";
import { useLookups } from "@/lib/lookups";

export const Route = createFileRoute("/_authenticated/transactions/general-ledger")({
  head: () => ({ meta: [{ title: "General Ledger – MFAHH" }] }),
  component: GeneralLedger,
});

function GeneralLedger() {
  const { data: lk } = useLookups();
  const [accountId, setAccountId] = useState<string | null>(null);
  const accounts = (lk?.accounts ?? []).filter((a) => !a.isGroup);
  return (
    <div className="space-y-5">
      <PageHeader title="General Ledger" crumbs={["Home", "Accounts", "General Ledger"]} />
      <section className="card-surface space-y-4 p-4">
        <Field label="Account" className="max-w-md">
          <SearchSelect
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.code} ${a.name}`,
              hint: a.type,
            }))}
            value={accountId}
            onChange={setAccountId}
            placeholder="Choose an account…"
          />
        </Field>
        {accountId ? (
          <AccountLedger key={accountId} accountId={accountId} />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            Choose an account to see every posting with a running balance.
          </p>
        )}
      </section>
    </div>
  );
}
