import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: object,
) => Promise<Buffer>;

// scrypt cost parameters (N=2^15, r=8, p=1 ≈ 32 MB, ~50–100 ms per hash).
const N = 32768,
  R = 8,
  P = 1,
  KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64"),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A precomputed hash so failed lookups take as long as real ones (no user enumeration by timing). */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function secretKey(purpose: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing or too short.");
  return Buffer.from(hkdfSync("sha256", secret, "mfahh", purpose, 32));
}

/** AES-256-GCM for small secrets at rest (TOTP seeds). Format: ivB64.tagB64.dataB64 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey("totp"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Corrupt secret");
  const decipher = createDecipheriv("aes-256-gcm", secretKey("totp"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "administrator",
  "welcome1",
  "welcome123",
  "letmein1",
  "abc12345",
  "11111111",
  "00000000",
  "87654321",
  "pakistan",
  "pakistan123",
  "karachi123",
  "lahore123",
  "turnkey123",
  "mfahh123",
  "changeme",
  "changeme1",
  "secret123",
  "default1",
  "football",
  "baseball1",
  "superman",
  "trustno1",
  "monkey123",
  "dragon123",
  "master123",
  "sunshine1",
  "princess1",
  "qwerty12345",
  "1q2w3e4r",
  "1qaz2wsx",
  "zaq12wsx",
  "asdfghjkl",
  "zxcvbnm123",
  "test1234",
  "user1234",
  "login123",
  "accounts123",
]);

/** Returns an error message, or null if the password is acceptable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password is too long.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local))
    return "Password must not contain your email name.";
  if (new Set(password).size < 5) return "Password needs more variety of characters.";
  return null;
}
