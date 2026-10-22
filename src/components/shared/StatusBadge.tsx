import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  Paid: "bg-tint-green text-tint-green-fg",
  Approved: "bg-tint-green text-tint-green-fg",
  Delivered: "bg-tint-green text-tint-green-fg",
  Active: "bg-tint-green text-tint-green-fg",
  Returned: "bg-tint-purple text-tint-purple-fg",
  "Partially Paid": "bg-tint-blue text-tint-blue-fg",
  Partial: "bg-tint-blue text-tint-blue-fg",
  Issued: "bg-tint-blue text-tint-blue-fg",
  Pending: "bg-tint-orange text-tint-orange-fg",
  Draft: "bg-muted text-muted-foreground",
  Unpaid: "bg-tint-orange text-tint-orange-fg",
  Outstanding: "bg-tint-orange text-tint-orange-fg",
  Overdue: "bg-tint-pink text-destructive",
  Cancelled: "bg-muted text-muted-foreground line-through",
  Inactive: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tone[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}
