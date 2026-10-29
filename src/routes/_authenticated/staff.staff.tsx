import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";
import { PartyStatement } from "@/components/reports/Ledger";
import { useSession } from "@/lib/session";
import { formatPKR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff/staff")({
  head: () => ({ meta: [{ title: "Staff & Management – MFAHH" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { can } = useSession();
  return (
    <MasterPage
      entity="staff"
      title="Staff & Management"
      section="Staff & HR"
      singular="Staff Member"
      editPerm="staff.manage"
      fields={[
        { key: "empId", label: "Employee ID", required: true },
        { key: "name", label: "Full name", required: true },
        {
          key: "type",
          label: "Type",
          type: "select",
          options: ["Employee", "Management"],
          required: true,
        },
        { key: "designation", label: "Designation" },
        { key: "department", label: "Department" },
        {
          key: "employmentStatus",
          label: "Employment status",
          type: "select",
          options: ["Active", "Resigned", "Terminated", "Inactive"],
          required: true,
        },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email", type: "email" },
        { key: "joiningDate", label: "Joining date", type: "date" },
        { key: "leavingDate", label: "Leaving date", type: "date" },
        { key: "address", label: "Address", wide: true },
        { key: "responsibilities", label: "Responsibilities (management)", type: "textarea" },
        { key: "cnic", label: "CNIC", perm: "hr.salary_view" },
        { key: "basic", label: "Basic salary (Rs)", type: "number", perm: "hr.salary_view" },
        { key: "allowances", label: "Allowances (Rs)", type: "number", perm: "hr.salary_view" },
        {
          key: "deductions",
          label: "Monthly deductions (Rs)",
          type: "number",
          perm: "hr.salary_view",
        },
      ]}
      defaults={{ type: "Employee", employmentStatus: "Active" }}
      columns={[
        { key: "empId", header: "Emp ID" },
        { key: "name", header: "Name" },
        { key: "type", header: "Type" },
        { key: "designation", header: "Designation" },
        { key: "department", header: "Department" },
        { key: "phone", header: "Phone" },
        { key: "basic", header: "Basic", kind: "money", perm: "hr.salary_view" },
        { key: "advances", header: "Advances due", kind: "money", perm: "hr.salary_view" },
        { key: "employmentStatus", header: "Status", kind: "badge" },
      ]}
      filters={[
        { key: "department", label: "Departments" },
        { key: "type", label: "Types" },
        { key: "employmentStatus", label: "Employment statuses" },
      ]}
      kpis={(rows) => {
        const active = rows.filter((r) => r["employmentStatus"] === "Active");
        return [
          {
            title: "Active staff",
            value: String(active.length),
            sub: `${active.filter((r) => r["type"] === "Management").length} management`,
          },
          { title: "Left / inactive", value: String(rows.length - active.length) },
          ...(can("hr.salary_view")
            ? [
                {
                  title: "Monthly gross payroll",
                  value: formatPKR(
                    active.reduce(
                      (s, r) => s + Number(r["basic"] ?? 0) + Number(r["allowances"] ?? 0),
                      0,
                    ),
                  ),
                },
                {
                  title: "Advances outstanding",
                  value: formatPKR(rows.reduce((s, r) => s + Number(r["advances"] ?? 0), 0)),
                },
              ]
            : []),
        ];
      }}
      tabs={(r) =>
        can("hr.salary_view")
          ? [
              {
                id: "ledger",
                label: "Employee ledger",
                content: (
                  <PartyStatement
                    partyType="staff"
                    partyId={String(r["id"])}
                    partyName={String(r["name"])}
                  />
                ),
              },
            ]
          : []
      }
    />
  );
}
