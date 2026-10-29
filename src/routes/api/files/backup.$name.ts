import { createFileRoute } from "@tanstack/react-router";

/** Downloads a backup file (admins with backup permission only). */
export const Route = createFileRoute("/api/files/backup/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { requireUser, assertPerm } = await import("@/server/security/session");
        const { safeBackupPath } = await import("@/server/backup");
        const { getDb } = await import("@/server/db/client");
        const { writeAudit } = await import("@/server/audit");
        const { readFile } = await import("node:fs/promises");
        try {
          const user = await requireUser();
          assertPerm(user, "backup.manage");
          const path = safeBackupPath(params.name);
          const body = await readFile(path);
          await writeAudit(getDb(), user, {
            action: "Backup downloaded",
            entity: "Backup",
            ref: params.name,
          });
          return new Response(body, {
            headers: {
              "content-type": "application/octet-stream",
              "content-disposition": `attachment; filename="${params.name}"`,
              "cache-control": "private, no-store",
            },
          });
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
      },
    },
  },
});
