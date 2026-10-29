import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Boxes,
  Users,
  Factory,
  ArrowLeftRight,
  BarChart3,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/shared/permissions";

export interface NavChild {
  title: string;
  path: string;
  perms?: Permission[];
}
export interface NavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  perms?: Permission[];
  children?: NavChild[];
}

export const navItems: NavItem[] = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard, perms: ["dashboard.view"] },
  {
    title: "Sales",
    path: "/sales",
    icon: ShoppingCart,
    perms: ["sales.create", "sales.approve"],
    children: [
      { title: "Invoices", path: "/sales/invoices" },
      { title: "Orders", path: "/sales/orders" },
      { title: "Returns", path: "/sales/returns" },
      { title: "Receipts", path: "/sales/receipts" },
    ],
  },
  {
    title: "Purchases",
    path: "/purchases",
    icon: Truck,
    perms: ["purchases.create", "purchases.approve"],
    children: [
      { title: "Invoices", path: "/purchases/invoices" },
      { title: "Returns", path: "/purchases/returns" },
      { title: "Payments", path: "/purchases/payments" },
    ],
  },
  {
    title: "Inventory",
    path: "/inventory",
    icon: Boxes,
    perms: [
      "books.manage",
      "inventory.manage",
      "inventory.approve",
      "samples.manage",
      "reports.view",
    ],
    children: [
      {
        title: "Books & Products",
        path: "/inventory/books",
        perms: ["books.manage", "reports.view"],
      },
      {
        title: "Stock",
        path: "/inventory/stock",
        perms: ["books.manage", "inventory.manage", "reports.view"],
      },
      { title: "Samples", path: "/inventory/samples", perms: ["samples.manage", "reports.view"] },
      {
        title: "Adjustments",
        path: "/inventory/adjustments",
        perms: ["inventory.manage", "inventory.approve"],
      },
      {
        title: "Damaged Stock",
        path: "/inventory/damaged",
        perms: ["inventory.manage", "inventory.approve"],
      },
    ],
  },
  {
    title: "Customers",
    path: "/customers",
    icon: Users,
    perms: ["customers.manage", "reports.view"],
  },
  {
    title: "Suppliers",
    path: "/suppliers",
    icon: Factory,
    perms: ["suppliers.manage", "reports.view"],
  },
  {
    title: "Accounts",
    path: "/transactions",
    icon: ArrowLeftRight,
    perms: [
      "accounts.manage",
      "accounts.approve",
      "expenses.create",
      "expenses.approve",
      "reports.view",
    ],
    children: [
      {
        title: "Expenses",
        path: "/transactions/expenses",
        perms: ["expenses.create", "expenses.approve"],
      },
      {
        title: "Journal Vouchers",
        path: "/transactions/journal",
        perms: ["accounts.manage", "accounts.approve"],
      },
      {
        title: "Cash & Bank Books",
        path: "/transactions/cash-book",
        perms: ["accounts.manage", "reports.view"],
      },
      { title: "Bank Accounts", path: "/transactions/bank-accounts", perms: ["accounts.manage"] },
      {
        title: "General Ledger",
        path: "/transactions/general-ledger",
        perms: ["accounts.manage", "reports.view"],
      },
      {
        title: "Chart of Accounts",
        path: "/transactions/chart-of-accounts",
        perms: ["accounts.manage", "reports.view"],
      },
      { title: "Expense Heads", path: "/transactions/expense-heads", perms: ["accounts.manage"] },
      {
        title: "Opening Balances",
        path: "/transactions/opening-balances",
        perms: ["accounts.manage", "accounts.approve"],
      },
    ],
  },
  { title: "Reports", path: "/reports", icon: BarChart3, perms: ["reports.view"] },
  {
    title: "Staff & HR",
    path: "/staff",
    icon: UserCog,
    perms: ["staff.view", "staff.manage", "payroll.manage", "payroll.approve"],
    children: [
      { title: "Staff", path: "/staff/staff", perms: ["staff.view", "staff.manage"] },
      {
        title: "Attendance & Leave",
        path: "/staff/attendance-and-leave",
        perms: ["staff.view", "staff.manage"],
      },
      {
        title: "Payroll & Loans",
        path: "/staff/payroll",
        perms: ["payroll.manage", "payroll.approve"],
      },
      { title: "Documents", path: "/staff/documents", perms: ["hr.salary_view"] },
    ],
  },
  {
    title: "Settings",
    path: "/settings",
    icon: Settings,
    perms: ["settings.manage", "users.manage", "audit.view", "backup.manage", "accounts.manage"],
    children: [
      { title: "Company", path: "/settings/company", perms: ["settings.manage"] },
      { title: "Users & Roles", path: "/settings/users-and-roles", perms: ["users.manage"] },
      { title: "Financial Years", path: "/settings/financial-years", perms: ["settings.manage"] },
      {
        title: "Data Import",
        path: "/settings/data-import",
        perms: ["customers.manage", "suppliers.manage", "books.manage", "accounts.manage"],
      },
      { title: "Backup & Restore", path: "/settings/backup-and-restore", perms: ["backup.manage"] },
      { title: "Audit Log", path: "/settings/audit-log", perms: ["audit.view"] },
    ],
  },
];

export const allowed = (canAny: (...p: Permission[]) => boolean, perms?: Permission[]) =>
  !perms || canAny(...perms);
