import {
  LayoutDashboard, ShoppingCart, Truck, Boxes, Users, Factory, ArrowLeftRight,
  BarChart3, Settings, UserCog, type LucideIcon,
} from "lucide-react";

export interface NavChild { title: string; path: string }
export interface NavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
  children?: NavChild[];
}

const kids = (base: string, names: string[]): NavChild[] =>
  names.map((n) => ({ title: n, path: `${base}/${n.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-")}` }));

export const navItems: NavItem[] = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "Sales", path: "/sales", icon: ShoppingCart, permission: "sales.create|sales.approve", children: kids("/sales", ["Invoices", "Orders", "Returns", "Receipts"]) },
  { title: "Purchases", path: "/purchases", icon: Truck, permission: "purchases.create|purchases.approve", children: kids("/purchases", ["Invoices", "Returns", "Payments"]) },
  { title: "Inventory", path: "/inventory", icon: Boxes, permission: "inventory.manage|books.manage|samples.manage", children: kids("/inventory", ["Books", "Stock", "Samples", "Adjustments", "Damaged"]) },
  { title: "Customers", path: "/customers", icon: Users, permission: "customers.manage" },
  { title: "Suppliers", path: "/suppliers", icon: Factory, permission: "suppliers.manage" },
  { title: "Transactions", path: "/transactions", icon: ArrowLeftRight, permission: "accounts.manage|expenses.create", children: kids("/transactions", ["Expenses", "Vouchers", "Journal", "Cash Book", "Bank Accounts", "General Ledger", "Chart of Accounts"]) },
  { title: "Reports", path: "/reports", icon: BarChart3, permission: "reports.view" },
  { title: "Staff & HR", path: "/staff", icon: UserCog, permission: "staff.view", children: kids("/staff", ["Staff", "Attendance & Leave", "Payroll", "Documents"]) },
  { title: "Settings", path: "/settings", icon: Settings, permission: "settings.manage|audit.view", children: kids("/settings", ["Users & Roles", "Financial Years", "Backup & Restore", "Audit Log"]) },
];

export function canAny(can: (p: string) => boolean, spec?: string) {
  return !spec || spec.split("|").some(can);
}

export function findNav(path: string) {
  for (const item of navItems) {
    if (item.path === path) return { section: item, page: undefined };
    const c = item.children?.find((ch) => ch.path === path);
    if (c) return { section: item, page: c };
  }
  return undefined;
}
