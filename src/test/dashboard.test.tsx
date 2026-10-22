import { describe, expect, it } from "vitest";
import * as seed from "@/data/mockData";
import { computeDashboard, resolveRange } from "@/services/dashboardService";
import type { AppData } from "@/store/appStore";

const data = { ...seed } as unknown as AppData;

describe("dashboard figures", () => {
  it("excludes draft/pending invoices from today's sales", () => {
    const k = computeDashboard(data, resolveRange("today"));
    // Approved on 2025-09-12: INV-1024 (24,300) + INV-1023 (38,770 after Rs 500 discount)
    expect(k.todaySales).toBe(63070);
  });
  it("counts active out-of-stock books only", () => {
    expect(computeDashboard(data, resolveRange("month")).outOfStock).toBe(2);
  });
  it("counts samples not fully returned as outstanding", () => {
    expect(computeDashboard(data, resolveRange("month")).outstandingSamples).toBe(4);
  });
});
