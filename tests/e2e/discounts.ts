/**
 * Customer discounts: a customer with fixed discounts (10% default, Textbook Rs 15/copy) gets
 * them filled in, read-only, on a new sales invoice. Also covers the automatic customer code
 * and the Discount column on the customer list.
 *
 *   npx tsx tests/e2e/discounts.ts   (dev server running; admin credentials in .e2e-secrets.json)
 */
import { chromium } from "playwright-core";
import { savedPassword, shot, signIn } from "./smoke";
import { expectToast, pickSearch, pickSelect, step } from "./helpers";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const run = Date.now().toString(36).slice(-5).toUpperCase();
const CUSTOMER = `Discount School ${run}`;
const BOOK = `Discount Reader ${run}`;

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  try {
    await step("admin signs in and adds a Textbook", async () => {
      await signIn(page, "admin@turnkey.local", savedPassword("admin@turnkey.local")!);
      await page.goto(`${BASE}/inventory/books`);
      await page.getByRole("button", { name: "New Book / Product" }).click();
      await page.getByLabel("Book code / SKU *").fill(`D-${run}`);
      await page.getByLabel("Title *").fill(BOOK);
      await page.getByLabel("Sale / retail price (Rs)").fill("200");
      await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      await expectToast(page, /Book \/ Product saved/);
    });

    await step("customer with fixed discounts and a Textbook Rs rule", async () => {
      await page.goto(`${BASE}/customers`);
      await page.getByRole("button", { name: "New Customer" }).click();
      const dialog = page.getByRole("dialog");
      // Code left blank: numbered automatically.
      if (
        !/^Auto: CUS-\d{3}$/.test(
          (await dialog.getByLabel("Code").getAttribute("placeholder")) ?? "",
        )
      )
        throw new Error("Automatic code placeholder missing");
      await dialog.getByLabel("Name *").fill(CUSTOMER);
      await dialog.getByLabel("Discount (% or Rs per copy)").fill("10");
      await pickSelect(page, "Sales discount", "Fixed");
      await dialog.getByRole("button", { name: "Add category discount" }).click();
      for (const [label, option] of [
        ["Book category 1", "Textbook"],
        ["Discount type 1", "Amount"],
      ] as const) {
        await dialog.getByLabel(label, { exact: true }).click();
        await page.getByRole("option", { name: option, exact: true }).click();
      }
      await dialog.getByLabel("Rs per copy 1").fill("15");
      await shot(page, "discounts-01-customer");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expectToast(page, /Customer saved/);
      const row = page.getByRole("row").filter({ hasText: CUSTOMER });
      await row.getByText(/^CUS-\d{3}$/).waitFor();
      await row.getByText("10% + 1 category (fixed)").waitFor();
    });

    await step("sales invoice fills the customer's discount, read-only", async () => {
      await page.goto(`${BASE}/sales/invoices`);
      await page.getByRole("button", { name: "New Sales Invoice" }).click();
      const dlg = page.getByRole("dialog");
      await pickSearch(page, dlg.getByLabel("Party"), CUSTOMER);
      await pickSearch(page, dlg.getByLabel("Book"), BOOK);
      const rs = dlg.getByLabel("Discount Rs per copy");
      const pct = dlg.getByLabel("Discount %");
      if ((await rs.inputValue()) !== "15") throw new Error(`Rs/copy = ${await rs.inputValue()}`);
      if ((await pct.inputValue()) !== "0") throw new Error(`Disc % = ${await pct.inputValue()}`);
      if (!(await rs.isDisabled()) || !(await pct.isDisabled()))
        throw new Error("Fixed discounts should be read-only");
      await dlg.getByText("185.00").first().waitFor();
      await dlg.getByText(/has fixed discounts/).waitFor();
      await shot(page, "discounts-02-invoice");
      await page.keyboard.press("Escape");
    });

    console.log(`\nDISCOUNTS OK. Browser errors: ${errors.length ? errors.join(" | ") : "none"}`);
  } catch (e) {
    await shot(page, "discounts-failure").catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(
    "\nDISCOUNTS FAILED:",
    e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n") : e,
  );
  process.exitCode = 1;
});
