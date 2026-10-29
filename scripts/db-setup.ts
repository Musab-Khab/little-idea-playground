/**
 * One-time database bootstrap. Run with `npm run db:setup`.
 *
 * Connects as the Postgres superuser from .env and creates:
 *   - role mfahh_owner : owns the schema, used only for migrations
 *   - role mfahh_app   : what the running app uses; can read/write data but cannot
 *                        change the schema (ledger/audit restrictions are added by migrations)
 *   - databases mfahh (live) and mfahh_test (automated tests), owned by mfahh_owner
 * Then writes DATABASE_OWNER_URL, DATABASE_URL, TEST_DATABASE_* and SESSION_SECRET into .env.
 * Safe to re-run: existing roles keep working and passwords are only generated when missing.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const ENV_FILE = ".env";
/** In Docker the connection settings come from the environment; --no-write leaves files alone. */
const writeEnv = !process.argv.includes("--no-write");
if (writeEnv && !existsSync(ENV_FILE)) {
  console.error("Missing .env. Copy .env.example to .env and set PG_SUPERUSER_PASSWORD.");
  process.exit(1);
}
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const host = process.env.PG_HOST || "localhost";
const port = Number(process.env.PG_PORT || 5432);
const superuser = process.env.PG_SUPERUSER || "postgres";
const superPassword = process.env.PG_SUPERUSER_PASSWORD;
const dbNames = ["mfahh", "mfahh_test"];
if (!superPassword) {
  console.error("PG_SUPERUSER_PASSWORD is empty in .env.");
  process.exit(1);
}

const secret = () => randomBytes(24).toString("hex");
const passwordFrom = (url: string | undefined) => {
  try {
    return url ? decodeURIComponent(new URL(url).password) : "";
  } catch {
    return "";
  }
};
const ownerPassword =
  process.env.DB_OWNER_PASSWORD || passwordFrom(process.env.DATABASE_OWNER_URL) || secret();
const appPassword =
  process.env.DB_APP_PASSWORD || passwordFrom(process.env.DATABASE_URL) || secret();

async function main() {
  const admin = postgres({
    host,
    port,
    user: superuser,
    password: superPassword,
    database: "postgres",
    onnotice: () => {},
  });
  try {
    for (const [role, pw] of [
      ["mfahh_owner", ownerPassword],
      ["mfahh_app", appPassword],
    ] as const) {
      const exists = await admin`select 1 from pg_roles where rolname = ${role}`;
      // Role names are constants; the password is passed as a literal through format() to avoid injection.
      const [row] = await admin<
        { sql: string }[]
      >`select format(${exists.length ? "alter role %I with login password %L" : "create role %I with login password %L"}, ${role}::text, ${pw}::text) as sql`;
      await admin.unsafe(row!.sql);
    }
    for (const dbName of dbNames) {
      const db = await admin`select 1 from pg_database where datname = ${dbName}`;
      if (!db.length)
        await admin.unsafe(`create database ${dbName} owner mfahh_owner encoding 'UTF8'`);
    }
  } finally {
    await admin.end();
  }

  for (const dbName of dbNames) {
    const su = postgres({
      host,
      port,
      user: superuser,
      password: superPassword,
      database: dbName,
      onnotice: () => {},
    });
    try {
      await su.unsafe(`
      alter schema public owner to mfahh_owner;
      revoke all on schema public from public;
      revoke all on database ${dbName} from public;
      grant connect on database ${dbName} to mfahh_app;
      grant usage on schema public to mfahh_app;
      alter default privileges for role mfahh_owner in schema public grant select, insert, update, delete on tables to mfahh_app;
      alter default privileges for role mfahh_owner in schema public grant usage, select on sequences to mfahh_app;
      alter default privileges for role mfahh_owner in schema public grant execute on functions to mfahh_app;
    `);
    } finally {
      await su.end();
    }
  }

  if (!writeEnv) {
    console.log(
      `Databases ${dbNames.join(", ")} ready. Roles mfahh_owner and mfahh_app configured.`,
    );
    return;
  }
  const url = (user: string, pw: string, dbName = "mfahh") =>
    `postgres://${user}:${encodeURIComponent(pw)}@${host}:${port}/${dbName}`;
  let env = readFileSync(ENV_FILE, "utf8");
  const setVar = (key: string, value: string) => {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    env = re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
  };
  setVar("DATABASE_OWNER_URL", url("mfahh_owner", ownerPassword));
  setVar("DATABASE_URL", url("mfahh_app", appPassword));
  setVar("TEST_DATABASE_OWNER_URL", url("mfahh_owner", ownerPassword, "mfahh_test"));
  setVar("TEST_DATABASE_URL", url("mfahh_app", appPassword, "mfahh_test"));
  if (!process.env.SESSION_SECRET) setVar("SESSION_SECRET", randomBytes(32).toString("base64"));
  writeFileSync(ENV_FILE, env);
  console.log(
    `Databases ${dbNames.join(", ")} ready. Roles mfahh_owner and mfahh_app configured; .env updated.`,
  );
}

main().catch((e) => {
  console.error("db:setup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
