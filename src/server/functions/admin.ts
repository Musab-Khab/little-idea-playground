import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { diff, writeAudit } from "../audit";
import {
  assertPerm,
  destroyUserSessions,
  requireUser,
  type SessionUser,
} from "../security/session";
import { decryptSecret, hashPassword } from "../security/crypto";
import { checkRateLimit } from "../security/rateLimit";
import { fail, fyForDate, nextDocNo, PostingContext } from "../posting/context";
import { createBackup, listBackups, pruneBackups, restoreBackup } from "../backup";
import { safe, toRows } from "./_safe";
import { isPermission, PERMISSION_KEYS } from "@/shared/permissions";
import { addDays, round2 } from "@/shared/documents";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const tempPassword = () => `${randomBytes(9).toString("base64url")}#7a`;

async function admin(perm: Parameters<typeof assertPerm>[1]) {
  const u = await requireUser();
  assertPerm(u, perm);
  return u;
}

/** Re-checks the caller's authenticator code for the most dangerous actions. */
async function confirmMfa(user: SessionUser, code: string) {
  checkRateLimit("mfa-confirm", 10, 5 * 60_000);
  const [row] = await getDb()
    .select({ secret: t.users.totpSecret, enabled: t.users.totpEnabled })
    .from(t.users)
    .where(eq(t.users.id, user.id));
  if (!row?.enabled || !row.secret) fail("Enable two-factor authentication on your account first.");
  const { TOTP, Secret } = await import("otpauth");
  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(decryptSecret(row!.secret!)),
  });
  if (totp.validate({ token: code, window: 1 }) === null)
    fail("The authentication code is not valid.");
}

/* ----------------------------------------------------------------- users */

export const listUsers = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    await admin("users.manage");
    const rows = await getDb()
      .select({
        id: t.users.id,
        email: t.users.email,
        name: t.users.name,
        roleId: t.users.roleId,
        status: t.users.status,
        totpEnabled: t.users.totpEnabled,
        lastLoginAt: t.users.lastLoginAt,
        lockedUntil: t.users.lockedUntil,
        mustChangePassword: t.users.mustChangePassword,
        createdAt: t.users.createdAt,
      })
      .from(t.users)
      .orderBy(asc(t.users.name));
    return toRows(rows);
  }),
);

async function activeAdmins(excludeId: string) {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(t.users)
    .where(
      and(eq(t.users.roleId, "admin"), eq(t.users.status, "Active"), ne(t.users.id, excludeId)),
    );
  return r?.n ?? 0;
}

export const saveUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid().nullish(),
      email: z.string().trim().email().max(200),
      name: z.string().trim().min(2).max(100),
      roleId: z.string().min(1).max(50),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("users.manage");
      const db = getDb();
      const [role] = await db.select().from(t.roles).where(eq(t.roles.id, data.roleId));
      if (!role) fail("Role not found.");
      const dup = await db
        .select({ id: t.users.id })
        .from(t.users)
        .where(
          and(
            sql`lower(${t.users.email}) = lower(${data.email})`,
            data.id ? ne(t.users.id, data.id) : sql`true`,
          ),
        );
      if (dup.length) fail("A user with this email already exists.");
      if (data.id) {
        const [existing] = await db.select().from(t.users).where(eq(t.users.id, data.id));
        if (!existing) return fail("User not found.");
        if (
          existing.roleId === "admin" &&
          data.roleId !== "admin" &&
          (await activeAdmins(existing.id)) === 0
        )
          fail("At least one active Admin must remain.");
        if (existing.id === user.id && data.roleId !== existing.roleId)
          fail("You cannot change your own role.");
        await db
          .update(t.users)
          .set({
            email: data.email,
            name: data.name,
            roleId: data.roleId,
            editedBy: user.id,
            editedAt: new Date(),
          })
          .where(eq(t.users.id, data.id));
        if (
          existing.roleId !== data.roleId ||
          existing.email.toLowerCase() !== data.email.toLowerCase()
        )
          await destroyUserSessions(existing.id);
        await writeAudit(db, user, {
          action: "Edited",
          entity: "User",
          entityId: data.id,
          ref: data.email,
          details: diff(existing, data),
        });
        return { id: data.id, tempPassword: null };
      }
      const temp = tempPassword();
      const [u] = await db
        .insert(t.users)
        .values({
          email: data.email,
          name: data.name,
          roleId: data.roleId,
          passwordHash: await hashPassword(temp),
          mustChangePassword: true,
          createdBy: user.id,
        })
        .returning();
      await writeAudit(db, user, {
        action: "Created",
        entity: "User",
        entityId: u!.id,
        ref: data.email,
        details: { role: data.roleId },
      });
      return { id: u!.id, tempPassword: temp };
    }),
  );

