import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tint = "blue" | "green" | "pink" | "orange" | "purple";
const tints: Record<Tint, { bg: string; fg: string }> = {
  blue: { bg: "bg-tint-blue", fg: "bg-tint-blue-fg" },
  green: { bg: "bg-tint-green", fg: "bg-tint-green-fg" },
  pink: { bg: "bg-tint-pink", fg: "bg-tint-pink-fg" },
  orange: { bg: "bg-tint-orange", fg: "bg-tint-orange-fg" },
  purple: { bg: "bg-tint-purple", fg: "bg-tint-purple-fg" },
};

interface Props {
  title: string;
  value: string;
  sub?: string;
  subTone?: "danger" | "muted";
  icon: LucideIcon;
  tint: Tint;
  trend?: "up" | "down";
  onClick?: () => void;
}

export function KpiCard({ title, value, sub, subTone = "muted", icon: Icon, tint, trend, onClick }: Props) {
  const t = tints[tint];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border p-3.5 text-left shadow-card transition",
        t.bg,
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-primary-foreground", t.fg)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-tight text-muted-foreground">{title}</p>
        <div className="flex items-center gap-1.5">
          <p className="whitespace-nowrap text-base font-bold text-navy 2xl:text-lg">{value}</p>
          {trend === "up" && <TrendingUp className="size-4 text-success" />}
          {trend === "down" && <TrendingDown className="size-4 text-destructive" />}
        </div>
        {sub && <p className={cn("truncate text-[11px] font-medium", subTone === "danger" ? "text-destructive" : "text-muted-foreground")}>{sub}</p>}
      </div>
    </Tag>
  );
}
