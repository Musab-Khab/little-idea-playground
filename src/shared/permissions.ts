/** Permission keys shared by the server (enforcement) and the client (hiding UI). */
export const PERMISSIONS = {
  "dashboard.view": "View dashboard",
  "customers.manage": "Manage customers",
  "suppliers.manage": "Manage suppliers / vendors",
  "books.manage": "Manage books & products",
  "books.price_edit": "Change cost / sale prices",
  "inventory.manage": "Stock adjustments & damaged stock",
  "inventory.approve": "Approve stock adjustments / write-offs",
  "stock.negative_allow": "Allow negative stock",
  "samples.manage": "Issue and receive samples",
  "sales.create": "Create sales orders, invoices, returns, receipts",
  "sales.approve": "Approve sales documents",
  "purchases.create": "Create purchase invoices, returns, payments",
  "purchases.approve": "Approve purchase documents",
  "expenses.create": "Create expenses",
  "expenses.approve": "Approve expenses",
  "accounts.manage": "Chart of accounts, banks, journal vouchers, opening balances",
  "accounts.approve": "Approve journal vouchers & opening balances",
  "docs.cancel": "Cancel / reverse approved documents",
  "reports.view": "View reports",
  "reports.export": "Export / print reports",
  "staff.view": "View staff records",
  "staff.manage": "Manage staff, attendance, leave, documents",
  "hr.salary_view": "View salaries, CNIC and staff documents",
  "payroll.manage": "Prepare payroll, advances, loans",
  "payroll.approve": "Approve payroll and salary payments",
  "settings.manage": "Company settings & financial years",
  "users.manage": "Users and roles",
  "audit.view": "View audit log",
  "backup.manage": "Backup and restore",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

/** Default roles created on first setup. Admin always has every permission. */
export const DEFAULT_ROLES: { id: string; name: string; permissions: Permission[] }[] = [
  { id: "admin", name: "Admin", permissions: PERMISSION_KEYS },
  {
    id: "accountant",
    name: "Accountant",
    permissions: [
      "dashboard.view",
      "customers.manage",
      "suppliers.manage",
      "sales.approve",
      "purchases.approve",
      "expenses.create",
      "expenses.approve",
      "accounts.manage",
      "accounts.approve",
      "docs.cancel",
      "reports.view",
      "reports.export",
      "audit.view",
      "inventory.approve",
      "payroll.approve",
    ],
  },
  {
    id: "sales",
    name: "Sales",
    permissions: [
      "dashboard.view",
      "customers.manage",
      "sales.create",
      "samples.manage",
      "reports.view",
    ],
  },
  {
    id: "store",
    name: "Store Keeper",
    permissions: [
      "dashboard.view",
      "books.manage",
      "inventory.manage",
      "samples.manage",
      "purchases.create",
    ],
  },
  {
    id: "hr",
    name: "HR",
    permissions: [
      "dashboard.view",
      "staff.view",
      "staff.manage",
      "hr.salary_view",
      "payroll.manage",
    ],
  },
];
