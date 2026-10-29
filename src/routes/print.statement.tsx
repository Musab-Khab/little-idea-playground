import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { getAuthState } from "@/server/functions/auth";
import { getPartyStatement } from "@/server/functions/reports";
import { getLookups } from "@/server/functions/masters";
import { PrintShell } from "@/components/print/PrintShell";
import { formatAmount, formatDate } from "@/lib/format";
import { DOC_DEFS, type DocType } from "@/shared/documents";

export const Route = createFileRoute("/print/statement")({
  ssr: false,
  validateSearch: z.object({
    partyType: z.enum(["customer", "supplier", "staff"]),
    partyId: z.string().uuid(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    st: await getPartyStatement({ data: deps }),
    lookups: await getLookups(),
    deps,
  }),
  head: () => ({ meta: [{ title: "Statement – MFAHH" }] }),
  component: PrintStatement,
});

function PrintStatement() {
  const { st, lookups, deps } = Route.useLoaderData();
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  const label =
    deps.partyType === "supplier"
      ? "Payable"
      : deps.partyType === "customer"
        ? "Receivable"
        : "Balance";
  return (
    <PrintShell company={lookups.company} title="Statement of Account">
      <div className="mb-4 flex justify-between text-sm">
        <div>
          <p className="font-semibold">{st.party.name}</p>
          <p>{st.party.code}</p>
          <p>{st.party.address}</p>
          <p>{st.party.phone}</p>
        </div>
        <div className="text-right">
          <p>
            Period: {formatDate(deps.from)} – {formatDate(deps.to)}
          </p>
          <p>
            Closing {label.toLowerCase()}: <b>Rs {formatAmount(st.closing)}</b>
          </p>
        </div>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y-2 border-gray-800 text-left">
            <th className="py-1">Date</th>
            <th>Document</th>
            <th>Particulars</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
            <th className="text-right">{label}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-1">{formatDate(deps.from)}</td>
            <td />
            <td>Opening balance</td>
            <td />
            <td />
            <td className="text-right font-semibold">{formatAmount(st.opening)}</td>
          </tr>
          {st.rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-0.5">{formatDate(String(r["date"]))}</td>
              <td>
                {String(r["docNo"])}{" "}
                <span className="text-gray-500">
                  {DOC_DEFS[String(r["type"]) as DocType]?.label}
                </span>
              </td>
              <td>{String(r["narration"] ?? "")}</td>
              <td className="text-right">{formatAmount(Number(r["debit"]), true)}</td>
              <td className="text-right">{formatAmount(Number(r["credit"]), true)}</td>
              <td className="text-right">{formatAmount(Number(r["balance"]))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-800 font-bold">
            <td colSpan={5} className="py-1">
              Closing balance
            </td>
            <td className="text-right">{formatAmount(st.closing)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-6 text-xs">
        Please report any discrepancy within 15 days of receiving this statement.
      </p>
    </PrintShell>
  );
}
