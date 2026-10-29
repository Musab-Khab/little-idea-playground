import { createFileRoute } from "@tanstack/react-router";

/** Streams a staff document after checking the session and HR permission. */
export const Route = createFileRoute("/api/files/staff-document/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { requireUser, assertPerm } = await import("@/server/security/session");
        const { getDb } = await import("@/server/db/client");
        const t = await import("@/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { storageDir } = await import("@/server/functions/hr");
        const { writeAudit } = await import("@/server/audit");
        try {
          const user = await requireUser();
          assertPerm(user, "hr.salary_view");
          if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response("Not found", { status: 404 });
          const [doc] = await getDb()
            .select()
            .from(t.staffDocuments)
            .where(eq(t.staffDocuments.id, params.id));
          if (!doc) return new Response("Not found", { status: 404 });
          const body = await readFile(join(storageDir(), doc.storedName));
          await writeAudit(getDb(), user, {
            action: "Document viewed",
            entity: "Staff Document",
            entityId: doc.id,
            ref: doc.fileName,
          });
          return new Response(body, {
            headers: {
              "content-type": doc.mimeType,
              "content-disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
              "x-content-type-options": "nosniff",
              "cache-control": "private, no-store",
              "content-security-policy":
                "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
            },
          });
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
      },
    },
  },
});
