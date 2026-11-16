import type { FieldDef } from "./MasterPage";

/** Fields shared by customers and suppliers; a blank code is numbered automatically. */
export const partyFields: FieldDef[] = [
  { key: "code", label: "Code", autoCode: true },
  { key: "name", label: "Name", required: true },
  { key: "contactPerson", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "city", label: "City" },
  { key: "address", label: "Address", wide: true },
  { key: "ntn", label: "NTN" },
  { key: "creditDays", label: "Credit period (days)", type: "number" },
];
