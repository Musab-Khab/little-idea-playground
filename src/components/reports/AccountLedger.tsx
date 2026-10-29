import { DateRangeInputs } from "@/components/shared/Field";
import { useApi } from "@/lib/api";
import { getCashBankBook, getGeneralLedger } from "@/server/functions/reports";
import { formatDate } from "@/lib/format";
import { LedgerTable, usePeriod } from "./Ledger";

export function AccountLedger({ accountId }: { accountId: string }) {
  const p = usePeriod();
  const q = useApi(
    ["gl", accountId, p.from, p.to],
    () => getGeneralLedger({ data: { accountId, from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  return (
    <div className="space-y-3">
      <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
      {q.data ? (
        <LedgerTable
          opening={q.data.opening}
          closing={q.data.closing}
          rows={q.data.rows}
          name={`ledger-${q.data.account}`}
          title={`General ledger – ${q.data.account} (${formatDate(p.from)} to ${formatDate(p.to)})`}
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q.error ? String((q.error as Error).message) : "Loading…"}
        </p>
      )}
    </div>
  );
}

export function CashBankBook({ bankAccountId }: { bankAccountId: string | null }) {
  const p = usePeriod();
  const q = useApi(
    ["cashbook", bankAccountId, p.from, p.to],
    () => getCashBankBook({ data: { bankAccountId, from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  return (
    <div className="space-y-3">
      <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
      {q.data ? (
        <LedgerTable
          opening={q.data.opening}
          closing={q.data.closing}
          rows={q.data.rows}
          name={`book-${q.data.title}`}
          title={`${q.data.title} – ${formatDate(p.from)} to ${formatDate(p.to)}`}
          balanceLabel="Balance"
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q.error ? String((q.error as Error).message) : "Loading…"}
        </p>
      )}
    </div>
  );
}
