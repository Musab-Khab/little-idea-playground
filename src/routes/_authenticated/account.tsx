import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { TextField } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/api";
import { useSession } from "@/lib/session";
import { changePassword } from "@/server/functions/auth";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "My Account – MFAHH" }] }),
  component: Account,
});

function Account() {
  const { user } = useSession();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const save = useAction(async () => {
    if (v.next !== v.confirm) throw new Error("The new passwords do not match.");
    return changePassword({ data: { current: v.current, next: v.next } });
  }, "Password changed. Other devices have been signed out.");
  return (
    <div className="max-w-lg space-y-5">
      <PageHeader title="My Account" crumbs={["Home", "My Account"]} />
      <section className="card-surface space-y-4 p-4">
        <p className="text-sm">
          {user.name} · {user.email} · <span className="capitalize">{user.roleId}</span>
        </p>
        <TextField
          label="Current password"
          type="password"
          value={v.current}
          onChange={(x) => setV({ ...v, current: x })}
        />
        <TextField
          label="New password (min. 10 characters)"
          type="password"
          value={v.next}
          onChange={(x) => setV({ ...v, next: x })}
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={v.confirm}
          onChange={(x) => setV({ ...v, confirm: x })}
        />
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: () => setV({ current: "", next: "", confirm: "" }),
            })
          }
        >
          Change password
        </Button>
      </section>
    </div>
  );
}
