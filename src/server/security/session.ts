import { eq, lt } from "drizzle-orm";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import { getDb } from "../db/client";
import { company, rolePermissions, sessions, users } from "../db/schema";
import { randomToken, sha256 } from "./crypto";
import { isPermission, PERMISSION_KEYS, type Permission } from "@/shared/permissions";

const secure = () => (process.env.APP_URL ?? "").startsWith("https://");
/** `__Host-` prefix forces Secure, path=/ and no Domain — only usable over HTTPS. */
export const cookieName = () => (secure() ? "__Host-mfahh_sid" : "mfahh_sid");

export const ABSOLUTE_HOURS = 12;
const DEFAULT_IDLE_MINUTES = 30;
const TOUCH_EVERY_MS = 60_000;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UNAUTHENTICATED"
      | "MFA_REQUIRED"
      | "MFA_SETUP_REQUIRED"
      | "FORBIDDEN"
      | "PASSWORD_CHANGE_REQUIRED",
  ) {
    super(message);
  }
}

export function requestMeta() {
  let ip: string | null = null;
  try {
    ip = getRequestIP({ xForwardedFor: process.env.TRUST_PROXY === "true" }) ?? null;
  } catch {
    ip = null;
  }
  return { ip, userAgent: (getRequestHeader("user-agent") ?? "").slice(0, 300) };
}

export async function createSession(userId: string, mfaVerified: boolean) {
  const token = randomToken();
  const { ip, userAgent } = requestMeta();
  await getDb()
    .insert(sessions)
    .values({
      id: sha256(token),
      userId,
      mfaVerified,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + ABSOLUTE_HOURS * 3600_000),
    });
  setCookie(cookieName(), token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_HOURS * 3600,
  });
  // Opportunistic cleanup of expired sessions.
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function destroyCurrentSession() {
  const token = getCookie(cookieName());
  if (token)
    await getDb()
      .delete(sessions)
      .where(eq(sessions.id, sha256(token)));
  deleteCookie(cookieName(), { path: "/" });
}

/** Ends every session of a user (deactivation, role change, password reset). */
export async function destroyUserSessions(userId: string) {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  permissions: Set<Permission>;
  mfaRequired: boolean;
  sessionId: string;
  mfaVerified: boolean;
}

/**
 * Resolves the signed-in user from the session cookie, enforcing absolute and idle timeouts.
 */
export async function loadSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(cookieName());
  if (!token) return null;
  const db = getDb();
  const sid = sha256(token);
  const [row] = await db
    .select({ s: sessions, u: users, settings: company.settings })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(company, eq(company.id, 1))
    .where(eq(sessions.id, sid));
  if (!row) return null;
  const idleMinutes = row.settings?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES;
  const now = Date.now();
  if (
    row.s.expiresAt.getTime() <= now ||
    row.s.lastSeenAt.getTime() + idleMinutes * 60_000 <= now ||
    row.u.status !== "Active"
  ) {
    await db.delete(sessions).where(eq(sessions.id, sid));
    return null;
  }
  if (now - row.s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sid));
  }
  const perms = await db
    .select({ p: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, row.u.roleId));
  const mfaRoles = row.settings?.mfaRoles ?? ["admin", "accountant"];
  return {
    id: row.u.id,
    name: row.u.name,
    email: row.u.email,
    roleId: row.u.roleId,
    totpEnabled: row.u.totpEnabled,
    mustChangePassword: row.u.mustChangePassword,
    permissions: new Set(
      row.u.roleId === "admin" ? PERMISSION_KEYS : perms.map((p) => p.p).filter(isPermission),
    ),
    // DISABLE_MFA=true (demo/testing only) skips the second factor for everyone.
    mfaRequired:
      process.env.DISABLE_MFA !== "true" && (row.u.totpEnabled || mfaRoles.includes(row.u.roleId)),
    sessionId: sid,
    mfaVerified: row.s.mfaVerified,
  };
}

export async function markSessionMfaVerified(sessionId: string) {
  await getDb()
    .update(sessions)
    .set({ mfaVerified: true, lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

/** Fully authenticated user (second factor done, password current). Throws AuthError otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await loadSessionUser();
  if (!user)
    throw new AuthError("Your session has ended. Please sign in again.", "UNAUTHENTICATED");
  if (user.mfaRequired && !user.totpEnabled)
    throw new AuthError("Set up two-factor authentication to continue.", "MFA_SETUP_REQUIRED");
  if (user.mfaRequired && !user.mfaVerified)
    throw new AuthError("Enter your authentication code to continue.", "MFA_REQUIRED");
  if (user.mustChangePassword)
    throw new AuthError("Please set a new password to continue.", "PASSWORD_CHANGE_REQUIRED");
  return user;
}

export async function requirePerm(...anyOf: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!anyOf.some((p) => user.permissions.has(p))) {
    throw new AuthError("You do not have permission for this action.", "FORBIDDEN");
  }
  return user;
}

export function assertPerm(user: SessionUser, ...anyOf: Permission[]) {
  if (!anyOf.some((p) => user.permissions.has(p))) {
    throw new AuthError("You do not have permission for this action.", "FORBIDDEN");
  }
}
