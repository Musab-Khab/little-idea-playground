/**
 * MFAHH database schema (PostgreSQL).
 *
 * Design:
 *  - Masters (customers, suppliers, products, accounts, banks, staff) are never deleted; they go Inactive.
 *  - Every transaction is a row in `documents` (+ `document_lines`), discriminated by `type`.
 *    One posting engine handles submit/approve/cancel for all types.
 *  - `gl_entries` and `stock_ledger` are append-only and written only by the posting engine.
 *    Reports and balances are computed from them.
 *  - Money is numeric(18,2); quantities are integers; unit costs numeric(18,4).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 18, scale: 2, mode: "number" });
const cost = (name: string) => numeric(name, { precision: 18, scale: 4, mode: "number" });
const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const tracking = () => ({
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  editedBy: uuid("edited_by"),
  editedAt: timestamp("edited_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ core */

export const company = pgTable("company", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  ntn: text("ntn").notNull().default(""),
  logoPath: text("logo_path"),
  /** Feature switches, e.g. { makerChecker: true, mfaRoles: ["admin","accountant"] } */
  settings: jsonb("settings").$type<CompanySettings>().notNull().default({}),
});
export interface CompanySettings {
  makerChecker?: boolean;
  mfaRoles?: string[];
  sessionIdleMinutes?: number;
}

export const financialYears = pgTable("financial_years", {
  id: id(),
  label: text("label").notNull().unique(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").$type<"Open" | "Closed">().notNull().default("Open"),
  closedBy: uuid("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const numberSeries = pgTable(
  "number_series",
  {
    prefix: text("prefix").notNull(),
    fyId: uuid("fy_id")
      .notNull()
      .references(() => financialYears.id),
    next: integer("next").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.prefix, t.fyId] })],
);

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  isSystem: boolean("is_system").notNull().default(false),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
    /** TOTP secret, AES-256-GCM encrypted with SESSION_SECRET-derived key. */
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...tracking(),
  },
  (t) => [uniqueIndex("users_email_lower").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token; the raw token is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** false until the second factor is verified (for users with TOTP). */
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** Append-only, hash-chained (hash/prev_hash filled by a DB trigger). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id"),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    ref: text("ref"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    prevHash: text("prev_hash"),
    hash: text("hash"),
  },
  (t) => [index("audit_entity").on(t.entity, t.entityId), index("audit_at").on(t.at)],
);

/* --------------------------------------------------------------- masters */

export const accounts = pgTable("accounts", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").$type<AccountType>().notNull(),
  parentId: uuid("parent_id"),
  /** Stable key for accounts the posting engine needs (AR, AP, CASH, SALES...). */
  systemKey: text("system_key").unique(),
  isGroup: boolean("is_group").notNull().default(false),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
  ...tracking(),
});
export type AccountType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

const party = () => ({
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  contactPerson: text("contact_person").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  ntn: text("ntn").notNull().default(""),
  creditDays: integer("credit_days").notNull().default(0),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
  notes: text("notes").notNull().default(""),
  ...tracking(),
});
export const customers = pgTable("customers", {
  ...party(),
  creditLimit: money("credit_limit").notNull().default(0),
});
export const suppliers = pgTable("suppliers", { ...party() });

export const products = pgTable("products", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  className: text("class_name").notNull().default(""),
  series: text("series").notNull().default(""),
  edition: text("edition").notNull().default(""),
  category: text("category").notNull().default("Textbook"),
  costPrice: money("cost_price").notNull().default(0),
  salePrice: money("sale_price").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  /** Maintained only by the posting engine, under row lock, alongside stock_ledger. */
  stockQty: integer("stock_qty").notNull().default(0),
  avgCost: cost("avg_cost").notNull().default(0),
  damagedQty: integer("damaged_qty").notNull().default(0),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
  ...tracking(),
});

export const priceHistory = pgTable("price_history", {
  id: id(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  oldCost: money("old_cost").notNull(),
  newCost: money("new_cost").notNull(),
  oldSale: money("old_sale").notNull(),
  newSale: money("new_sale").notNull(),
  changedBy: uuid("changed_by"),
  at: createdAt(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  name: text("name").notNull(),
  accountNo: text("account_no").notNull().unique(),
  branch: text("branch").notNull().default(""),
  /** GL account created automatically for this bank. */
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
  ...tracking(),
});

export const expenseHeads = pgTable("expense_heads", {
  id: id(),
  name: text("name").notNull().unique(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
  ...tracking(),
});

/* ------------------------------------------------------------------- HR */

export const staff = pgTable("staff", {
  id: id(),
  empId: text("emp_id").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").$type<"Employee" | "Management">().notNull().default("Employee"),
  department: text("department").notNull().default(""),
  designation: text("designation").notNull().default(""),
  responsibilities: text("responsibilities").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  cnic: text("cnic").notNull().default(""),
  joiningDate: date("joining_date"),
  leavingDate: date("leaving_date"),
  employmentStatus: text("employment_status")
    .$type<"Active" | "Resigned" | "Terminated" | "Inactive">()
    .notNull()
    .default("Active"),
  basic: money("basic").notNull().default(0),
  allowances: money("allowances").notNull().default(0),
  deductions: money("deductions").notNull().default(0),
  ...tracking(),
});

export const attendance = pgTable(
  "attendance",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    date: date("date").notNull(),
    status: text("status").$type<"Present" | "Absent" | "Late" | "Leave">().notNull(),
    markedBy: uuid("marked_by"),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.date] })],
);