export const userAction = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      action: z.enum(["activate", "deactivate", "resetPassword", "resetMfa", "unlock", "signOut"]),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("users.manage");
      const db = getDb();
      const [target] = await db.select().from(t.users).where(eq(t.users.id, data.id));
      if (!target) return fail("User not found.");
      if (target.id === user.id && ["deactivate", "resetMfa"].includes(data.action))
        fail("You cannot do this to your own account.");
      let tempPw: string | null = null;
      switch (data.action) {
        case "activate":
          await db.update(t.users).set({ status: "Active" }).where(eq(t.users.id, target.id));
          break;
        case "deactivate":
          if (target.roleId === "admin" && (await activeAdmins(target.id)) === 0)
            fail("At least one active Admin must remain.");
          await db.update(t.users).set({ status: "Inactive" }).where(eq(t.users.id, target.id));
          break;
        case "resetPassword":
          tempPw = tempPassword();
          await db
            .update(t.users)
            .set({
              passwordHash: await hashPassword(tempPw),
              mustChangePassword: true,
              failedLogins: 0,
              lockedUntil: null,
            })
            .where(eq(t.users.id, target.id));
          break;
        case "resetMfa":
          await db
            .update(t.users)
            .set({ totpEnabled: false, totpSecret: null })
            .where(eq(t.users.id, target.id));
          break;
        case "unlock":
          await db
            .update(t.users)
            .set({ failedLogins: 0, lockedUntil: null })
            .where(eq(t.users.id, target.id));
          break;
        case "signOut":
          break;
      }
      if (data.action !== "unlock" && data.action !== "activate")
        await destroyUserSessions(target.id);
      await writeAudit(db, user, {
        action: `User ${data.action}`,
        entity: "User",
        entityId: target.id,
        ref: target.email,
      });
      return { tempPassword: tempPw };
    }),
  );

/* ----------------------------------------------------------------- roles */

export const listRoles = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    await admin("users.manage");
    const db = getDb();
    const roles = await db.select().from(t.roles).orderBy(asc(t.roles.name));
    const perms = await db.select().from(t.rolePermissions);
    const counts = await db
      .select({ roleId: t.users.roleId, n: sql<number>`count(*)::int` })
      .from(t.users)
      .groupBy(t.users.roleId);
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      isSystem: r.isSystem,
      users: counts.find((c) => c.roleId === r.id)?.n ?? 0,
      permissions:
        r.id === "admin"
          ? [...PERMISSION_KEYS]
          : perms
              .filter((p) => p.roleId === r.id)
              .map((p) => p.permission)
              .filter(isPermission),
    }));
  }),
);

export const saveRole = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().max(50).nullish(),
      name: z.string().trim().min(2).max(60),
      permissions: z.array(z.string()).max(100),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("users.manage");
      const perms = [...new Set(data.permissions.filter(isPermission))];
      return getDb().transaction(async (tx) => {
        let id = data.id;
        if (id === "admin") fail("The Admin role always has every permission.");
        if (id) {
          const before = (
            await tx.select().from(t.rolePermissions).where(eq(t.rolePermissions.roleId, id))
          ).map((p) => p.permission);
          await tx.update(t.roles).set({ name: data.name }).where(eq(t.roles.id, id));
          await tx.delete(t.rolePermissions).where(eq(t.rolePermissions.roleId, id));
          await writeAudit(tx, user, {
            action: "Permissions changed",
            entity: "Role",
            entityId: id,
            ref: data.name,
            details: {
              added: perms.filter((p) => !before.includes(p)),
              removed: before.filter((p) => !perms.includes(p as never)),
            },
          });
        } else {
          id =
            data.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") || `role-${Date.now()}`;
          const exists = await tx
            .select()
            .from(t.roles)
            .where(sql`${t.roles.id} = ${id} or lower(${t.roles.name}) = lower(${data.name})`);
          if (exists.length) fail("A role with this name already exists.");
          await tx.insert(t.roles).values({ id, name: data.name });
          await writeAudit(tx, user, {
            action: "Created",
            entity: "Role",
            entityId: id,
            ref: data.name,
            details: { permissions: perms },
          });
        }
        if (perms.length)
          await tx
            .insert(t.rolePermissions)
            .values(perms.map((permission) => ({ roleId: id!, permission })));
        return { id };
      });
    }),
  );

