import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { useAppStore } from "@/store/appStore";


export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const fyId = useAppStore((s) => s.fyId);
  const financialYears = useAppStore((s) => s.data.financialYears);
  const closed = financialYears.find((f) => f.id === fyId)?.status === "Closed";

  useEffect(() => {
    void useAppStore.persist.rehydrate();
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="sticky top-0 hidden h-screen lg:block"><AppSidebar /></div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
          <button className="flex-1 bg-foreground/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        {closed && (
          <div className="bg-tint-orange px-6 py-2 text-xs font-semibold text-tint-orange-fg">
            This financial year is closed. Records are read-only.
          </div>
        )}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
