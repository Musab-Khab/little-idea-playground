import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Clock, PackageCheck, Truck, Plus, Trash2, Eye, Ban } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { usePermissions } from "@/lib/permissions";
import { DEMO_TODAY, financialYears } from "@/data/mockData";
import {
  salesOrderService, orderTotal, orderQty, orderDelivered, nextOrderNo, type SalesOrder, type OrderLineInput,
} from "@/services/salesOrderService";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sales/orders")({
  head: () => ({
    meta: [
      { title: "Sales Orders – MFAHH" },
      { name: "description", content: "Track customer book orders, deliveries and pending quantities." },
      { property: "og:title", content: "Sales Orders – MFAHH" },
      { property: "og:description", content: "Track customer book orders, deliveries and pending quantities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

const STATUSES = ["All", "Pending", "Partial", "Delivered", "Cancelled"] as const;

function OrdersPage() {
  const data = useAppStore((s) => s.data);
  const fyId = useAppStore((s) => s.fyId);
  const readOnly = financialYears.find((f) => f.id === fyId)?.status === "Closed";
  const { can, user } = usePermissions();
  const canEdit = can("sales.create") && !readOnly;

  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");
  const [customer, setCustomer] = useState("all");
  const [view, setView] = useState<SalesOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<SalesOrder | null>(null);

  const custName = (id: string) => data.customers.find((c) => c.id === id)?.name ?? "-";
  const rows = useMemo(
    () => data.salesOrders.filter((o) => (status === "All" || o.status === status) && (customer === "all" || o.customerId === customer)),
    [data.salesOrders, status, customer],
  );
  const open = data.salesOrders.filter((o) => o.status === "Pending" || o.status === "Partial");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales Orders"
        crumbs={["Home", "Sales", "Orders"]}
        actions={canEdit && <Button onClick={() => setCreating(true)}><Plus className="size-4" />New Order</Button>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Orders" value={String(data.salesOrders.length)} icon={ClipboardList} tint="blue" />
        <KpiCard title="Pending" value={String(data.salesOrders.filter((o) => o.status === "Pending").length)} icon={Clock} tint="orange" onClick={() => setStatus("Pending")} />
        <KpiCard title="Partially Delivered" value={String(data.salesOrders.filter((o) => o.status === "Partial").length)} icon={Truck} tint="purple" onClick={() => setStatus("Partial")} />
        <KpiCard title="Open Order Value" value={formatPKR(open.reduce((s, o) => s + orderTotal(o), 0))} icon={PackageCheck} tint="green" />
      </div>

      <section className="card-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}>{s}</button>
            ))}
          </div>
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {data.customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DataTable
          exportName="sales-orders"
          rows={rows}
          columns={[
            { key: "no", header: "Order #", value: (o) => o.no, render: (o) => <span className="font-semibold text-primary">{o.no}</span> },
            { key: "date", header: "Date", value: (o) => o.date, render: (o) => <span className="whitespace-nowrap">{formatDate(o.date)}</span> },
            { key: "cust", header: "Customer", value: (o) => custName(o.customerId) },
            { key: "qty", header: "Ordered", value: (o) => orderQty(o), align: "right" },
            { key: "del", header: "Delivered", value: (o) => orderDelivered(o), render: (o) => <DeliveryBar o={o} />, align: "right" },
            { key: "amt", header: "Amount", value: (o) => orderTotal(o), render: (o) => <span className="whitespace-nowrap">{formatPKR(orderTotal(o))}</span>, align: "right" },
            { key: "st", header: "Status", value: (o) => o.status, render: (o) => <StatusBadge status={o.status} /> },
            {
              key: "act", header: "", value: () => "",
              render: (o) => (
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="View" onClick={() => setView(o)}><Eye className="size-4" /></Button>
                  {canEdit && (o.status === "Pending" || o.status === "Partial") && (
                    <Button size="icon" variant="ghost" aria-label="Cancel order" onClick={() => setCancelling(o)}><Ban className="size-4 text-destructive" /></Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </section>

      {view && <OrderDialog order={data.salesOrders.find((o) => o.id === view.id) ?? view} canEdit={canEdit} user={user.name} onClose={() => setView(null)} />}
      {creating && <NewOrderDialog user={user.name} onClose={() => setCreating(false)} />}
      {cancelling && <CancelDialog order={cancelling} user={user.name} onClose={() => setCancelling(null)} />}
    </div>
  );
}

function DeliveryBar({ o }: { o: SalesOrder }) {
  const pct = Math.round((orderDelivered(o) / Math.max(1, orderQty(o))) * 100);
  return (
    <div className="ml-auto flex w-24 flex-col items-end gap-1">
      <span className="text-xs tabular-nums">{orderDelivered(o)} ({pct}%)</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><span className="block h-full bg-success" style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

function OrderDialog({ order, canEdit, user, onClose }: { order: SalesOrder; canEdit: boolean; user: string; onClose: () => void }) {
  const data = useAppStore((s) => s.data);
  const [deliver, setDeliver] = useState(order.items.map((i) => i.delivered));
  const editable = canEdit && (order.status === "Pending" || order.status === "Partial");
  const cust = data.customers.find((c) => c.id === order.customerId);
  const cancel = order as SalesOrder & { cancelReason?: string };

  const stockShort = order.items.some((it, i) => {
    const book = data.books.find((b) => b.id === it.bookId);
    return (deliver[i] ?? 0) - it.delivered > (book?.availableStock ?? 0);
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">{order.no} <StatusBadge status={order.status} /></DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-semibold text-navy">{cust?.name}</p><p className="text-xs text-muted-foreground">{cust?.city}</p></div>
          <div><p className="text-xs text-muted-foreground">Order date</p><p className="font-semibold text-navy">{formatDate(order.date)}</p><p className="text-xs text-muted-foreground">By {order.createdBy}</p></div>
        </div>
        {cancel.cancelReason && <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">Cancelled: {cancel.cancelReason}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2">Book</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Disc</th><th className="text-right">Delivered</th><th className="text-right">Amount</th>
            </tr></thead>
            <tbody>
              {order.items.map((it, i) => {
                const book = data.books.find((b) => b.id === it.bookId);
                return (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-2"><span className="font-medium text-navy">{book?.name}</span><span className="block text-[11px] text-muted-foreground">Stock {book?.availableStock}</span></td>
                    <td className="text-right">{it.qty}</td>
                    <td className="text-right">{formatPKR(it.rate)}</td>
                    <td className="text-right">{it.discountPct}%</td>
                    <td className="text-right">
                      {editable ? (
                        <Input type="number" min={it.delivered} max={it.qty} value={deliver[i]} className="ml-auto h-8 w-20 text-right"
                          onChange={(e) => setDeliver(deliver.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
                      ) : it.delivered}
                    </td>
                    <td className="text-right">{formatPKR(it.qty * it.rate * (1 - it.discountPct / 100))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-right text-base font-bold text-navy">Total {formatPKR(orderTotal(order))}</p>
        {stockShort && <p className="text-xs font-semibold text-destructive">Not enough stock for the delivery entered.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
          {editable && (
            <Button disabled={stockShort} onClick={async () => { await salesOrderService.deliver(order.id, deliver, user); toast.success("Delivery recorded"); onClose(); }}>
              Save delivery
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewOrderDialog({ user, onClose }: { user: string; onClose: () => void }) {
  const data = useAppStore((s) => s.data);
  const customers = data.customers.filter((c) => c.status === "Active");
  const books = data.books.filter((b) => b.status === "Active");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(DEMO_TODAY);
  const [lines, setLines] = useState<OrderLineInput[]>([{ bookId: "", qty: 1, rate: 0, discountPct: 0 }]);

  const setLine = (i: number, patch: Partial<OrderLineInput>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.filter((l) => l.bookId && l.qty > 0);
  const total = valid.reduce((s, l) => s + l.qty * l.rate * (1 - l.discountPct / 100), 0);
  const ok = customerId && valid.length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>New Sales Order · {nextOrderNo(data)}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Choose customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Order date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_80px_100px_80px_40px] gap-2 text-xs font-semibold text-muted-foreground sm:grid">
            <span>Book</span><span>Qty</span><span>Rate</span><span>Disc %</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_100px_80px_40px]">
              <Select value={l.bookId} onValueChange={(v) => setLine(i, { bookId: v, rate: books.find((b) => b.id === v)?.salePrice ?? 0 })}>
                <SelectTrigger className="col-span-2 sm:col-span-1"><SelectValue placeholder="Choose book" /></SelectTrigger>
                <SelectContent>{books.map((b) => <SelectItem key={b.id} value={b.id}>{b.code} · {b.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
              <Input type="number" min={0} value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} />
              <Input type="number" min={0} max={100} value={l.discountPct} onChange={(e) => setLine(i, { discountPct: Number(e.target.value) })} />
              <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { bookId: "", qty: 1, rate: 0, discountPct: 0 }])}><Plus className="size-4" />Add book</Button>
        </div>
        <p className="text-right text-base font-bold text-navy">Total {formatPKR(total)}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok} onClick={async () => { const no = await salesOrderService.create({ date, customerId, items: valid }, user); toast.success(`${no} created`); onClose(); }}>Save order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ order, user, onClose }: { order: SalesOrder; user: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel {order.no}?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">The order stays in the list as cancelled. Please give a reason.</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for cancelling" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep order</Button>
          <Button variant="destructive" disabled={!reason.trim()} onClick={async () => { await salesOrderService.cancel(order.id, reason.trim(), user); toast.success(`${order.no} cancelled`); onClose(); }}>Cancel order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
