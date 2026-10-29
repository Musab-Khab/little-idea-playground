import type { FieldDef } from "./MasterPage";

/** Fields shared by customers and suppliers. */
export const partyFields: FieldDef[] = [
  { key: "code", label: "Code", required: true },
  { key: "name", label: "Name", required: true },
  { key: "contactPerson", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "city", label: "City" },
  { key: "address", label: "Address", wide: true },
  { key: "ntn", label: "NTN" },
  { key: "creditDays", label: "Credit period (days)", type: "number" },
];
