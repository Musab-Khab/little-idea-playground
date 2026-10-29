import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DatabaseBackup, Download, RotateCcw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { TextField } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { getBackups, runBackup, runRestore } from "@/server/functions/admin";

export const Route = createFileRoute("/_authenticated/settings/backup-and-restore")({
  head: () => ({ meta: [{ title: "Backup & Restore – MFAHH" }] }),
  component: Backups,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

function Backups() {
  const { user } = useSession();
  const q = useApi(["backups"], () => getBackups());
  const backup = useAction(
    () => runBackup(),
    (b) => `Backup ${b.name} created`,
  );
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [code, setCode] = useState("");
  const restore = useAction(
    () => runRestore({ data: { name: restoring!, confirm: "RESTORE", code } }),
    (r) => `Restored. A safety copy of the previous data was saved as ${r.safetyBackup}.`,
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Backup & Restore"
        crumbs={["Home", "Settings", "Backup & Restore"]}
        actions={
          <Button disabled={backup.isPending} onClick={() => backup.mutate(undefined)}>
            <DatabaseBackup />
            {backup.isPending ? "Backing up…" : "Back up now"}
          </Button>
        }
      />
      {q.data && !q.data.encryption && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-tint-orange p-3 text-sm">
          <ShieldAlert className="size-4" />
          Backups are not encrypted. Set <code>BACKUP_PASSPHRASE</code> in the server's .env file
          and keep that passphrase somewhere safe.
        </p>
      )}
      <section className="card-surface p-4 text-sm text-muted-foreground">
        Automatic backups run nightly (<code>npm run backup</code> scheduled on the server) and keep
        14 daily + 12 monthly copies. Copy the backups folder to another location (USB / cloud)
        every week.
      </section>
      <section className="card-surface p-4">
        <DataTable
          rows={q.data?.backups ?? []}
          exportName="backups"
          columns={[
            {
              key: "name",
              header: "Backup",
              value: (r) => s(r, "name"),
              render: (r) => <span className="font-mono text-xs">{s(r, "name")}</span>,
            },
            {
              key: "createdAt",
              header: "Created",
              value: (r) => s(r, "createdAt"),
              render: (r) => formatDateTime(s(r, "createdAt")),
            },
            {
              key: "size",
              header: "Size",
              value: (r) => Number(r["size"]),
              render: (r) => `${(Number(r["size"]) / 1024 / 1024).toFixed(2)} MB`,
              align: "right",
            },
            {
              key: "encrypted",
              header: "Encrypted",
              value: (r) => (r["encrypted"] ? "Yes" : "No"),
            },
            {
              key: "actions",
              header: "Actions",
              value: () => "",
              render: (r) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/api/files/backup/${s(r, "name")}`}>
                      <Download className="size-4" />
                      Download
                    </a>
                  </Button>
                  {user.roleId === "admin" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        setRestoring(s(r, "name"));
                        setConfirmText("");
                        setCode("");
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Restore
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </section>
      {restoring && (
        <Dialog open onOpenChange={() => setRestoring(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore {restoring}?</DialogTitle>
              <DialogDescription>
                All current data will be replaced by this backup. A safety backup of the current
                state is taken first. Everyone will need to sign in again.
              </DialogDescription>
            </DialogHeader>
            <TextField
              label='Type "RESTORE" to confirm'
              value={confirmText}
              onChange={setConfirmText}
            />
            <label className="text-sm font-medium" htmlFor="restore-code">
              Your authenticator code
            </label>
            <Input
              id="restore-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRestoring(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={confirmText !== "RESTORE" || code.length !== 6 || restore.isPending}
                onClick={() =>
                  restore.mutate(undefined, {
                    onSuccess: () => {
                      setRestoring(null);
                      window.location.assign("/auth");
                    },
                  })
                }
              >
                {restore.isPending ? "Restoring…" : "Restore"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
