import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/staff/payroll")({
  head: () => ({ meta: [{ title: "Payroll & Loans – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Payroll, Salary Payments & Loans"
      section="Staff & HR"
      types={["PAYROLL", "SALPAY", "LOAN"]}
      create={["PAYROLL", "SALPAY", "LOAN"]}
      columns={[
        "docNo",
        "type",
        "date",
        "month",
        "party",
        "loanType",
        "method",
        "total",
        "status",
        "createdBy",
      ]}
      extraHeader={
        <p className="text-sm text-muted-foreground">
          Monthly flow: create the payroll (loads active staff, salaries and advance recoveries) →
          another authorised user approves it (posts salary expense and payable) → record the salary
          payment from cash or bank. Advances and loans are recovered automatically in later
          payrolls.
        </p>
      }
    />
  ),
});
