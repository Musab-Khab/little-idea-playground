import { DEMO_TODAY, docTotal, type DeliveryStatus } from "@/data/mockData";
import { useAppStore, type AppData } from "@/store/appStore";

export type SalesOrder = AppData["salesOrders"][number];
export interface OrderLineInput { bookId: string; qty: number; rate: number; discountPct: number }

export const orderTotal = (o: SalesOrder) => docTotal({ items: o.items });
export const orderQty = (o: SalesOrder) => o.items.reduce((s, i) => s + i.qty, 0);
export const orderDelivered = (o: SalesOrder) => o.items.reduce((s, i) => s + i.delivered, 0);

export function deliveryStatus(items: SalesOrder["items"]): DeliveryStatus {
  const q = items.reduce((s, i) => s + i.qty, 0);
  const d = items.reduce((s, i) => s + i.delivered, 0);
  return d === 0 ? "Pending" : d >= q ? "Delivered" : "Partial";
}

/** Next SO number from the number series (auto-increment). */
export function nextOrderNo(data: AppData) {
  return `SO-${data.numberSeries.SO}`;
}

const store = () => useAppStore.getState();
const audit = (user: string, action: string, ref: string, details: string) => ({
  id: `AL${Date.now()}`, at: new Date().toISOString().slice(0, 16), user, action, entity: "Sales Order", ref, details,
});

export const salesOrderService = {
  async create(input: { date: string; customerId: string; items: OrderLineInput[] }, user: string) {
    let no = "";
    store().updateData((d) => {
      no = nextOrderNo(d);
      const order = {
        id: `SO${Date.now()}`, no, date: input.date || DEMO_TODAY, customerId: input.customerId,
        items: input.items.map((i) => ({ ...i, delivered: 0 })), status: "Pending" as DeliveryStatus, createdBy: user,
      };
      return {
        ...d,
        salesOrders: [order, ...d.salesOrders],
        numberSeries: { ...d.numberSeries, SO: d.numberSeries.SO + 1 },
        auditLog: [audit(user, "Created", no, "Sales order created"), ...d.auditLog],
      };
    });
    return no;
  },

  /** Record delivered quantities per line; never above ordered qty. */
  async deliver(id: string, delivered: number[], user: string) {
    store().updateData((d) => ({
      ...d,
      salesOrders: d.salesOrders.map((o) => {
        if (o.id !== id) return o;
        const items = o.items.map((it, i) => ({ ...it, delivered: Math.min(it.qty, Math.max(it.delivered, delivered[i] ?? it.delivered)) }));
        return { ...o, items, status: deliveryStatus(items) };
      }),
      auditLog: [audit(user, "Delivered", d.salesOrders.find((o) => o.id === id)?.no ?? id, "Delivery recorded"), ...d.auditLog],
    }));
  },

  /** No hard delete: cancel keeps the record visible with a reason. */
  async cancel(id: string, reason: string, user: string) {
    store().updateData((d) => ({
      ...d,
      salesOrders: d.salesOrders.map((o) => (o.id === id ? { ...o, status: "Cancelled" as DeliveryStatus, cancelReason: reason, cancelledBy: user } : o)),
      auditLog: [audit(user, "Cancelled", d.salesOrders.find((o) => o.id === id)?.no ?? id, `Reason: ${reason}`), ...d.auditLog],
    }));
  },
};
