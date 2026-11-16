/** Starting values for the editable category lists (Manage categories). */
export const CUSTOMER_CATEGORIES = [
  "School",
  "Bookshop",
  "Dealer",
  "Distributor",
  "Institution",
  "Other",
] as const;
export const CUSTOMER_LOCATIONS = ["Karachi", "Out of Karachi"] as const;
export const SUPPLIER_CATEGORIES = [
  "Paper Supplier",
  "Card Supplier",
  "Printer",
  "Binder",
  "Plate Maker",
  "Laminator",
  "Transporter",
  "Designer",
  "Packaging Supplier",
  "Other Service Provider",
] as const;
export const PRODUCT_CATEGORIES = [
  "Textbook",
  "Workbook",
  "Guide",
  "Stationery",
  "Copy / Notebook",
  "Practical Journal",
  "Reference",
  "Brochure",
  "Prospectus",
  "Other",
] as const;

/** Category lists users can add to, rename and deactivate. */
export const CATEGORY_KINDS = {
  customerType: "Customer types",
  customerLocation: "Customer locations",
  supplierCategory: "Supplier categories",
  productCategory: "Book categories",
} as const;
export type CategoryKind = keyof typeof CATEGORY_KINDS;
export const CATEGORY_KIND_KEYS = Object.keys(CATEGORY_KINDS) as [CategoryKind, ...CategoryKind[]];

export const DEFAULT_CATEGORIES: Record<CategoryKind, readonly string[]> = {
  customerType: CUSTOMER_CATEGORIES,
  customerLocation: CUSTOMER_LOCATIONS,
  supplierCategory: SUPPLIER_CATEGORIES,
  productCategory: PRODUCT_CATEGORIES,
};

/** Value used when an import row leaves the category blank. */
export const CATEGORY_FALLBACK: Record<CategoryKind, string> = {
  customerType: "Other",
  customerLocation: "Karachi",
  supplierCategory: "Other Service Provider",
  productCategory: "Textbook",
};

/** Codes given automatically when the Code field is left blank, e.g. CUS-013. */
export const AUTO_CODE_PREFIX = { customers: "CUS", suppliers: "SUP" } as const;

/** Next code after the highest PREFIX-number already used, padded to at least 3 digits. */
export function nextCode(prefix: string, codes: string[]) {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const max = Math.max(0, ...codes.map((c) => Number(re.exec(c)?.[1] ?? 0)));
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
export const STAFF_DOCUMENT_TYPES = [
  "CNIC Copy",
  "Appointment Letter",
  "Contract",
  "Resignation",
  "Other",
] as const;
