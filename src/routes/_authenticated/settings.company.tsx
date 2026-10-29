import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { TextField } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAction, useApi } from "@/lib/api";
import { getCompany, listRoles, saveCompany } from "@/server/functions/admin";

export const Route = createFileRoute("/_authenticated/settings/company")({
  head: () => ({ meta: [{ title: "Company Settings – MFAHH" }] }),
  component: CompanySettings,
});

type Company = Awaited<ReturnType<typeof getCompany>>;

function CompanySettings() {
  const q = useApi(["company"], () => getCompany());
  const roles = useApi(["roles"], () => listRoles().catch(() => []));
  const [v, setV] = useState<Company | null>(null);
  useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  const save = useAction((c: Company) => saveCompany({ data: c }), "Settings saved");
  if (!v) return <p className="p-8 text-center text-muted-foreground">Loading…</p>;
  const set = <K extends keyof Company>(k: K, x: Company[K]) => setV({ ...v, [k]: x });
  return (
    <div className="space-y-5">
      <PageHeader title="Company Settings" crumbs={["Home", "Settings", "Company"]} />
      <section className="card-surface grid gap-4 p-4 sm:grid-cols-2">
        <h2 className="font-semibold text-navy sm:col-span-2">
          Company profile (printed on invoices, vouchers and statements)
        </h2>
        <TextField label="Company name" required value={v.name} onChange={(x) => set("name", x)} />
        <TextField label="NTN / STRN" value={v.ntn} onChange={(x) => set("ntn", x)} />
        <TextField
          label="Address"
          className="sm:col-span-2"
          value={v.address}
          onChange={(x) => set("address", x)}
        />
        <TextField label="Phone" value={v.phone} onChange={(x) => set("phone", x)} />
        <TextField label="Email" value={v.email} onChange={(x) => set("email", x)} />
      </section>
      <section className="card-surface space-y-4 p-4">
        <h2 className="font-semibold text-navy">Security & controls</h2>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={v.makerChecker}
            onCheckedChange={(c) => set("makerChecker", Boolean(c))}
          />
          <span>
            <b>Maker-checker approval</b> — the person who enters an invoice, payment, journal or
            payroll cannot approve it. Turn off only if a single person runs the system.
          </span>
        </label>
        <div className="text-sm">
          <p className="mb-2 font-medium">
            Two-factor authentication is mandatory for these roles:
          </p>
          <div className="flex flex-wrap gap-4">
            {(roles.data ?? [{ id: "admin", name: "Admin" }]).map((r) => (
              <label key={r.id} className="flex items-center gap-2">
                <Checkbox
                  checked={v.mfaRoles.includes(r.id)}
                  disabled={r.id === "admin"}
                  onCheckedChange={(c) =>
                    set(
                      "mfaRoles",
                      c
                        ? [...new Set([...v.mfaRoles, r.id])]
                        : v.mfaRoles.filter((x) => x !== r.id),
                    )
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </div>
        <TextField
          label="Sign out after inactivity (minutes)"
          type="number"
          min={5}
          className="max-w-xs"
          value={v.sessionIdleMinutes}
          onChange={(x) => set("sessionIdleMinutes", Number(x))}
        />
      </section>
      <Button disabled={save.isPending} onClick={() => save.mutate(v)}>
        Save settings
      </Button>
    </div>
  );
}
