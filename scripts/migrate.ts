/** Applies pending migrations as the schema owner (DATABASE_OWNER_URL). Run with `npm run db:migrate`. */
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error("DATABASE_OWNER_URL is empty. Run `npm run db:setup` first.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
migrate(drizzle(sql), { migrationsFolder: "./migrations" })
  .then(() => sql`select apply_app_privileges()`)
  .then(() => console.log("Migrations applied; app privileges refreshed."))
  .catch((e) => {
    console.error("Migration failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
