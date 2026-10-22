import { createFileRoute, Link } from "@tanstack/react-router";
import { Construction, Lock } from "lucide-react";
import { findNav, canAny } from "@/lib/nav";
import { usePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";

export const Route = createFileRoute("/$")({
  head: ({ params }) => {
    const n = findNav(`/${params._splat ?? ""}`);
    const t = n ? (n.page ? `${n.page.title} – ${n.section.title}` : n.section.title) : "Page";
    return {
      meta: [
        { title: `${t} – MFAHH` },
        { name: "description", content: `${t} in MFAHH, the accounting and inventory hub for Turnkey Publishers.` },
        { property: "og:title", content: `${t} – MFAHH` },
        { property: "og:description", content: `${t} in MFAHH for Turnkey Publishers.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: Placeholder,
});

function Placeholder() {
  const { _splat } = Route.useParams();
  const path = `/${_splat ?? ""}`;
  const n = findNav(path);
  const { can } = usePermissions();
  const resetDemo = useAppStore((s) => s.resetDemo);

  if (!n) {
    return (
      <div className="card-surface p-10 text-center">
        <h1 className="text-xl font-bold text-navy">Page not found</h1>
        <Button asChild className="mt-4"><Link to="/">Back to dashboard</Link></Button>
      </div>
    );
  }
  const title = n.page?.title ?? n.section.title;
  const allowed = canAny(can, n.section.permission);

  return (
    <div>
      <PageHeader title={title} crumbs={["Home", n.section.title, ...(n.page ? [n.page.title] : [])]} />
      <div className="card-surface grid place-items-center gap-3 p-12 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-tint-blue text-tint-blue-fg">
          {allowed ? <Construction className="size-6" /> : <Lock className="size-6" />}
        </span>
        <h2 className="text-lg font-bold text-navy">{allowed ? `${title} is coming next` : "You don't have access to this section"}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {allowed ? "This screen will be built in an upcoming step. Your sample data is already loaded and ready." : "Switch to a role with permission from the user menu at the top right."}
        </p>
        {path === "/settings/backup-and-restore" && allowed && (
          <Button variant="outline" onClick={() => { resetDemo(); toast.success("Demo data reset"); }}>Reset demo data</Button>
        )}
      </div>
    </div>
  );
}
