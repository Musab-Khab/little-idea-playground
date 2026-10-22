import { describe, expect, it } from "vitest";
import * as seed from "@/data/mockData";
import { computeDashboard, resolveRange } from "@/services/dashboardService";
import type { AppData } from "@/store/appStore";

const data = structuredClone(seed) as unknown as AppData;

describe("dashboard figures", () => {
  it("excludes draft/pending invoices from today's sales", () => {
    const k = computeDashboard(data, resolveRange("today"));
    // Approved on 2025-09-12: INV-1024 (25,200) + INV-1023 (39,270)
    expect(k.todaySales).toBe(64470);
  });
  it("counts active out-of-stock books only", () => {
    expect(computeDashboard(data, resolveRange("month")).outOfStock).toBe(2);
  });
  it("counts samples not fully returned as outstanding", () => {
    expect(computeDashboard(data, resolveRange("month")).outstandingSamples).toBe(4);
  });
});
