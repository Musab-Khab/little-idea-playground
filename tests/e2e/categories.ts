/**
 * Manage categories: add a customer location, use it on a new customer, rename it (the customer
 * follows), deactivate it (no longer offered), and check the Karachi / Out of Karachi defaults.
 *
 *   npx tsx tests/e2e/categories.ts   (dev server running; admin credentials in .e2e-secrets.json)
 */
import { chromium, type Page } from "playwright-core";
import { savedPassword, shot, signIn } from "./smoke";
import { expectToast, pickSelect, step } from "./helpers";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const run = Date.now().toString(36).slice(-5).toUpperCase();
const LOCATION = `Hyderabad ${run}`;
const RENAMED = `Hyderabad Region ${run}`;
const CUSTOMER = `Category School ${run}`;

async function openManage(page: Page) {
  await page.getByRole("button", { name: "Manage categories" }).click();
  await pickSelect(page, "List", "Customer locations");
}

async function locationOptions(page: Page) {
  await page.getByRole("button", { name: "New Customer" }).click();
  await page.getByRole("dialog").getByLabel("Location", { exact: false }).first().click();
  const opts = await page.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return opts;
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  try {
    await step("admin signs in", async () => {
      await signIn(page, "admin@turnkey.local", savedPassword("admin@turnkey.local")!);
      await page.goto(`${BASE}/customers`);
    });

    await step("new customer defaults to School / Karachi", async () => {
      await page.getByRole("button", { name: "New Customer" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText("School").first().waitFor();
      await dialog.getByText("Karachi", { exact: true }).first().waitFor();
      await shot(page, "categories-01-new-customer");
      await page.keyboard.press("Escape");
    });

    await step("add a customer location", async () => {
      await openManage(page);
      await page.getByLabel("New category").fill(LOCATION);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expectToast(page, /Category saved/);
      await page.getByRole("dialog").getByText(LOCATION).waitFor();
      await shot(page, "categories-02-manage");
      await page.getByRole("button", { name: "Done" }).click();
    });

    await step("save a customer with the new location", async () => {
      await page.getByRole("button", { name: "New Customer" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Code").fill(`CAT-${run}`);
      await dialog.getByLabel("Name").fill(CUSTOMER);
      await pickSelect(page, "Location", LOCATION);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expectToast(page, /Customer saved/);
      await page.getByRole("row").filter({ hasText: CUSTOMER }).getByText(LOCATION).waitFor();
    });

    await step("renaming the location renames it on the customer", async () => {
      await openManage(page);
      await page.getByRole("button", { name: `Rename ${LOCATION}` }).click();
      await page.getByLabel("Category name").fill(RENAMED);
      await page.getByRole("button", { name: "Save name" }).click();
      await expectToast(page, /Category saved/);
      await page.getByRole("dialog").getByText(`${RENAMED} · 1 record`).waitFor();
      await page.getByRole("button", { name: "Done" }).click();
      await page.getByRole("row").filter({ hasText: CUSTOMER }).getByText(RENAMED).waitFor();
    });

    await step("a deactivated location is no longer offered", async () => {
      await openManage(page);
      await page.getByRole("button", { name: `Deactivate ${RENAMED}` }).click();
      await expectToast(page, /Category updated/);
      await page.getByRole("button", { name: "Done" }).click();
      const opts = await locationOptions(page);
      if (opts.includes(RENAMED)) throw new Error(`Inactive location still offered: ${opts}`);
      if (!opts.includes("Karachi") || !opts.includes("Out of Karachi"))
        throw new Error(`Missing default locations: ${opts}`);
    });

    console.log(`\nCATEGORIES OK. Browser errors: ${errors.length ? errors.join(" | ") : "none"}`);
  } catch (e) {
    await shot(page, "categories-failure").catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(
    "\nCATEGORIES FAILED:",
    e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n") : e,
  );
  process.exitCode = 1;
});
