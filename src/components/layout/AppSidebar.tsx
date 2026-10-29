import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronDown } from "lucide-react";
import { navItems, allowed } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { useLookups } from "@/lib/lookups";
import { cn } from "@/lib/utils";

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { canAny } = useSession();
  const { data: lookups } = useLookups();
  const [open, setOpen] = useState<string | null>(
    () => navItems.find((n) => n.children && path.startsWith(n.path))?.title ?? null,
  );
  const click = onNavigate ? { onClick: onNavigate } : {};

  return (
    <aside className="no-print bg-sidebar-gradient flex h-full w-64 flex-col text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <span className="grid size-10 place-items-center rounded-xl bg-sidebar-accent">
          <BookOpen className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
            {lookups?.company?.name ?? "Turnkey Publishers"}
          </p>
          <p className="text-xl font-extrabold tracking-wide">MFAHH</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems
          .filter((item) => allowed(canAny, item.perms))
          .map((item) => {
            const active = item.path === "/" ? path === "/" : path.startsWith(item.path);
            const base = cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "hover:bg-sidebar-border",
            );
            if (!item.children) {
              return (
                <Link key={item.title} to={item.path} className={base} {...click}>
                  <item.icon className="size-4" />
                  {item.title}
                </Link>
              );
            }
            const isOpen = open === item.title;
            return (
              <div key={item.title}>
                <button className={base} onClick={() => setOpen(isOpen ? null : item.title)}>
                  <item.icon className="size-4" />
                  <span className="flex-1 text-left">{item.title}</span>
                  <ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                    {item.children
                      .filter((c) => allowed(canAny, c.perms))
                      .map((c) => (
                        <Link
                          key={c.path}
                          to={c.path}
                          {...click}
                          className={cn(
                            "block rounded-lg px-3 py-1.5 text-[13px] opacity-80 hover:opacity-100",
                            path === c.path && "bg-sidebar-border font-semibold opacity-100",
                          )}
                        >
                          {c.title}
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
      </nav>

      <p className="border-t border-sidebar-border px-5 py-4 text-center text-[11px] italic opacity-70">
        Knowledge Today, A Brighter Tomorrow
      </p>
    </aside>
  );
}
