import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";
import { partyFields } from "@/components/masters/partyFields";
import { PartyStatement } from "@/components/reports/Ledger";
import { DocumentListInline } from "@/components/documents/DocumentListInline";
import { formatPKR } from "@/lib/format";
import { SUPPLIER_CATEGORIES } from "@/shared/masters";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers & Vendors – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="suppliers"
      title="Suppliers & Vendors"
      section="Suppliers"
      singular="Supplier"
      editPerm="suppliers.manage"
      fields={[
        ...partyFields,
        {
          key: "category",
          label: "Category",
          type: "select",
          options: SUPPLIER_CATEGORIES,
          required: true,
        },
        { key: "notes", label: "Payment terms / notes", type: "textarea" },
      ]}
      columns={[
        { key: "code", header: "Code" },
        { key: "name", header: "Name" },
        { key: "category", header: "Category" },
        { key: "phone", header: "Phone" },
        { key: "ntn", header: "NTN" },
        { key: "creditDays", header: "Credit days" },
        { key: "balance", header: "Payable", kind: "money" },
        { key: "overdue", header: "Overdue", kind: "money" },
        { key: "status", header: "Status", kind: "status" },
      ]}
      filters={[{ key: "category", label: "Categories" }]}
      kpis={(rows) => {
        const bal = rows.reduce((s, r) => s + Number(r["balance"] ?? 0), 0);
        const od = rows.reduce((s, r) => s + Number(r["overdue"] ?? 0), 0);
        return [
          {
            title: "Active suppliers / vendors",
            value: String(rows.filter((r) => r["status"] === "Active").length),
          },
          { title: "Total payable", value: formatPKR(bal) },
          { title: "Overdue", value: formatPKR(od), danger: od > 0 },
        ];
      }}
      tabs={(r) => [
        {
          id: "statement",
          label: "Statement",
          content: (
            <PartyStatement
              partyType="supplier"
              partyId={String(r["id"])}
              partyName={String(r["name"])}
            />
          ),
        },
        {
          id: "documents",
          label: "Bills & payments",
          content: <DocumentListInline types={["PI", "PR", "PV"]} partyId={String(r["id"])} />,
        },
      ]}
    />
  ),
});
