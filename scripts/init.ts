/**
 * Seeds reference data and creates the first admin user.
 *   npm run app:init -- --email admin@turnkey.pk --name "Admin"
 * Prints a one-time temporary password; the admin must change it and set up 2FA on first sign-in.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { seedBaseData } from "../src/server/db/baseData";
import { hashPassword } from "../src/server/security/crypto";
import { writeAudit } from "../src/server/audit";
import { todayISO } from "../src/shared/documents";

if (existsSync(".env")) process.loadEnvFile(".env");

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const db = getDb();
  await seedBaseData(db, todayISO());
  console.log(
    "Reference data ready (company, roles, chart of accounts, expense heads, financial year).",
  );

  const email = arg("email");
  if (!email) {
    console.log("No --email given; skipped admin creation.");
    return;
  }
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  if (existing.length) {
    console.log(`User ${email} already exists; nothing changed.`);
    return;
  }
  const temp = randomBytes(9).toString("base64url") + "#7a";
  const [u] = await db
    .insert(users)
    .values({
      email,
      name: arg("name") ?? "Administrator",
      roleId: "admin",
      passwordHash: await hashPassword(temp),
      mustChangePassword: true,
    })
    .returning();
  await writeAudit(
    db,
    { id: null, name: "system" },
    {
      action: "UserCreated",
      entity: "User",
      entityId: u!.id,
      ref: email,
      details: { role: "admin" },
    },
  );
  console.log(
    `\nAdmin created: ${email}\nTemporary password (shown once): ${temp}\nSign in, set a new password and enrol two-factor authentication.`,
  );
}

main()
  .catch((e) => {
    console.error("Init failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
