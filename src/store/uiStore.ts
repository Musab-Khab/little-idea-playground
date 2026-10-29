import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type RangeKey = "today" | "week" | "month" | "year" | "custom";

/** Per-browser UI preferences only. Business data always comes from the server. */
interface UiState {
  range: RangeKey;
  customFrom: string;
  customTo: string;
  setRange: (r: RangeKey) => void;
  setCustom: (from: string, to: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      range: "month",
      customFrom: "",
      customTo: "",
      setRange: (range) => set({ range }),
      setCustom: (customFrom, customTo) => set({ customFrom, customTo, range: "custom" }),
    }),
    { name: "mfahh-ui", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

/** Resolves the topbar period against the server's "today" (Pakistan time). */
export function resolveRange(key: RangeKey, today: string, customFrom?: string, customTo?: string) {
  const d = new Date(`${today}T00:00:00Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (key) {
    case "today":
      return { from: today, to: today, label: "Today" };
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7;
      const start = new Date(d);
      start.setUTCDate(d.getUTCDate() - dow);
      return { from: iso(start), to: today, label: "This week" };
    }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today, label: "This month" };
    case "year": {
      const y = d.getUTCFullYear();
      const start = d.getUTCMonth() >= 6 ? y : y - 1;
      return { from: `${start}-07-01`, to: today, label: "This financial year" };
    }
    case "custom":
      return {
        from: customFrom || `${today.slice(0, 7)}-01`,
        to: customTo || today,
        label: "Custom range",
      };
  }
}
