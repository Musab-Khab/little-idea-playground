import { useState } from "react";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Bell, Menu, ChevronDown, KeyRound, LogOut } from "lucide-react";
import { useUiStore, type RangeKey } from "@/store/uiStore";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/api";
import { formatDate, formatPKR } from "@/lib/format";
import { logout } from "@/server/functions/auth";
import { pendingApprovals } from "@/server/functions/documents";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentView } from "@/components/documents/DocumentView";

const ranges: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom" },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { range, setRange, customFrom, customTo, setCustom } = useUiStore();
  const { user } = useSession();
  const { queryClient } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const pending = useApi(["pending-approvals"], () => pendingApprovals(), { staleTime: 30_000 });
  const [viewId, setViewId] = useState<string | null>(null);
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:px-6">
      <button className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="h-9 w-36 rounded-full" aria-label="Dashboard period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranges.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label="From"
              value={customFrom}
              onChange={(e) => setCustom(e.target.value, customTo)}
              className="h-9 w-36"
            />
            <Input
              type="date"
              aria-label="To"
              value={customTo}
              onChange={(e) => setCustom(customFrom, e.target.value)}
              className="h-9 w-36"
            />
          </div>
        )}

        <Popover>
          <PopoverTrigger
            className="relative grid size-9 place-items-center rounded-full hover:bg-muted"
            aria-label="Documents awaiting your approval"
          >
            <Bell className="size-5 text-navy" />
            {(pending.data?.length ?? 0) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {pending.data!.length}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <p className="border-b px-4 py-2.5 text-sm font-semibold">Awaiting your approval</p>
            <div className="max-h-80 overflow-y-auto">
              {pending.data?.length ? (
                pending.data.map((d) => (
                  <button
                    key={String(d["id"])}
                    className="flex w-full items-center justify-between gap-2 border-b px-4 py-2 text-left text-sm last:border-0 hover:bg-muted"
                    onClick={() => setViewId(String(d["id"]))}
                  >
                    <span>
                      <span className="block font-medium text-navy">{String(d["docNo"])}</span>
                      <span className="text-xs text-muted-foreground">
                        {String(d["typeLabel"])} · {formatDate(String(d["date"]))}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-xs font-semibold">
                      {formatPKR(Number(d["total"]))}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nothing pending.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-muted">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold text-navy">{user.name}</span>
              <span className="block text-[11px] capitalize text-muted-foreground">
                {user.roleId}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/account" })}>
              <KeyRound className="size-4" />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await logout();
                queryClient.clear();
                await navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {viewId && <DocumentView id={viewId} onClose={() => setViewId(null)} />}
    </header>
  );
}
