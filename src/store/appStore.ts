import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as seed from "@/data/mockData";

export type RangeKey = "today" | "week" | "month" | "year" | "custom";

function seedData() {
  // structuredClone keeps the seed module untouched when stores mutate
  return structuredClone({
    customers: seed.customers,
    suppliers: seed.suppliers,
    books: seed.books,
    salesInvoices: seed.salesInvoices,
    salesOrders: seed.salesOrders,
    salesReturns: seed.salesReturns,
    customerReceipts: seed.customerReceipts,
    purchaseInvoices: seed.purchaseInvoices,
    purchaseReturns: seed.purchaseReturns,
    supplierPayments: seed.supplierPayments,
    samples: seed.samples,
    stockMovements: seed.stockMovements,
    stockAdjustments: seed.stockAdjustments,
    expenses: seed.expenses,
    bankAccounts: seed.bankAccounts,
    chartOfAccounts: seed.chartOfAccounts,
    journalVouchers: seed.journalVouchers,
    auditLog: seed.auditLog,
    numberSeries: seed.numberSeries,
    roles: seed.roles,
  });
}

export type AppData = ReturnType<typeof seedData>;

interface AppState {
  data: AppData;
  roleId: string;
  fyId: string;
  range: RangeKey;
  customFrom: string;
  customTo: string;
  setRole: (id: string) => void;
  setFy: (id: string) => void;
  setRange: (r: RangeKey) => void;
  setCustom: (from: string, to: string) => void;
  resetDemo: () => void;
  updateData: (fn: (d: AppData) => AppData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      data: seedData(),
      roleId: "admin",
      fyId: seed.financialYears[0]!.id,
      range: "month",
      customFrom: "2025-07-01",
      customTo: seed.DEMO_TODAY,
      setRole: (roleId) => set({ roleId }),
      setFy: (fyId) => set({ fyId }),
      setRange: (range) => set({ range }),
      setCustom: (customFrom, customTo) => set({ customFrom, customTo, range: "custom" }),
      resetDemo: () => set({ data: seedData() }),
      updateData: (fn) => set((s) => ({ data: fn(s.data) })),
    }),
    {
      name: "mfahh-store",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