/* --------------------------------------------------------------- company */

export const getCompany = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    await admin("settings.manage");
    const [c] = await getDb().select().from(t.company);
    if (!c) return fail("Company profile missing; run app:init.");
    return {
      name: c.name,
      address: c.address,
      phone: c.phone,
      email: c.email,
      ntn: c.ntn,
      makerChecker: c.settings.makerChecker !== false,
      mfaRoles: c.settings.mfaRoles ?? ["admin", "accountant"],
      sessionIdleMinutes: c.settings.sessionIdleMinutes ?? 30,
    };
  }),
);

export const saveCompany = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(2).max(200),
      address: z.string().max(500),
      phone: z.string().max(100),
      email: z.string().max(200),
      ntn: z.string().max(50),
      makerChecker: z.boolean(),
      mfaRoles: z.array(z.string().max(50)).max(50),
      sessionIdleMinutes: z.number().int().min(5).max(240),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("settings.manage");
      const db = getDb();
      const [before] = await db.select().from(t.company);
      if (!data.mfaRoles.includes("admin"))
        fail("Two-factor authentication must stay mandatory for Admins.");
      const settings = {
        makerChecker: data.makerChecker,
        mfaRoles: data.mfaRoles,
        sessionIdleMinutes: data.sessionIdleMinutes,
      };
      await db
        .update(t.company)
        .set({
          name: data.name,
          address: data.address,
          phone: data.phone,
          email: data.email,
          ntn: data.ntn,
          settings,
        })
        .where(eq(t.company.id, 1));
      await writeAudit(db, user, {
        action: "Edited",
        entity: "Company settings",
        details: diff({ ...before, ...before?.settings }, { ...data }),
      });
      return { ok: true };
    }),
  );

/* ------------------------------------------------------- financial years */

export const listFinancialYears = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    await requireUser();
    const db = getDb();
    const rows = await db.select().from(t.financialYears).orderBy(desc(t.financialYears.startDate));
    const open = await db.execute<{ fy_id: string; n: string }>(
      sql`select fy_id, count(*) n from documents where status in ('Draft','Pending') group by fy_id`,
    );
    const m = new Map(open.map((o) => [o.fy_id, Number(o.n)]));
    return toRows(rows.map((r) => ({ ...r, unposted: m.get(r.id) ?? 0 })));
  }),
);

export const createFinancialYear = createServerFn({ method: "POST" })
  .validator(
    z.object({
      label: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}$/, "Use a label like 2026-27"),
      startDate: isoDate,
      endDate: isoDate,
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("settings.manage");
      if (data.startDate >= data.endDate) fail("End date must be after start date.");
      const db = getDb();
      const overlap = await db
        .select()
        .from(t.financialYears)
        .where(
          and(
            lte(t.financialYears.startDate, data.endDate),
            gte(t.financialYears.endDate, data.startDate),
          ),
        );
      if (overlap.length) fail(`Overlaps financial year ${overlap[0]!.label}.`);
      const [fy] = await db.insert(t.financialYears).values(data).returning();
      await writeAudit(db, user, {
        action: "Created",
        entity: "Financial Year",
        entityId: fy!.id,
        ref: data.label,
      });
      return { id: fy!.id };
    }),
  );

/**
 * Year-end close: requires every document to be approved or cancelled, transfers the year's
 * income and expense balances to Retained Earnings, locks the year and opens the next one.
 */
