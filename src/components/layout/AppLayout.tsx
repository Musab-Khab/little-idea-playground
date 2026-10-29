import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { useUiStore } from "@/store/uiStore";
import { logout, ping } from "@/server/functions/auth";

/** Client-side idle guard mirroring the server's idle timeout, so screens don't stay open unattended. */
const IDLE_MS = 30 * 60_000;

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const last = useRef(Date.now());

  useEffect(() => {
    void useUiStore.persist.rehydrate();
  }, []);

  // After a server update the old code files are gone; a tab left open would fail to load the
  // next screen silently. Reload once to pick up the new version (guarded against reload loops).
  useEffect(() => {
    const onStale = (e: Event) => {
      e.preventDefault();
      let last = 0;
      try {
        last = Number(sessionStorage.getItem("mfahh-reloaded-at") ?? 0);
        sessionStorage.setItem("mfahh-reloaded-at", String(Date.now()));
      } catch {
        /* storage unavailable: still reload once */
      }
      if (Date.now() - last > 10_000) window.location.reload();
    };
    window.addEventListener("vite:preloadError", onStale);
    return () => window.removeEventListener("vite:preloadError", onStale);
  }, []);

  useEffect(() => {
    const bump = () => (last.current = Date.now());
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - last.current > IDLE_MS) {
        await logout().catch(() => undefined);
        await navigate({ to: "/auth" });
        return;
      }
      try {
        await ping();
      } catch {
        await navigate({ to: "/auth" });
      }
    }, 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="no-print sticky top-0 hidden h-screen lg:block">
        <AppSidebar />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
          <button
            className="flex-1 bg-foreground/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
