import { ZodError } from "zod";
import { AuthError } from "../security/session";
import { PostingError } from "../posting/context";

/**
 * Wraps a server-function body so only intended messages reach the browser.
 * Business and auth errors pass through; anything unexpected is logged server-side
 * and replaced with a generic message (no stack traces or SQL leak to clients).
 */
export async function safe<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) throw new Error(`${e.code}: ${e.message}`);
    if (e instanceof PostingError) throw new Error(e.message);
    if (e instanceof ZodError) throw new Error(e.issues[0]?.message ?? "Invalid input.");
    const pg = e as { code?: string; constraint_name?: string; message?: string };
    if (pg.code === "23505")
      throw new Error(`This ${uniqueLabel(pg.constraint_name)} already exists.`);
    if (pg.code === "P0001" && pg.message) throw new Error(pg.message); // RAISE EXCEPTION from integrity triggers
    if (e instanceof Error && e.constructor === Error) throw e; // our own plain errors
    console.error("[server error]", e);
    throw new Error(
      "Something went wrong. The error has been logged; please try again or contact the administrator.",
    );
  }
}

function uniqueLabel(constraint = "") {
  if (constraint.includes("email")) return "email";
  if (constraint.includes("account_no")) return "account number";
  if (constraint.includes("emp_id")) return "employee ID";
  if (constraint.includes("doc_no")) return "document number";
  if (constraint.includes("name")) return "name";
  if (constraint.includes("label")) return "label";
  return "code";
}

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

/** Flattens DB rows for the wire: Dates become ISO strings, undefined becomes null. */
export function toRows(rows: object[]): Row[] {
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] =
        v instanceof Date
          ? v.toISOString()
          : v === undefined
            ? null
            : typeof v === "object" && v !== null
              ? JSON.stringify(v)
              : (v as Cell);
    }
    return out;
  });
}