export const closeFinancialYear = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("settings.manage");
      await confirmMfa(user, data.code);
      return getDb().transaction(async (tx) => {
        const [fy] = await tx
          .select()
          .from(t.financialYears)
          .where(eq(t.financialYears.id, data.id))
          .for("update");
        if (!fy) return fail("Financial year not found.");
        if (fy.status === "Closed") fail("This year is already closed.");
        const unposted = await tx
          .select({ no: t.documents.docNo })
          .from(t.documents)
          .where(
            and(eq(t.documents.fyId, fy.id), sql`${t.documents.status} in ('Draft','Pending')`),
          )
          .limit(10);
        if (unposted.length)
          fail(
            `Approve or cancel these first: ${unposted.map((u) => u.no).join(", ")}${unposted.length === 10 ? "…" : ""}`,
          );
        const balances = await tx.execute<{ account_id: string; bal: string }>(sql`
        select g.account_id, sum(g.debit - g.credit) bal from gl_entries g join accounts a on a.id = g.account_id
        where g.fy_id = ${fy.id} and a.type in ('Income', 'Expense') group by g.account_id having sum(g.debit - g.credit) <> 0`);
        const docNo = await nextDocNo(tx, "CLS", fy);
        const [doc] = await tx
          .insert(t.documents)
          .values({
            type: "CLOSE",
            docNo,
            date: fy.endDate,
            fyId: fy.id,
            status: "Draft",
            narration: `Year-end closing ${fy.label}`,
            createdBy: user.id,
          })
          .returning();
        const ctx = new PostingContext(tx, user);
        let profit = 0;
        for (const b of balances) {
          const bal = round2(Number(b.bal));
          ctx.cr(b.account_id, bal); // negative amounts flip to the debit side
          profit = round2(profit - bal);
        }
        if (profit > 0) ctx.cr(await ctx.account("RETAINED"), profit);
        else ctx.dr(await ctx.account("RETAINED"), -profit);
        await ctx.flushGl(doc!);
        await tx
          .update(t.documents)
          .set({
            status: "Approved",
            approvedBy: user.id,
            approvedAt: new Date(),
            total: Math.abs(profit),
          })
          .where(eq(t.documents.id, doc!.id));
        await tx
          .update(t.financialYears)
          .set({ status: "Closed", closedBy: user.id, closedAt: new Date() })
          .where(eq(t.financialYears.id, fy.id));
        // Make sure the following year exists so work can continue.
        const nextStart = addDays(fy.endDate, 1);
        const exists = await tx
          .select()
          .from(t.financialYears)
          .where(
            and(
              lte(t.financialYears.startDate, nextStart),
              gte(t.financialYears.endDate, nextStart),
            ),
          );
        if (!exists.length) {
          const y = Number(nextStart.slice(0, 4));
          await tx.insert(t.financialYears).values({
            label: `${y}-${String(y + 1).slice(2)}`,
            startDate: nextStart,
            endDate: addDays(`${y + 1}${fy.endDate.slice(4)}`, 0),
          });
        }
        await writeAudit(tx, user, {
          action: "Year closed",
          entity: "Financial Year",
          entityId: fy.id,
          ref: fy.label,
          details: { closingEntry: docNo, netProfit: profit },
        });
        return { closingEntry: docNo, netProfit: profit };
      });
    }),
  );

/** Admin-only: reverses the closing entry and re-opens the year for corrections. */
export const reopenFinancialYear = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      reason: z.string().trim().min(5).max(500),
      code: z.string().regex(/^\d{6}$/),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("settings.manage");
      if (user.roleId !== "admin") fail("Only an Admin can re-open a closed year.");
      await confirmMfa(user, data.code);
      return getDb().transaction(async (tx) => {
        const [fy] = await tx
          .select()
          .from(t.financialYears)
          .where(eq(t.financialYears.id, data.id))
          .for("update");
        if (!fy || fy.status !== "Closed") return fail("This year is not closed.");
        await tx
          .update(t.financialYears)
          .set({ status: "Open", closedBy: null, closedAt: null })
          .where(eq(t.financialYears.id, fy.id));
        const closing = await tx
          .select()
          .from(t.documents)
          .where(
            and(
              eq(t.documents.fyId, fy.id),
              eq(t.documents.type, "CLOSE"),
              eq(t.documents.status, "Approved"),
            ),
          );
        for (const doc of closing) {
          const ctx = new PostingContext(tx, user);
          const entries = await tx
            .select()
            .from(t.glEntries)
            .where(and(eq(t.glEntries.documentId, doc.id), eq(t.glEntries.isReversal, false)));
          for (const g of entries)
            ctx.gl.push({
              accountId: g.accountId,
              debit: g.credit,
              credit: g.debit,
              narration: "Reversal of year-end close",
            });
          await ctx.flushGl(doc, true);
          await tx
            .update(t.documents)
            .set({
              status: "Cancelled",
              cancelledBy: user.id,
              cancelledAt: new Date(),
              cancelReason: data.reason,
            })
            .where(eq(t.documents.id, doc.id));
        }
        await writeAudit(tx, user, {
          action: "Year re-opened",
          entity: "Financial Year",
          entityId: fy.id,
          ref: fy.label,
          details: { reason: data.reason },
        });
        return { ok: true };
      });
    }),
  );

