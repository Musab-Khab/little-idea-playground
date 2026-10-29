import type { DB, Tx } from "./db/client";
import { auditLog } from "./db/schema";
import { requestMeta } from "./security/session";

export interface AuditActor {
  id: string | null;
  name: string;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  ref?: string | null;
  details?: Record<string, unknown>;
}

/** Appends to the hash-chained audit log (hash computed by a DB trigger). */
export async function writeAudit(db: DB | Tx, actor: AuditActor, entry: AuditEntry) {
  let ip: string | null = null;
  try {
    ip = requestMeta().ip;
  } catch {
    ip = null; // outside a request (scripts)
  }
  await db.insert(auditLog).values({
    userId: actor.id,
    userName: actor.name,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    ref: entry.ref ?? null,
    details: entry.details ?? {},
    ip,
  });
}

/** Field-level diff for edit audits; secrets are never included. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const hidden = new Set(["passwordHash", "totpSecret", "createdAt", "editedAt", "editedBy"]);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (hidden.has(key)) continue;
    const a = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const b = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { from: a, to: b };
  }
  return changes;
}
