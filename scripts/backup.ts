/**
 * Nightly backup: `npm run backup`. Schedule it with Windows Task Scheduler or cron.
 * Keeps 14 daily + 12 monthly backups in BACKUP_DIR. Copy that folder off-site as well.
 */
import { existsSync } from "node:fs";
import { createBackup, pruneBackups } from "../src/server/backup";

if (existsSync(".env")) process.loadEnvFile(".env");

try {
  const b = await createBackup("auto");
  const removed = pruneBackups();
  console.log(
    `Backup written: ${b.name} (${(b.size / 1024).toFixed(0)} KB${b.encrypted ? ", encrypted" : ", NOT encrypted - set BACKUP_PASSPHRASE"}). Old backups removed: ${removed}.`,
  );
} catch (e) {
  console.error("Backup failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