/* ----------------------------------------------------------------- audit */

export const listAuditLog = createServerFn({ method: "GET" })
  .validator(z.object({ from: isoDate, to: isoDate, search: z.string().max(100).default("") }))
  .handler(({ data }) =>
    safe(async () => {
      await admin("audit.view");
      const term = `%${data.search.toLowerCase()}%`;
      const rows = await getDb()
        .select()
        .from(t.auditLog)
        .where(
          and(
            sql`${t.auditLog.at} >= ${data.from}::date and ${t.auditLog.at} < (${data.to}::date + 1)`,
            data.search
              ? sql`(lower(${t.auditLog.userName}) like ${term} or lower(${t.auditLog.action}) like ${term} or lower(${t.auditLog.entity}) like ${term} or lower(coalesce(${t.auditLog.ref}, '')) like ${term})`
              : undefined,
          ),
        )
        .orderBy(desc(t.auditLog.id))
        .limit(2000);
      return toRows(
        rows.map((r) => ({
          id: r.id,
          at: r.at,
          user: r.userName,
          action: r.action,
          entity: r.entity,
          ref: r.ref,
          entityId: r.entityId,
          ip: r.ip,
          details: JSON.stringify(r.details),
        })),
      );
    }),
  );

export const verifyAuditChain = createServerFn({ method: "POST" }).handler(() =>
  safe(async () => {
    const user = await admin("audit.view");
    const [r] = await getDb().execute<{ broken: string | null; total: string }>(
      sql`select audit_verify() broken, (select count(*) from audit_log) total`,
    );
    await writeAudit(getDb(), user, {
      action: "Audit chain verified",
      entity: "Audit Log",
      details: { result: r?.broken ? `broken at ${r.broken}` : "intact" },
    });
    return {
      intact: !r?.broken,
      brokenAt: r?.broken ? Number(r.broken) : null,
      entries: Number(r?.total ?? 0),
    };
  }),
);

/* --------------------------------------------------------------- backups */

export const getBackups = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    await admin("backup.manage");
    return { backups: toRows(listBackups()), encryption: Boolean(process.env.BACKUP_PASSPHRASE) };
  }),
);

export const runBackup = createServerFn({ method: "POST" }).handler(() =>
  safe(async () => {
    const user = await admin("backup.manage");
    checkRateLimit("backup", 10, 60 * 60_000);
    const b = await createBackup("manual");
    pruneBackups();
    await writeAudit(getDb(), user, {
      action: "Backup created",
      entity: "Backup",
      ref: b.name,
      details: { size: b.size, encrypted: b.encrypted },
    });
    return b;
  }),
);

export const runRestore = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().max(100),
      confirm: z.literal("RESTORE"),
      code: z.string().regex(/^\d{6}$/),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await admin("backup.manage");
      if (user.roleId !== "admin") fail("Only an Admin can restore a backup.");
      await confirmMfa(user, data.code);
      // Safety net: snapshot the current state first.
      const before = await createBackup("prerestore");
      await writeAudit(getDb(), user, {
        action: "Restore started",
        entity: "Backup",
        ref: data.name,
        details: { safetyBackup: before.name },
      });
      await restoreBackup(data.name);
      await writeAudit(getDb(), user, {
        action: "Restore completed",
        entity: "Backup",
        ref: data.name,
        details: { safetyBackup: before.name },
      });
      return { ok: true, safetyBackup: before.name };
    }),
  );
