import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

let instance: { db: DB; sql: postgres.Sql } | undefined;

/** Lazily opened pool for the restricted app role (DATABASE_URL). Server-only. */
export function getDb(): DB {
  return connection().db;
}

export function getSql(): postgres.Sql {
  return connection().sql;
}

function connection() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured. Run `npm run db:setup`.");
    const sql = postgres(url, { max: 10, idle_timeout: 30, onnotice: () => {} });
    instance = { sql, db: drizzle(sql, { schema }) };
  }
  return instance;
}

export async function closeDb() {
  await instance?.sql.end();
  instance = undefined;
}
