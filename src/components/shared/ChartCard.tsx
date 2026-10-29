import type { ReactNode } from "react";

export function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card-surface flex flex-col p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function ModeToggle({
  value,
  onChange,
}: {
  value: "monthly" | "weekly";
  onChange: (v: "monthly" | "weekly") => void;
}) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5 text-[11px] font-semibold">
      {(["monthly", "weekly"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={
            value === m
              ? "rounded-md bg-card px-2 py-1 text-primary shadow-sm"
              : "px-2 py-1 text-muted-foreground"
          }
        >
          {m === "monthly" ? "Monthly" : "Weekly"}
        </button>
      ))}
    </div>
  );
}
