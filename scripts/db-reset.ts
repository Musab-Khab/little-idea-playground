/** DEVELOPMENT ONLY: wipes the live database schema and re-applies migrations. Refuses if any users exist unless --force. */
import { existsSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL is empty.");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const hasUsers = await sql<
  { present: boolean }[]
>`select to_regclass('public.users') is not null as present`;
if (hasUsers[0]?.present && !process.argv.includes("--force")) {
  const n = (await sql<{ n: number }[]>`select count(*)::int n from users`)[0]?.n ?? 0;
  if (n > 0) {
    console.error(
      `Refusing: the database has ${n} user(s). Pass --force only if you really want to erase everything.`,
    );
    process.exit(1);
  }
}
await sql.unsafe(`drop schema if exists public cascade; drop schema if exists drizzle cascade;
  create schema public; revoke all on schema public from public;`);
await sql.end();
console.log("Schema wiped. Now run: npm run db:migrate");
