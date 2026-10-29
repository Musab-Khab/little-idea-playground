/**
 * Browser smoke test against a running dev server (npm run dev).
 * Uses the locally installed Chrome via playwright-core.
 *
 *   E2E_EMAIL=admin@turnkey.local E2E_PASSWORD=<temp or current> E2E_NEW_PASSWORD=<new> npx tsx tests/e2e/smoke.ts
 *
 * Credentials come from the environment only (never committed). Screenshots go to E2E_SHOTS (default ./e2e-shots).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { Secret, TOTP } from "otpauth";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./e2e-shots";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(SHOTS, { recursive: true });

/** Test-only secrets (TOTP keys, current passwords) kept in a git-ignored file between runs. */
const SECRETS_FILE = ".e2e-secrets.json";
const store: { totp: Record<string, string>; passwords: Record<string, string> } = existsSync(
  SECRETS_FILE,
)
  ? JSON.parse(readFileSync(SECRETS_FILE, "utf8"))
  : { totp: {}, passwords: {} };
const persist = () => writeFileSync(SECRETS_FILE, JSON.stringify(store, null, 2));
export const totpSecrets = {
  get: (email: string) => store.totp[email],
  set: (email: string, secret: string) => {
    store.totp[email] = secret;
    persist();
  },
};
export const savedPassword = (email: string) => store.passwords[email];
export const savePassword = (email: string, pw: string) => {
  store.passwords[email] = pw;
  persist();
};
export function code(email: string) {
  const s = totpSecrets.get(email);
  if (!s) throw new Error(`No TOTP secret for ${email}`);
  return new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(s),
  }).generate();
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** Signs in and walks through password change + 2FA enrolment if required. Returns the password now in force. */
export async function signIn(page: Page, email: string, password: string, newPassword?: string) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  let current = password;
  for (let step = 0; step < 4; step++) {
    // Wait for any "…ing" busy button to finish and the next stage to render.
    await page
      .getByText(/(Signing in|Saving|Please wait)…/)
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    if (!page.url().includes("/auth")) return current;
    const body = await page.locator("body").innerText();
    if (/Set up two-factor/.test(body)) {
      await page.getByRole("button", { name: "Show QR code" }).click();
      const keyText = await page.locator("span.font-mono").first().innerText();
      totpSecrets.set(email, keyText.trim());
      await page.getByLabel("6-digit code").fill(code(email));
      await page.getByRole("button", { name: "Enable and continue" }).click();
    } else if (/Two-factor authentication/.test(body)) {
      await page.getByLabel("6-digit code").fill(code(email));
      await page.getByRole("button", { name: "Verify" }).click();
    } else if (/Choose a new password/.test(body)) {
      if (!newPassword) throw new Error("Password change required; set E2E_NEW_PASSWORD");
      await page.getByLabel("Current (temporary) password").fill(current);
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password").fill(newPassword);
      await page.getByRole("button", { name: "Save password" }).click();
      current = newPassword;
      savePassword(email, newPassword);
    } else {
      const alert = await page
        .getByRole("alert")
        .first()
        .innerText()
        .catch(() => "");
      throw new Error(`Sign-in stuck on /auth: ${alert || body.slice(0, 300)}`);
    }
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 10_000 });
  return current;
}

async function main() {
  const email = process.env.E2E_EMAIL ?? "admin@turnkey.local";
  const password = savedPassword(email) ?? process.env.E2E_PASSWORD;
  if (!password) throw new Error("Set E2E_PASSWORD");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  try {
    await signIn(page, email, password, process.env.E2E_NEW_PASSWORD);
    await page.waitForSelector("text=Dashboard");
    await page.waitForTimeout(1500);
    await shot(page, "01-dashboard");
    // Every screen in the menu and every report; any server error shown on a page fails the run.
    const { navItems } = await import("../../src/lib/nav");
    const screens = navItems.flatMap((n) =>
      n.children ? n.children.map((c) => c.path) : [n.path],
    );
    const reports = [
      "pl",
      "bs",
      "tb",
      "cash",
      "mma",
      "compare",
      "bank",
      "cust-out",
      "supp-out",
      "cust-stmt",
      "supp-stmt",
      "sales",
      "purchases",
      "expenses",
      "stock",
      "samples",
      "product",
    ];
    const failures: string[] = [];
    for (const path of [...screens, "/account", ...reports.map((r) => `/reports?r=${r}`)]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1800);
      const text = await page.locator("body").innerText();
      const bad = /Something went wrong|Failed query|not found/i.exec(text);
      if (bad) failures.push(`${path}: ${bad[0]}`);
      if (path.startsWith("/reports?") === false)
        await shot(page, path.replace(/\W+/g, "-").slice(1) || "home");
    }
    if (failures.length) throw new Error(`Pages with errors:\n${failures.join("\n")}`);
    const real = errors.filter((e) => !/ERR_NAME_NOT_RESOLVED|fonts\.g/.test(e));
    console.log(
      `Smoke OK (${screens.length + 1} screens, ${reports.length} reports). Browser errors:`,
      real.length ? real : "none",
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("smoke.ts")) {
  main().catch((e) => {
    console.error("SMOKE FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
