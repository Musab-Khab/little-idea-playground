import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SelectField } from "@/components/shared/Field";
import { CashBankBook } from "@/components/reports/AccountLedger";
import { useLookups } from "@/lib/lookups";

export const Route = createFileRoute("/_authenticated/transactions/cash-book")({
  head: () => ({ meta: [{ title: "Cash & Bank Books – MFAHH" }] }),
  component: CashBook,
});

function CashBook() {
  const { data: lk } = useLookups();
  const [book, setBook] = useState("cash");
  return (
    <div className="space-y-5">
      <PageHeader title="Cash & Bank Books" crumbs={["Home", "Accounts", "Cash & Bank Books"]} />
      <section className="card-surface space-y-4 p-4">
        <SelectField
          label="Book"
          className="max-w-sm"
          value={book}
          onChange={setBook}
          options={[
            { value: "cash", label: "Cash in Hand" },
            ...(lk?.bankAccounts ?? []).map((b) => ({
              value: b.id,
              label: `${b.name} (${b.accountNo})`,
            })),
          ]}
        />
        <CashBankBook key={book} bankAccountId={book === "cash" ? null : book} />
      </section>
    </div>
  );
}
