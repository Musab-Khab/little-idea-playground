import { requestMeta } from "./session";

/**
 * In-memory fixed-window limiter keyed by bucket + client IP.
 * Complements the per-account lockout stored in the database.
 * (Single app instance; move to Postgres/Redis if the app is ever scaled out.)
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(bucket: string, limit: number, windowMs: number) {
  const key = `${bucket}:${requestMeta().ip ?? "unknown"}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
  } else if (++entry.count > limit) {
    const minutes = Math.ceil((entry.resetAt - now) / 60_000);
    throw new Error(
      `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
    );
  }
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
}
