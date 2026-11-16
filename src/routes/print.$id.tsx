import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { getAuthState } from "@/server/functions/auth";
import { getDocument } from "@/server/functions/documents";
import { getLookups } from "@/server/functions/masters";
import { InvoicePrint } from "@/components/print/InvoicePrint";
import { VoucherPrint } from "@/components/print/VoucherPrint";
import type { DocType } from "@/shared/documents";

/** Printable invoice / voucher / slip. Opens the browser print dialog (use "Save as PDF" for a PDF). */
export const Route = createFileRoute("/print/$id")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
  },
  loader: async ({ params }) => ({
    detail: await getDocument({ data: { id: params.id } }),
    lookups: await getLookups(),
  }),
  head: () => ({ meta: [{ title: "Print – Turnkey Publishers" }] }),
  component: PrintDocument,
});

/** Accounts documents print as vouchers; everything else in the invoice layout. */
const VOUCHER_TYPES: DocType[] = ["RV", "PV", "EXP", "JV", "SALPAY", "LOAN"];

const TITLES: Partial<Record<DocType, string>> = {
  SI: "Sales Invoice",
  SO: "Sales Order",
  SR: "Credit Note",
  PI: "Purchase Invoice",
  PR: "Debit Note",
  SMP: "Sample Issue Slip",
  SMR: "Sample Return Note",
  ADJ: "Stock Adjustment",
  DMG: "Stock Write-off",
  OB: "Opening Balances",
  PAYROLL: "Salary Sheet",
  CLOSE: "Year-end Closing",
};

function PrintDocument() {
  const { detail, lookups } = Route.useLoaderData();
  const d = detail.doc;
  const type = String(d["type"]) as DocType;
  useEffect(() => {
    // Give the logos a moment to load before the print dialog opens.
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  if (VOUCHER_TYPES.includes(type)) {
    return (
      <VoucherPrint
        type={type}
        doc={d}
        lines={detail.lines}
        allocations={detail.allocations.filter((a) => a["direction"] === "allocated to")}
        staffDepartment={lookups.staff.find((x) => x.id === d["partyId"])?.department}
        company={lookups.company}
      />
    );
  }
  return (
    <InvoicePrint
      type={type}
      title={TITLES[type] ?? String(d["typeLabel"] ?? "")}
      doc={d}
      lines={detail.lines}
      company={lookups.company}
    />
  );
}