export const leaveTypes = pgTable("leave_types", {
  id: id(),
  name: text("name").notNull().unique(),
  daysPerYear: integer("days_per_year").notNull().default(0),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
});

export const leaveApplications = pgTable("leave_applications", {
  id: id(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),
  leaveTypeId: uuid("leave_type_id")
    .notNull()
    .references(() => leaveTypes.id),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  days: integer("days").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status")
    .$type<"Pending" | "Approved" | "Rejected" | "Cancelled">()
    .notNull()
    .default("Pending"),
  decidedBy: uuid("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...tracking(),
});

export const staffDocuments = pgTable("staff_documents", {
  id: id(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  status: text("status").$type<"Active" | "Inactive">().notNull().default("Active"),
  ...tracking(),
});

/* ------------------------------------------------------------- documents */

export type { DocType, DocStatus, PartyType } from "@/shared/documents";
import type { DocType, DocStatus, PartyType } from "@/shared/documents";

export const documents = pgTable(
  "documents",
  {
    id: id(),
    type: text("type").$type<DocType>().notNull(),
    docNo: text("doc_no").notNull().unique(),
    date: date("date").notNull(),
    fyId: uuid("fy_id")
      .notNull()
      .references(() => financialYears.id),
    status: text("status").$type<DocStatus>().notNull().default("Draft"),
    partyType: text("party_type").$type<PartyType>(),
    partyId: uuid("party_id"),
    dueDate: date("due_date"),
    /** Linked document: SR→SI, PR→PI, SI→SO, SMR→SMP, SALPAY→PAYROLL */
    refDocId: uuid("ref_doc_id"),
    reference: text("reference").notNull().default(""),
    /** Cash | Bank | Cheque for money documents */
    method: text("method"),
    bankAccountId: uuid("bank_account_id"),
    chequeNo: text("cheque_no").notNull().default(""),
    expenseHeadId: uuid("expense_head_id"),
    /** PI: Books | Material | Service */
    kind: text("kind"),
    narration: text("narration").notNull().default(""),
    subtotal: money("subtotal").notNull().default(0),
    discount: money("discount").notNull().default(0),
    taxPct: numeric("tax_pct", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
    taxAmount: money("tax_amount").notNull().default(0),
    total: money("total").notNull().default(0),
    /** SI/PI: receipts/payments allocated; SR/PR credits are in credited_amount. */
    paidAmount: money("paid_amount").notNull().default(0),
    creditedAmount: money("credited_amount").notNull().default(0),
    /** Type-specific extras (issuedTo, purpose, expectedReturn, reason, month...). */
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    ...tracking(),
    submittedBy: uuid("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    index("documents_type_date").on(t.type, t.date),
    index("documents_party").on(t.partyType, t.partyId),
    index("documents_ref").on(t.refDocId),
  ],
);

export const documentLines = pgTable(
  "document_lines",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    lineNo: integer("line_no").notNull(),
    productId: uuid("product_id").references(() => products.id),
    accountId: uuid("account_id").references(() => accounts.id),
    partyType: text("party_type").$type<PartyType>(),
    partyId: uuid("party_id"),
    description: text("description").notNull().default(""),
    /** Signed only for ADJ (+ in / − out); positive elsewhere. */
    qty: integer("qty").notNull().default(0),
    rate: money("rate").notNull().default(0),
    discountPct: numeric("discount_pct", { precision: 6, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    amount: money("amount").notNull().default(0),
    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),
    /** Cost per unit used when stock moved (set at approval). */
    unitCost: cost("unit_cost"),
    /** SO: qty invoiced so far. SMP: qty returned so far. SI/PI: qty returned so far. */
    doneQty: integer("done_qty").notNull().default(0),
    /** Line this one derives from (SR line → SI line, SI line → SO line, SMR line → SMP line). */
    refLineId: uuid("ref_line_id"),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("lines_document").on(t.documentId), index("lines_product").on(t.productId)],
);

/** Receipt/payment allocation to invoices. */
export const allocations = pgTable(
  "allocations",
  {
    id: id(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => documents.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => documents.id),
    amount: money("amount").notNull(),
  },
  (t) => [index("alloc_payment").on(t.paymentId), index("alloc_invoice").on(t.invoiceId)],
);

/* --------------------------------------------------------------- ledgers */

export const glEntries = pgTable(
  "gl_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    date: date("date").notNull(),
    fyId: uuid("fy_id")
      .notNull()
      .references(() => financialYears.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),
    partyType: text("party_type").$type<PartyType>(),
    partyId: uuid("party_id"),
    narration: text("narration").notNull().default(""),
    isReversal: boolean("is_reversal").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("gl_account_date").on(t.accountId, t.date),
    index("gl_party").on(t.partyType, t.partyId),
    index("gl_document").on(t.documentId),
  ],
);

export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    date: date("date").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qtyIn: integer("qty_in").notNull().default(0),
    qtyOut: integer("qty_out").notNull().default(0),
    unitCost: cost("unit_cost").notNull(),
    value: money("value").notNull(),
    /** Quantity on hand right after this movement. */
    balanceQty: integer("balance_qty").notNull(),
    isReversal: boolean("is_reversal").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("stock_product_date").on(t.productId, t.date)],
);
