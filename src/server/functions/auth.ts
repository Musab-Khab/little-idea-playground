import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { writeAudit } from "../audit";
import {
  createSession,
  destroyCurrentSession,
  destroyUserSessions,
  loadSessionUser,
  markSessionMfaVerified,
  requireUser,
} from "../security/session";
import {
  decryptSecret,
  dummyPasswordHash,
  encryptSecret,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from "../security/crypto";
import { checkRateLimit } from "../security/rateLimit";
import { PERMISSION_KEYS } from "@/shared/permissions";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

async function totp(secret: string) {
  const { TOTP, Secret } = await import("otpauth");
  return new TOTP({
    issuer: "MFAHH",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

/** Public: what the shell needs to route the user (login, MFA, password change, or the app). */
export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const u = await loadSessionUser();
  if (!u) return { stage: "signedOut" as const };
  const base = { name: u.name, email: u.email, roleId: u.roleId };
  if (u.mfaRequired && !u.totpEnabled) return { stage: "mfaSetup" as const, ...base };
  if (u.mfaRequired && !u.mfaVerified) return { stage: "mfa" as const, ...base };
  if (u.mustChangePassword) return { stage: "changePassword" as const, ...base };
  return {
    stage: "signedIn" as const,
    ...base,
    id: u.id,
    permissions: u.roleId === "admin" ? PERMISSION_KEYS : [...u.permissions],
  };
});

export const login = createServerFn({ method: "POST" })
  .validator(
    z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) }),
  )
  .handler(async ({ data }) => {
    checkRateLimit("login", 20, 15 * 60_000);
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${data.email})`);
    if (!user || user.status !== "Active") {
      await verifyPassword(data.password, await dummyPasswordHash()); // equal timing
      await writeAudit(
        db,
        { id: null, name: data.email },
        { action: "LoginFailed", entity: "Auth", details: { reason: "unknown or inactive user" } },
      );
      throw new Error(GENERIC_LOGIN_ERROR);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error(
        `Account locked after repeated failed sign-ins. Try again after ${user.lockedUntil.toLocaleTimeString()} or ask an admin.`,
      );
    }
    if (!(await verifyPassword(data.password, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await db
        .update(users)
        .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock })
        .where(eq(users.id, user.id));
      await writeAudit(
        db,
        { id: user.id, name: user.name },
        { action: lock ? "AccountLocked" : "LoginFailed", entity: "Auth", entityId: user.id },
      );
      throw new Error(
        lock
          ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`
          : GENERIC_LOGIN_ERROR,
      );
    }
    await db
      .update(users)
      .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    await createSession(user.id, false);
    await writeAudit(
      db,
      { id: user.id, name: user.name },
      { action: "Login", entity: "Auth", entityId: user.id },
    );
    return { ok: true };
  });

export const verifyMfa = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code"),
    }),
  )
  .handler(async ({ data }) => {
    checkRateLimit("mfa", 10, 5 * 60_000);
    const u = await loadSessionUser();
    if (!u) throw new Error("Your session has ended. Please sign in again.");
    const [row] = await getDb()
      .select({ secret: users.totpSecret })
      .from(users)
      .where(eq(users.id, u.id));
    if (!row?.secret || !u.totpEnabled) throw new Error("Two-factor authentication is not set up.");
    const ok =
      (await totp(decryptSecret(row.secret))).validate({ token: data.code, window: 1 }) !== null;
    if (!ok) {
      await writeAudit(
        getDb(),
        { id: u.id, name: u.name },
        { action: "MfaFailed", entity: "Auth", entityId: u.id },
      );
      throw new Error("That code is not valid. Check your authenticator app's time and try again.");
    }
    await markSessionMfaVerified(u.sessionId);
    return { ok: true };
  });

/** Starts TOTP enrolment: stores a new (not yet enabled) secret and returns a QR code. */
export const beginMfaSetup = createServerFn({ method: "POST" }).handler(async () => {
  const u = await loadSessionUser();
  if (!u) throw new Error("Your session has ended. Please sign in again.");
  if (u.totpEnabled) throw new Error("Two-factor authentication is already enabled.");
  const { Secret, TOTP } = await import("otpauth");
  const secret = new Secret({ size: 20 });
  const uri = new TOTP({
    issuer: "MFAHH",
    label: u.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  }).toString();
  await getDb()
    .update(users)
    .set({ totpSecret: encryptSecret(secret.base32) })
    .where(eq(users.id, u.id));
  const QRCode = await import("qrcode");
  return { qr: await QRCode.toDataURL(uri), secret: secret.base32 };
});

export const confirmMfaSetup = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code"),
    }),
  )
  .handler(async ({ data }) => {
    checkRateLimit("mfa", 10, 5 * 60_000);
    const u = await loadSessionUser();
    if (!u) throw new Error("Your session has ended. Please sign in again.");
    const [row] = await getDb()
      .select({ secret: users.totpSecret })
      .from(users)
      .where(eq(users.id, u.id));
    if (!row?.secret) throw new Error("Start the setup again.");
    if (
      (await totp(decryptSecret(row.secret))).validate({ token: data.code, window: 1 }) === null
    ) {
      throw new Error("That code is not valid. Scan the QR code again and retry.");
    }
    await getDb().update(users).set({ totpEnabled: true }).where(eq(users.id, u.id));
    await markSessionMfaVerified(u.sessionId);
    await writeAudit(
      getDb(),
      { id: u.id, name: u.name },
      { action: "MfaEnabled", entity: "Auth", entityId: u.id },
    );
    return { ok: true };
  });

export const changePassword = createServerFn({ method: "POST" })
  .validator(z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    checkRateLimit("password", 10, 15 * 60_000);
    const u = await loadSessionUser();
    if (!u) throw new Error("Your session has ended. Please sign in again.");
    if (u.mfaRequired && !u.mfaVerified)
      throw new Error("Complete two-factor authentication first.");
    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    if (!row || !(await verifyPassword(data.current, row.passwordHash)))
      throw new Error("Current password is incorrect.");
    const problem = passwordProblem(data.next, row.email);
    if (problem) throw new Error(problem);
    if (await verifyPassword(data.next, row.passwordHash))
      throw new Error("Choose a password different from the current one.");
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(data.next), mustChangePassword: false })
      .where(eq(users.id, u.id));
    // Sign out every other device.
    await destroyUserSessions(u.id);
    await createSession(u.id, true);
    await writeAudit(
      db,
      { id: u.id, name: u.name },
      { action: "PasswordChanged", entity: "Auth", entityId: u.id },
    );
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const u = await loadSessionUser();
  await destroyCurrentSession();
  if (u)
    await writeAudit(
      getDb(),
      { id: u.id, name: u.name },
      { action: "Logout", entity: "Auth", entityId: u.id },
    );
  return { ok: true };
});

/** Lightweight check used by the authenticated layout. */
export const ping = createServerFn({ method: "GET" }).handler(async () => {
  const u = await requireUser();
  return { id: u.id };
});
