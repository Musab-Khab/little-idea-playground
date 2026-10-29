/**
 * Reference data every installation needs: company row, roles, chart of accounts with the
 * system accounts the posting engine relies on, expense heads, leave types and a financial year.
 * Idempotent: existing rows are left untouched.
 */
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";
import { DEFAULT_ROLES } from "@/shared/permissions";
import type { AccountType } from "./schema";

type Acc = {
  code: string;
  name: string;
  type: AccountType;
  key?: string;
  group?: boolean;
  parent?: string;
};

export const DEFAULT_ACCOUNTS: Acc[] = [
  { code: "1000", name: "Assets", type: "Asset", group: true },
  { code: "1100", name: "Cash in Hand", type: "Asset", key: "CASH", parent: "1000" },
  {
    code: "1200",
    name: "Bank Accounts",
    type: "Asset",
    key: "BANK_GROUP",
    group: true,
    parent: "1000",
  },
  { code: "1300", name: "Accounts Receivable", type: "Asset", key: "AR", parent: "1000" },
  {
    code: "1400",
    name: "Inventory – Books & Products",
    type: "Asset",
    key: "INVENTORY",
    parent: "1000",
  },
  { code: "1500", name: "Staff Advances & Loans", type: "Asset", key: "STAFF_ADV", parent: "1000" },
  {
    code: "1600",
    name: "Input Sales Tax Recoverable",
    type: "Asset",
    key: "TAX_INPUT",
    parent: "1000",
  },
  { code: "1700", name: "Fixed Assets", type: "Asset", group: true, parent: "1000" },
  { code: "1710", name: "Furniture & Equipment", type: "Asset", parent: "1700" },
  { code: "1720", name: "Vehicles", type: "Asset", parent: "1700" },
  { code: "1800", name: "Prepayments & Deposits", type: "Asset", parent: "1000" },
  { code: "2000", name: "Liabilities", type: "Liability", group: true },
  { code: "2100", name: "Accounts Payable", type: "Liability", key: "AP", parent: "2000" },
  {
    code: "2200",
    name: "Output Sales Tax Payable",
    type: "Liability",
    key: "TAX_OUTPUT",
    parent: "2000",
  },
  {
    code: "2300",
    name: "Salaries Payable",
    type: "Liability",
    key: "SALARY_PAYABLE",
    parent: "2000",
  },
  {
    code: "2400",
    name: "Payroll Deductions Payable",
    type: "Liability",
    key: "PAYROLL_DEDUCTIONS",
    parent: "2000",
  },
  { code: "2500", name: "Bank Borrowings", type: "Liability", parent: "2000" },
  { code: "2600", name: "Accrued Expenses", type: "Liability", parent: "2000" },
  { code: "3000", name: "Equity", type: "Equity", group: true },
  { code: "3100", name: "Owner's Capital", type: "Equity", key: "CAPITAL", parent: "3000" },
  { code: "3200", name: "Retained Earnings", type: "Equity", key: "RETAINED", parent: "3000" },
  { code: "3300", name: "Opening Balance Equity", type: "Equity", key: "OPENING", parent: "3000" },
  { code: "3400", name: "Drawings", type: "Equity", parent: "3000" },
  { code: "4000", name: "Income", type: "Income", group: true },
  { code: "4100", name: "Book Sales", type: "Income", key: "SALES", parent: "4000" },
  { code: "4200", name: "Sales Returns", type: "Income", key: "SALES_RETURNS", parent: "4000" },
  { code: "4300", name: "Other Income", type: "Income", parent: "4000" },
  { code: "5000", name: "Cost of Sales", type: "Expense", group: true },
  { code: "5100", name: "Cost of Books Sold", type: "Expense", key: "COGS", parent: "5000" },
  {
    code: "5200",
    name: "Paper, Card & Printing Materials",
    type: "Expense",
    key: "MATERIALS",
    parent: "5000",
  },
  {
    code: "5300",
    name: "Printing, Binding & Production Services",
    type: "Expense",
    parent: "5000",
  },
  { code: "5400", name: "Freight & Transportation In", type: "Expense", parent: "5000" },
  { code: "6000", name: "Operating Expenses", type: "Expense", group: true },
  { code: "6100", name: "Salaries & Wages", type: "Expense", key: "SALARY_EXP", parent: "6000" },
  { code: "6110", name: "Rent", type: "Expense", parent: "6000" },
  { code: "6120", name: "Utilities", type: "Expense", parent: "6000" },
  { code: "6130", name: "Transportation", type: "Expense", parent: "6000" },
  { code: "6140", name: "Printing & Stationery (Office)", type: "Expense", parent: "6000" },
  { code: "6150", name: "Marketing & Promotion", type: "Expense", parent: "6000" },
  { code: "6160", name: "Bank Charges", type: "Expense", parent: "6000" },
  { code: "6170", name: "Repairs & Maintenance", type: "Expense", parent: "6000" },
  { code: "6180", name: "Office Supplies", type: "Expense", parent: "6000" },
  { code: "6190", name: "Miscellaneous Expenses", type: "Expense", parent: "6000" },
  {
    code: "6200",
    name: "Sample & Promotional Books",
    type: "Expense",
    key: "SAMPLE_EXP",
    parent: "6000",
  },
  { code: "6300", name: "Stock Adjustments", type: "Expense", key: "STOCK_ADJ", parent: "6000" },
  {
    code: "6310",
    name: "Damaged / Obsolete Stock Written Off",
    type: "Expense",
    key: "STOCK_LOSS",
    parent: "6000",
  },
  { code: "6400", name: "Finance Cost (Markup)", type: "Expense", parent: "6000" },
];

