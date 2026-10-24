import { useRouteContext, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Menu, Search, ChevronDown } from "lucide-react";
import { useAppStore, type RangeKey } from "@/store/appStore";
import { usePermissions } from "@/lib/permissions";
import { financialYears } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ranges: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom" },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { range, setRange, fyId, setFy, setRole, customFrom, customTo, setCustom } = useAppStore();
  const roles = useAppStore((s) => s.data.roles);
  const { role } = usePermissions();
  const { authUser } = useRouteContext({ from: "/_authenticated" });
  const { queryClient } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const user = { name: authUser.email?.split("@")[0] ?? "Account" };

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:px-6">
      <button className="lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu className="size-5" /></button>

      <div className="relative hidden flex-1 md:block md:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search invoices, customers, books…" className="rounded-full bg-muted pl-9" />
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="h-9 w-36 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>{ranges.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-1">
            <Input type="date" value={customFrom} onChange={(e) => setCustom(e.target.value, customTo)} className="h-9 w-36" />
            <Input type="date" value={customTo} onChange={(e) => setCustom(customFrom, e.target.value)} className="h-9 w-36" />
          </div>
        )}
        <Select value={fyId} onValueChange={setFy}>
          <SelectTrigger className="h-9 w-32 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {financialYears.map((f) => <SelectItem key={f.id} value={f.id}>FY {f.label}{f.status === "Closed" ? " (Closed)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>

        <button className="relative grid size-9 place-items-center rounded-full hover:bg-muted" aria-label="Notifications">
          <Bell className="size-5 text-navy" />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-muted">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold text-navy">{user.name}</span>
              <span className="block text-[11px] text-muted-foreground">{role.name}</span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="truncate">{authUser.email}</DropdownMenuLabel>
            <DropdownMenuItem onClick={async () => { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); await navigate({to:"/auth",replace:true}); void router.invalidate(); }}>Sign out</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Switch role (sample data)</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {roles.map((r) => (
              <DropdownMenuItem key={r.id} onClick={() => setRole(r.id)} className={r.id === role.id ? "font-semibold text-primary" : ""}>
                {r.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
