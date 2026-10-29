import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, KeyRound, ShieldOff, Unlock, Power, LogOut } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SelectField, TextField } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { listRoles, listUsers, saveRole, saveUser, userAction } from "@/server/functions/admin";
import { PERMISSIONS, type Permission } from "@/shared/permissions";

export const Route = createFileRoute("/_authenticated/settings/users-and-roles")({
  head: () => ({ meta: [{ title: "Users & Roles – MFAHH" }] }),
  component: UsersRoles,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
type Role = Awaited<ReturnType<typeof listRoles>>[number];

function UsersRoles() {
  return (
    <div className="space-y-5">
      <PageHeader title="Users & Roles" crumbs={["Home", "Settings", "Users & Roles"]} />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <Users />
        </TabsContent>
        <TabsContent value="roles">
          <Roles />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Users() {
  const { user: me } = useSession();
  const users = useApi(["users"], () => listUsers());
  const roles = useApi(["roles"], () => listRoles());
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const act = useAction(
    (v: {
      id: string;
      action: "activate" | "deactivate" | "resetPassword" | "resetMfa" | "unlock" | "signOut";
      email: string;
    }) =>
      userAction({ data: { id: v.id, action: v.action } }).then((r) => ({ ...r, email: v.email })),
    (r) => {
      if (r.tempPassword) setSecret({ email: r.email, password: r.tempPassword });
      return "Done";
    },
  );
  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? id;
  const confirmAct = (
    r: Row,
    action: Parameters<typeof act.mutate>[0]["action"],
    question: string,
  ) => {
    if (window.confirm(question)) act.mutate({ id: s(r, "id"), action, email: s(r, "email") });
  };
  return (
    <section className="card-surface space-y-4 p-4">
      <Button onClick={() => setEditing(null)}>
        <Plus />
        New user
      </Button>
      <DataTable
        rows={users.data ?? []}
        exportName="users"
        columns={[
          {
            key: "name",
            header: "Name",
            value: (r) => s(r, "name"),
            render: (r) => (
              <span className="font-medium">
                {s(r, "name")}
                {r["id"] === me.id ? " (you)" : ""}
              </span>
            ),
          },
          { key: "email", header: "Email", value: (r) => s(r, "email") },
          { key: "role", header: "Role", value: (r) => roleName(s(r, "roleId")) },
          {
            key: "mfa",
            header: "2FA",
            value: (r) => (r["totpEnabled"] ? "On" : "Off"),
            render: (r) => <StatusBadge status={r["totpEnabled"] ? "Active" : "Pending"} />,
          },
          {
            key: "last",
            header: "Last sign-in",
            value: (r) => s(r, "lastLoginAt"),
            render: (r) => formatDateTime(s(r, "lastLoginAt")) || "Never",
          },
          {
            key: "lock",
            header: "Locked",
            value: (r) =>
              r["lockedUntil"] && s(r, "lockedUntil") > new Date().toISOString() ? "Locked" : "",
            render: (r) =>
              r["lockedUntil"] && s(r, "lockedUntil") > new Date().toISOString() ? (
                <StatusBadge status="Overdue" />
              ) : (
                ""
              ),
          },
          {
            key: "status",
            header: "Status",
            value: (r) => s(r, "status"),
            render: (r) => <StatusBadge status={s(r, "status")} />,
          },
          {
            key: "actions",
            header: "Actions",
            value: () => "",
            render: (r) => (
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Edit"
                  aria-label="Edit user"
                  onClick={() => setEditing(r)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reset password"
                  aria-label="Reset password"
                  onClick={() =>
                    confirmAct(
                      r,
                      "resetPassword",
                      `Reset the password for ${s(r, "email")}? They will be signed out and must use the new temporary password.`,
                    )
                  }
                >
                  <KeyRound className="size-4" />
                </Button>
                {r["id"] !== me.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Reset two-factor"
                    aria-label="Reset two-factor"
                    onClick={() =>
                      confirmAct(
                        r,
                        "resetMfa",
                        `Reset two-factor authentication for ${s(r, "email")}? Use only if they lost their phone.`,
                      )
                    }
                  >
                    <ShieldOff className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Unlock"
                  aria-label="Unlock"
                  onClick={() =>
                    act.mutate({ id: s(r, "id"), action: "unlock", email: s(r, "email") })
                  }
                >
                  <Unlock className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Sign out everywhere"
                  aria-label="Sign out everywhere"
                  onClick={() =>
                    act.mutate({ id: s(r, "id"), action: "signOut", email: s(r, "email") })
                  }
                >
                  <LogOut className="size-4" />
                </Button>
                {r["id"] !== me.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={r["status"] === "Active" ? "Deactivate" : "Activate"}
                    aria-label="Toggle status"
                    onClick={() =>
                      confirmAct(
                        r,
                        r["status"] === "Active" ? "deactivate" : "activate",
                        `${r["status"] === "Active" ? "Deactivate" : "Activate"} ${s(r, "email")}?`,
                      )
                    }
                  >
                    <Power
                      className={`size-4 ${r["status"] === "Active" ? "text-destructive" : "text-success"}`}
                    />
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      {editing !== undefined && (
        <UserForm
          user={editing}
          roles={roles.data ?? []}
          onClose={() => setEditing(undefined)}
          onCreated={(email, password) => setSecret({ email, password })}
        />
      )}
      {secret && (
        <Dialog open onOpenChange={() => setSecret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Temporary password</DialogTitle>
              <DialogDescription>
                Give this to {secret.email} privately. It is shown only once; they must change it at
                first sign-in.
              </DialogDescription>
            </DialogHeader>
            <p className="select-all rounded-md bg-muted p-3 text-center font-mono text-lg">
              {secret.password}
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(secret.password);
                  setSecret(null);
                }}
              >
                Copy & close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

function UserForm({
  user,
  roles,
  onClose,
  onCreated,
}: {
  user: Row | null;
  roles: Role[];
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const [v, setV] = useState({
    name: user ? s(user, "name") : "",
    email: user ? s(user, "email") : "",
    roleId: user ? s(user, "roleId") : (roles[0]?.id ?? ""),
  });
  const save = useAction(
    () => saveUser({ data: { id: user ? s(user, "id") : null, ...v } }),
    (r) => {
      if (r.tempPassword) onCreated(v.email, r.tempPassword);
      return "User saved";
    },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "New user"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <TextField
            label="Full name"
            required
            value={v.name}
            onChange={(x) => setV({ ...v, name: x })}
          />
          <TextField
            label="Email (sign-in name)"
            type="email"
            required
            value={v.email}
            onChange={(x) => setV({ ...v, email: x })}
          />
          <SelectField
            label="Role"
            required
            value={v.roleId}
            onChange={(x) => setV({ ...v, roleId: x })}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
          {!user && (
            <p className="text-xs text-muted-foreground">
              A temporary password is generated. The user sets their own password (and two-factor,
              if their role requires it) at first sign-in.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Roles() {
  const roles = useApi(["roles"], () => listRoles());
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);
  const groups = Object.entries(PERMISSIONS).reduce<Record<string, Permission[]>>((acc, [k]) => {
    const g = k.split(".")[0]!;
    (acc[g] ??= []).push(k as Permission);
    return acc;
  }, {});
  return (
    <section className="card-surface space-y-4 p-4">
      <Button onClick={() => setEditing(null)}>
        <Plus />
        New role
      </Button>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(roles.data ?? []).map((r) => (
          <div key={r.id} className="rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold text-navy">
                {r.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {r.users} user{r.users === 1 ? "" : "s"}
                </span>
              </p>
              {r.id !== "admin" && (
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  <Pencil />
                  Edit
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {r.id === "admin"
                ? "Full access to everything."
                : r.permissions.map((p) => PERMISSIONS[p]).join(" · ") || "No permissions yet."}
            </p>
          </div>
        ))}
      </div>
      {editing !== undefined && (
        <RoleForm role={editing} groups={groups} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}

function RoleForm({
  role,
  groups,
  onClose,
}: {
  role: Role | null;
  groups: Record<string, Permission[]>;
  onClose: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [perms, setPerms] = useState<Set<Permission>>(
    new Set(role?.permissions ?? ["dashboard.view"]),
  );
  const save = useAction(
    () => saveRole({ data: { id: role?.id ?? null, name, permissions: [...perms] } }),
    "Role saved — affected users get the new permissions on their next request",
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit role: ${role.name}` : "New role"}</DialogTitle>
        </DialogHeader>
        <TextField label="Role name" required value={name} onChange={setName} />
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g}
              </p>
              {list.map((p) => (
                <label key={p} className="flex items-start gap-2 py-1 text-sm">
                  <Checkbox
                    checked={perms.has(p)}
                    onCheckedChange={(c) => {
                      const n = new Set(perms);
                      if (c) n.add(p);
                      else n.delete(p);
                      setPerms(n);
                    }}
                  />
                  {PERMISSIONS[p]}
                </label>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || name.trim().length < 2}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