const EXPENSE_HEADS: [string, string][] = [
  ["Salaries", "6100"],
  ["Rent", "6110"],
  ["Utilities", "6120"],
  ["Transportation", "6130"],
  ["Printing", "5300"],
  ["Stationery", "6140"],
  ["Marketing", "6150"],
  ["Bank Charges", "6160"],
  ["Maintenance", "6170"],
  ["Office Supplies", "6180"],
  ["Miscellaneous", "6190"],
];

/** Pakistani financial year (1 July – 30 June) containing `today`. */
export function fyFor(today: string) {
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 7 ? y : y - 1;
  return {
    label: `${start}-${String(start + 1).slice(2)}`,
    startDate: `${start}-07-01`,
    endDate: `${start + 1}-06-30`,
  };
}

export async function seedBaseData(db: DB, today: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(t.company)
      .values({
        id: 1,
        name: "Turnkey Publishers",
        settings: { makerChecker: true, mfaRoles: ["admin", "accountant"], sessionIdleMinutes: 30 },
      })
      .onConflictDoNothing();

    for (const r of DEFAULT_ROLES) {
      await tx
        .insert(t.roles)
        .values({ id: r.id, name: r.name, isSystem: r.id === "admin" })
        .onConflictDoNothing();
      const existing = await tx
        .select()
        .from(t.rolePermissions)
        .where(eq(t.rolePermissions.roleId, r.id));
      if (!existing.length)
        await tx
          .insert(t.rolePermissions)
          .values(r.permissions.map((permission) => ({ roleId: r.id, permission })));
    }

    const ids = new Map<string, string>();
    for (const a of DEFAULT_ACCOUNTS) {
      await tx
        .insert(t.accounts)
        .values({
          code: a.code,
          name: a.name,
          type: a.type,
          systemKey: a.key ?? null,
          isGroup: a.group ?? false,
          parentId: a.parent ? (ids.get(a.parent) ?? null) : null,
        })
        .onConflictDoNothing();
      const [row] = await tx
        .select({ id: t.accounts.id })
        .from(t.accounts)
        .where(eq(t.accounts.code, a.code));
      if (row) ids.set(a.code, row.id);
    }

    for (const [name, code] of EXPENSE_HEADS) {
      const accountId = ids.get(code);
      if (accountId)
        await tx.insert(t.expenseHeads).values({ name, accountId }).onConflictDoNothing();
    }

    for (const [name, days] of [
      ["Casual", 10],
      ["Sick", 8],
      ["Annual", 14],
      ["Unpaid", 0],
    ] as const) {
      await tx.insert(t.leaveTypes).values({ name, daysPerYear: days }).onConflictDoNothing();
    }

    const fy = fyFor(today);
    await tx.insert(t.financialYears).values(fy).onConflictDoNothing();
  });
}
