import { describe, expect, it } from "vitest";
import { deliveryStatus } from "@/services/salesOrderService";

const line = (qty: number, delivered: number) => ({ bookId: "B001", qty, rate: 300, discountPct: 0, delivered });

describe("sales order delivery status", () => {
  it("is Pending when nothing delivered", () => expect(deliveryStatus([line(10, 0)])).toBe("Pending"));
  it("is Partial when some delivered", () => expect(deliveryStatus([line(10, 4)])).toBe("Partial"));
  it("is Delivered when all delivered", () => expect(deliveryStatus([line(10, 10), line(5, 5)])).toBe("Delivered"));
});
