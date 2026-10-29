/**
 * End-to-end business cycle with two users (maker-checker):
 *   admin: creates checker user, customer, book, opening stock → sales invoice → submit
 *   checker: first sign-in (password + 2FA) → approves the invoice
 *   admin: receipt allocated to the invoice → checker approves
 *   checks: invoice Paid, stock reduced, trial balance balanced, audit chain intact.
 *
 *   npx tsx tests/e2e/flow.ts   (dev server running; admin credentials in .e2e-secrets.json from smoke.ts)
 */
import { randomBytes } from "node:crypto";
import { chromium, type Page } from "playwright-core";
import { savedPassword, shot, signIn } from "./smoke";
import { expectToast, openDocFromToast, pickSearch, pickSelect, step } from "./helpers";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const run = Date.now().toString(36).slice(-5).toUpperCase();
const CUSTOMER = `E2E School ${run}`;
const BOOK = `E2E Grammar ${run}`;
const CHECKER = `checker-${run.toLowerCase()}@turnkey.local`;

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminCtx.newPage();
  const errors: string[] = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  let checkerTemp = "";

  try {
    await step("admin signs in", async () => {
      await signIn(admin, "admin@turnkey.local", savedPassword("admin@turnkey.local")!);
    });

    await step("admin creates an Accountant user", async () => {
      await admin.goto(`${BASE}/settings/users-and-roles`);
      await admin.getByRole("button", { name: "New user" }).click();
      await admin.getByLabel("Full name").fill(`Checker ${run}`);
      await admin.getByLabel("Email (sign-in name)").fill(CHECKER);
      await pickSelect(admin, "Role", "Accountant");
      await admin.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      const pw = admin.locator("p.select-all");
      await pw.waitFor();
      checkerTemp = (await pw.innerText()).trim();
      await admin.getByRole("button", { name: "Copy & close" }).click();
    });

    await step("admin creates customer and book", async () => {
      await admin.goto(`${BASE}/customers`);
      await admin.getByRole("button", { name: "New Customer" }).click();
      await admin.getByLabel("Code *").fill(`C-${run}`);
      await admin.getByLabel("Name *").fill(CUSTOMER);
      await admin.getByLabel("Credit period (days)").fill("30");
      await admin.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      await expectToast(admin, /Customer saved/);

      await admin.goto(`${BASE}/inventory/books`);
      await admin.getByRole("button", { name: "New Book / Product" }).click();
      await admin.getByLabel("Book code / SKU *").fill(`B-${run}`);
      await admin.getByLabel("Title *").fill(BOOK);
      await admin.getByLabel("Class / grade").fill("5");
      await admin.getByLabel("Standard cost price (Rs)").fill("50");
      await admin.getByLabel("Sale / retail price (Rs)").fill("100");
      await admin.getByLabel("Minimum stock level").fill("20");
      await admin.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      await expectToast(admin, /Book \/ Product saved/);
    });

    await step("admin posts opening stock of 100 @ Rs 50", async () => {
      await admin.goto(`${BASE}/transactions/opening-balances`);
      await admin.getByRole("button", { name: "New Opening Balances" }).click();
      const dlg = admin.getByRole("dialog");
      await dlg.getByRole("button", { name: "Stock" }).click();
      await pickSearch(admin, dlg.getByLabel("Book"), BOOK);
      await dlg.getByLabel("Quantity").fill("100");
      await dlg.getByLabel("Unit cost").fill("50");
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(admin, /saved as draft/);
      await openDocFromToast(admin);
      await admin.getByRole("button", { name: "Approve & post" }).click();
      await expectToast(admin, /Approved and posted/);
      await shot(admin, "flow-01-opening");
      await admin.keyboard.press("Escape");
    });

    let invoiceNo = "";
    await step("admin creates sales invoice 10 × Rs 100 less 10% and submits", async () => {
      await admin.goto(`${BASE}/sales/invoices`);
      await admin.getByRole("button", { name: "New Sales Invoice" }).click();
      const dlg = admin.getByRole("dialog");
      await pickSearch(admin, dlg.getByLabel("Party"), CUSTOMER);
      await pickSearch(admin, dlg.getByLabel("Book"), BOOK);
      await dlg.getByLabel("Quantity").fill("10");
      await dlg.getByLabel("Discount %").fill("10");
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(admin, /saved as draft/);
      await openDocFromToast(admin);
      const title = await admin.getByRole("dialog").getByRole("heading").first().innerText();
      invoiceNo = /INV-\S+/.exec(title)?.[0] ?? "";
      await admin.getByRole("button", { name: "Approve & post" }).click();
      await expectToast(admin, /another authorised user must approve/);
      await admin.getByRole("button", { name: "Submit for approval" }).click();
      await expectToast(admin, /Sent for approval/);
      await admin.keyboard.press("Escape");
      if (!invoiceNo) throw new Error("Invoice number not shown");
    });

    const checkerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const checker = await checkerCtx.newPage();
    checker.on("pageerror", (e) => errors.push(e.message));
    await step(
      "checker first sign-in (password change + 2FA) and approves the invoice",
      async () => {
        await signIn(checker, CHECKER, checkerTemp, `${randomBytes(10).toString("base64url")}!7q`);
        await checker.getByLabel("Documents awaiting your approval").click();
        await checker.getByRole("button", { name: new RegExp(invoiceNo) }).click();
        await checker.getByRole("button", { name: "Approve & post" }).click();
        await expectToast(checker, /Approved and posted/);
        await checker.getByRole("tab", { name: /Accounting entries/ }).click();
        await shot(checker, "flow-02-invoice-gl");
        await checker.keyboard.press("Escape");
      },
    );

    await step("admin receives Rs 900 against the invoice; checker approves", async () => {
      await admin.goto(`${BASE}/sales/receipts`);
      await admin.getByRole("button", { name: "New Customer Receipt" }).click();
      const dlg = admin.getByRole("dialog");
      await pickSearch(admin, dlg.getByLabel("Party"), CUSTOMER);
      await dlg.getByLabel("Amount (Rs) *").fill("900");
      await pickSelect(admin, "Paid through", "Cash");
      await dlg.getByRole("button", { name: "Oldest first" }).click();
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(admin, /saved as draft/);
      await openDocFromToast(admin);
      await admin.getByRole("button", { name: "Submit for approval" }).click();
      await expectToast(admin, /Sent for approval/);
      await admin.keyboard.press("Escape");

      await checker.reload();
      await checker.getByLabel("Documents awaiting your approval").click();
      await checker.getByRole("button", { name: /RV-/ }).first().click();
      await checker.getByRole("button", { name: "Approve & post" }).click();
      await expectToast(checker, /Approved and posted/);
      await checker.keyboard.press("Escape");
    });

    await step(
      "results: invoice paid, stock 90, customer balance 0, trial balance balanced",
      async () => {
        await admin.goto(`${BASE}/sales/invoices`);
        const row = admin.getByRole("row").filter({ hasText: invoiceNo });
        await row.getByText("Paid", { exact: true }).waitFor({ timeout: 10_000 });

        await admin.goto(`${BASE}/inventory/books`);
        await admin
          .getByRole("row")
          .filter({ hasText: BOOK })
          .getByText("90", { exact: true })
          .waitFor({ timeout: 10_000 });

        await admin.goto(`${BASE}/customers`);
        const cust = await admin.getByRole("row").filter({ hasText: CUSTOMER }).innerText();
        if (!/Rs 0/.test(cust)) throw new Error(`Customer balance not zero: ${cust}`);

        await admin.goto(`${BASE}/reports?r=tb`);
        await admin.getByText(/balanced/).waitFor({ timeout: 15_000 });
        const tb = await admin.getByText(/Closing debits/).innerText();
        if (/NOT balanced/.test(tb)) throw new Error(tb);
        await shot(admin, "flow-03-trial-balance");

        await admin.goto(`${BASE}/reports?r=pl`);
        await admin.getByText("Net profit / (loss)").waitFor({ timeout: 15_000 });
        await shot(admin, "flow-04-profit-loss");

        await admin.goto(`${BASE}/`);
        await admin.waitForTimeout(2000);
        await shot(admin, "flow-05-dashboard");

        await admin.goto(`${BASE}/settings/audit-log`);
        await admin.getByRole("button", { name: "Verify audit trail" }).click();
        await expectToast(admin, /Audit trail intact/);
      },
    );

    console.log(
      `\nFLOW OK (${invoiceNo}). Browser errors: ${errors.length ? errors.join(" | ") : "none"}`,
    );
  } catch (e) {
    await shot(admin, "flow-failure-admin").catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(
    "\nFLOW FAILED:",
    e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n") : e,
  );
  process.exitCode = 1;
});
