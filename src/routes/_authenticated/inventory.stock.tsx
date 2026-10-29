import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { StockStatementReport } from "@/components/reports/Reports";

export const Route = createFileRoute("/_authenticated/inventory/stock")({
  head: () => ({ meta: [{ title: "Stock – MFAHH" }] }),
  component: () => (
    <div className="space-y-5">
      <PageHeader title="Stock" crumbs={["Home", "Inventory", "Stock"]} />
      <p className="text-sm text-muted-foreground">
        Stock moves only through approved documents: purchases, sales, returns, samples, adjustments
        and damaged-stock write-offs. Click a book under Books & Products to see its full movement
        history.
      </p>
      <section className="card-surface p-4">
        <StockStatementReport title="Stock position" />
      </section>
    </div>
  ),
});
