import { SimpleTable } from "@/components/documents/DocumentView";
import { useApi } from "@/lib/api";
import { getPriceHistory } from "@/server/functions/masters";

export function PriceHistory({ productId }: { productId: string }) {
  const q = useApi(["price-history", productId], () => getPriceHistory({ data: { productId } }));
  return (
    <SimpleTable
      rows={q.data ?? []}
      cols={[
        ["at", "Changed", "datetime"],
        ["by", "By"],
        ["oldCost", "Old cost", "amt"],
        ["newCost", "New cost", "amt"],
        ["oldSale", "Old sale price", "amt"],
        ["newSale", "New sale price", "amt"],
      ]}
    />
  );
}
