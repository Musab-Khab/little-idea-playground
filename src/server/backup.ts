/**
 * Database backups with pg_dump (custom format), optionally encrypted with AES-256-GCM
 * when BACKUP_PASSPHRASE is set. Restores use pg_restore and then re-apply app privileges.
 */
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("MFAHHENC1");
const NAME_RE = /^mfahh-\d{8}-\d{6}(-[a-z]+)?\.dump(\.enc)?$/;

export const backupDir = () => {
  const dir = resolve(process.env.BACKUP_DIR || "./backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
};

function bin(name: "pg_dump" | "pg_restore") {
  const dir = process.env.PG_BIN_DIR;
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return dir ? join(dir, exe) : exe;
}

function ownerUrl() {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is not configured on the server.");
  return url;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "";
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", (e) =>
      fail(new Error(`Could not start ${cmd}: ${e.message}. Set PG_BIN_DIR in .env.`)),
    );
    p.on("close", (code) =>
      code === 0
        ? ok()
        : fail(new Error(`${cmd} failed: ${err.trim().split("\n").slice(-3).join(" ")}`)),
    );
  });
}

const key = (salt: Buffer) =>
  scryptSync(process.env.BACKUP_PASSPHRASE ?? "", salt, 32, { N: 16384, r: 8, p: 1 });

export function safeBackupPath(name: string) {
  if (!NAME_RE.test(name)) throw new Error("Invalid backup name.");
  const p = join(backupDir(), name);
  if (!existsSync(p)) throw new Error("Backup not found.");
  return p;
}

export async function createBackup(tag = "") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const base = `mfahh-${stamp}${tag ? `-${tag}` : ""}.dump`;
  const plain = join(backupDir(), base);
  await run(bin("pg_dump"), [
    "--format=custom",
    "--no-owner",
    "--file",
    plain,
    "--dbname",
    ownerUrl(),
  ]);
  if (!process.env.BACKUP_PASSPHRASE)
    return { name: base, encrypted: false, size: statSync(plain).size };

  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(salt), iv);
  const encName = `${base}.enc`;
  const out = createWriteStream(join(backupDir(), encName));
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(plain), cipher, out, { end: false });
  await new Promise<void>((ok, fail) =>
    out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? fail(e) : ok())),
  );
  rmSync(plain);
  return { name: encName, encrypted: true, size: statSync(join(backupDir(), encName)).size };
}

async function decryptTo(src: string, dest: string) {
  const size = statSync(src).size;
  const fd = openSync(src, "r");
  const head = Buffer.alloc(MAGIC.length + 28),
    tag = Buffer.alloc(16);
  readSync(fd, head, 0, head.length, 0);
  readSync(fd, tag, 0, 16, size - 16);
  closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error("Not an MFAHH encrypted backup.");
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16),
    iv = head.subarray(MAGIC.length + 16);
  const decipher = createDecipheriv("aes-256-gcm", key(salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(src, { start: head.length, end: size - 17 }),
      decipher,
      createWriteStream(dest),
    );
  } catch {
    rmSync(dest, { force: true });
    throw new Error("Backup could not be decrypted (wrong BACKUP_PASSPHRASE or damaged file).");
  }
}

export async function restoreBackup(name: string) {
  const src = safeBackupPath(name);
  let file = src;
  if (name.endsWith(".enc")) {
    file = join(backupDir(), `restore-${Date.now()}.dump`);
    await decryptTo(src, file);
  }
  try {
    await run(bin("pg_restore"), [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--single-transaction",
      "--dbname",
      ownerUrl(),
      file,
    ]);
  } finally {
    if (file !== src) rmSync(file, { force: true });
  }
  const postgres = (await import("postgres")).default;
  const sql = postgres(ownerUrl(), { max: 1, onnotice: () => {} });
  try {
    await sql`select apply_app_privileges()`;
  } finally {
    await sql.end();
  }
}

/** Decrypts (if needed) and asks pg_restore to read the whole archive; returns the number of objects. */
export async function verifyBackup(name: string) {
  const src = safeBackupPath(name);
  let file = src;
  if (name.endsWith(".enc")) {
    file = join(backupDir(), `verify-${Date.now()}.dump`);
    await decryptTo(src, file);
  }
  try {
    const out: string[] = [];
    await new Promise<void>((ok, fail) => {
      const p = spawn(bin("pg_restore"), ["--list", file], { windowsHide: true });
      p.stdout.on("data", (d: Buffer) => out.push(d.toString()));
      p.on("error", fail);
      p.on("close", (c) =>
        c === 0 ? ok() : fail(new Error("pg_restore could not read the backup.")),
      );
    });
    return out
      .join("")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith(";")).length;
  } finally {
    if (file !== src) rmSync(file, { force: true });
  }
}

export function listBackups() {
  return readdirSync(backupDir())
    .filter((f) => NAME_RE.test(f))
    .map((f) => {
      const s = statSync(join(backupDir(), f));
      return {
        name: f,
        size: s.size,
        createdAt: s.mtime.toISOString(),
        encrypted: f.endsWith(".enc"),
      };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Keeps the newest `daily` backups plus the newest backup of each of the last `monthly` months. */
export function pruneBackups(daily = 14, monthly = 12) {
  const all = listBackups();
  const keep = new Set(all.slice(0, daily).map((b) => b.name));
  const months = new Set<string>();
  for (const b of all) {
    const m = b.name.slice(6, 12);
    if (!months.has(m) && months.size < monthly) {
      months.add(m);
      keep.add(b.name);
    }
  }
  const removed = all.filter((b) => !keep.has(b.name));
  for (const b of removed) rmSync(join(backupDir(), b.name));
  return removed.length;
}
