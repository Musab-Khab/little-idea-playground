/**
 * Second end-to-end cycle covering the rest of the modules:
 *   data import (customers, suppliers, books) → purchase invoice → purchase return →
 *   samples issue/return → sales invoice cancelled & reversed → staff + payroll →
 *   printable voucher → trial balance and audit chain.
 *
 *   npx tsx tests/e2e/flow2.ts   (dev server running; admin credentials in .e2e-secrets.json)
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import * as XLSX from "xlsx";
import { savedPassword, shot, signIn } from "./smoke";
import {
  approveFromInbox,
  expectToast,
  openDocFromToast,
  openDocNo,
  pickSearch,
  pickSelect,
  step,
} from "./helpers";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FILES = join(process.env.E2E_SHOTS ?? "./e2e-shots", "import-files");
mkdirSync(FILES, { recursive: true });
const run = Date.now().toString(36).slice(-5).toUpperCase();
const CUSTOMER = `Import School ${run}`;
const SUPPLIER = `Import Printers ${run}`;
const BOOK = `Import Science ${run}`;
const CHECKER = `checker2-${run.toLowerCase()}@turnkey.local`;

function sheet(name: string, rows: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Import");
  const path = join(FILES, `${name}-${run}.xlsx`);
  XLSX.writeFile(wb, path);
  return path;
}

async function importFile(page: Page, what: string, file: string, expectRows: number) {
  await page.goto(`${BASE}/settings/data-import`);
  await page.getByLabel("What to import").click();
  await page.getByRole("option", { name: what }).click();
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText(`All ${expectRows} rows are valid.`).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Import \d+ rows/ }).click();
  await expectToast(page, new RegExp(`${expectRows} records imported`));
}

async function stockOf(page: Page) {
  await page.goto(`${BASE}/inventory/books`);
  const row = page.getByRole("row").filter({ hasText: BOOK });
  await row.waitFor({ timeout: 15_000 });
  const cells = await row.getByRole("cell").allInnerTexts();
  return Number(cells[6]!.replace(/,/g, ""));
}

async function expectStock(page: Page, qty: number) {
  const got = await stockOf(page);
  if (got !== qty) throw new Error(`Expected stock ${qty}, got ${got}`);
}

async function newDoc(page: Page, path: string, button: string) {
  await page.goto(`${BASE}${path}`);
  await page.getByRole("button", { name: button }).click();
  return page.getByRole("dialog");
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const admin = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors: string[] = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  let checkerTemp = "";
  let piNo = "";

  try {
    await step("admin signs in and creates an Accountant", async () => {
      await signIn(admin, "admin@turnkey.local", savedPassword("admin@turnkey.local")!);
      await admin.goto(`${BASE}/settings/users-and-roles`);
      await admin.getByRole("button", { name: "New user" }).click();
      await admin.getByLabel("Full name").fill(`Checker2 ${run}`);
      await admin.getByLabel("Email (sign-in name)").fill(CHECKER);
      await pickSelect(admin, "Role", "Accountant");
      await admin.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      const pw = admin.locator("p.select-all");
      await pw.waitFor();
      checkerTemp = (await pw.innerText()).trim();
      await admin.getByRole("button", { name: "Copy & close" }).click();
    });

    await step("import rejects a bad file and shows row errors", async () => {
      const bad = sheet("bad-customers", [
        ["code", "name", "category", "creditDays"],
        ["", "No code", "School", 30],
        [`X-${run}`, "Bad category", "Spaceship", 30],
      ]);
      await admin.goto(`${BASE}/settings/data-import`);
      await admin.locator("input[type=file]").setInputFiles(bad);
      await admin.getByRole("button", { name: "Check" }).click();
      await admin.getByText("Row 2: Code is required").waitFor({ timeout: 15_000 });
      await admin.getByText(/Row 3: Unknown category "Spaceship"/).waitFor();
      if (await admin.getByRole("button", { name: /^Import \d+ rows/ }).isEnabled())
        throw new Error("Import enabled despite errors");
    });

    await step("import customers, suppliers and books from Excel", async () => {
      await importFile(
        admin,
        "Customers",
        sheet("customers", [
          ["code", "name", "category", "phone", "city", "creditDays", "creditLimit"],
          [`IC-${run}`, CUSTOMER, "School", "0300-1111111", "Karachi", 30, 0],
          [`IC2-${run}`, `${CUSTOMER} Branch`, "Bookshop", "", "Hyderabad", 15, 0],
        ]),
        2,
      );
      await importFile(
        admin,
        "Suppliers / vendors",
        sheet("suppliers", [
          ["code", "name", "category", "creditDays"],
          [`IS-${run}`, SUPPLIER, "Printer", 30],
        ]),
        1,
      );
      await importFile(
        admin,
        "Books & products",
        sheet("books", [
          ["code", "name", "category", "className", "costPrice", "salePrice", "minStock"],
          [`IB-${run}`, BOOK, "Textbook", "7", 60, 150, 10],
        ]),
        1,
      );
      await shot(admin, "flow2-01-import");
    });

    await step("purchase invoice 100 × Rs 60 submitted by admin", async () => {
      const dlg = await newDoc(admin, "/purchases/invoices", "New Purchase Invoice");
      await pickSearch(admin, dlg.getByLabel("Party"), SUPPLIER);
      await pickSelect(admin, "Purchase of", "Books");
      await pickSearch(admin, dlg.getByLabel("Book"), BOOK);
      await dlg.getByLabel("Quantity").fill("100");
      await dlg.getByLabel("Rate").fill("60");
      await dlg.getByLabel(/Supplier invoice no/).fill(`SINV-${run}`);
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(admin, /saved as draft/);
      await openDocFromToast(admin);
      piNo = await openDocNo(admin);
      await admin.getByRole("button", { name: "Submit for approval" }).click();
      await expectToast(admin, /Sent for approval/);
      await admin.keyboard.press("Escape");
    });

    const checker = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage();
    checker.on("pageerror", (e) => errors.push(e.message));
    await step("checker signs in (password + 2FA) and approves the purchase", async () => {
      await signIn(checker, CHECKER, checkerTemp, `${randomBytes(10).toString("base64url")}!7q`);
      await approveFromInbox(checker, new RegExp(piNo));
      await expectStock(admin, 100);
    });

    await step("purchase return of 10 reduces stock and the payable", async () => {
      const dlg = await newDoc(admin, "/purchases/returns", "New Purchase Return");
      await pickSearch(admin, dlg.getByLabel("Party"), SUPPLIER);
      await pickSelect(admin, "Original invoice", piNo);
      await dlg.getByLabel("Return quantity").fill("10");
      await dlg.getByLabel(/^Reason/).fill("Misprinted pages");
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(admin, /saved as draft/);
      await openDocFromToast(admin);
      const prNo = await openDocNo(admin);
      await admin.getByRole("button", { name: "Submit for approval" }).click();
      await expectToast(admin, /Sent for approval/);
      await admin.keyboard.press("Escape");
      await approveFromInbox(checker, new RegExp(prNo));
      await expectStock(admin, 90);
      await admin.goto(`${BASE}/suppliers`);
      const row = await admin.getByRole("row").filter({ hasText: SUPPLIER }).innerText();
      if (!/Rs 5,400/.test(row)) throw new Error(`Supplier payable should be Rs 5,400: ${row}`);
    });

    await step("samples: issue 5, return 2 (posted immediately, no sale)", async () => {
      let dlg = await newDoc(admin, "/inventory/samples", "New Sample Issue");
      await pickSearch(admin, dlg.getByLabel("Party"), CUSTOMER);
      await dlg.getByLabel(/Issued to/).fill("Principal");
      await dlg.getByLabel(/^Purpose/).fill("Adoption 2027");
      await pickSearch(admin, dlg.getByLabel("Book"), BOOK);
      await dlg.getByLabel("Quantity").fill("5");
      await dlg.getByRole("button", { name: "Save & post" }).click();
      await expectToast(admin, /saved and posted/);
      await openDocFromToast(admin);
      const smpNo = await openDocNo(admin);
      await admin.keyboard.press("Escape");
      await expectStock(admin, 85);

      dlg = await newDoc(admin, "/inventory/samples", "New Sample Return");
      await pickSearch(admin, dlg.getByLabel("Party"), CUSTOMER);
      await pickSelect(admin, "Sample slip", smpNo);
      await dlg.getByLabel("Return quantity").fill("2");
      await dlg.getByRole("button", { name: "Save & post" }).click();
      await expectToast(admin, /saved and posted/);
      await admin.keyboard.press("Escape");
      await expectStock(admin, 87);
    });

    await step("sales invoice approved, then cancelled & reversed by the accountant", async () => {
      const dlg = await newDoc(admin, "/sales/invoices", "New Sales Invoice");
      await pickSearch(admin, dlg.getByLabel("Party"), CUSTOMER);
      await pickSearch(admin, dlg.getByLabel("Book"), BOOK);
      await dlg.getByLabel("Quantity").fill("20");
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(admin, /saved as draft/);
      await openDocFromToast(admin);
      const siNo = await openDocNo(admin);
      await admin.getByRole("button", { name: "Submit for approval" }).click();
      await expectToast(admin, /Sent for approval/);
      await admin.keyboard.press("Escape");
      await approveFromInbox(checker, new RegExp(siNo));
      await expectStock(admin, 67);

      await checker.goto(`${BASE}/sales/invoices`);
      await checker.getByRole("row").filter({ hasText: siNo }).click();
      await checker.getByRole("button", { name: "Cancel & reverse" }).click();
      await checker.getByLabel(/Reason for cancelling/).fill("Wrong customer selected");
      await checker.getByRole("button", { name: "Confirm" }).click();
      await expectToast(checker, /Cancelled; all postings reversed/);
      await checker.getByRole("tab", { name: /Accounting entries/ }).click();
      await shot(checker, "flow2-02-reversal");
      await checker.keyboard.press("Escape");
      await expectStock(admin, 87);
    });

    await step("printable purchase voucher shows letterhead and amount in words", async () => {
      await admin.goto(`${BASE}/purchases/invoices`);
      await admin.getByRole("row").filter({ hasText: piNo }).click();
      const [print] = await Promise.all([
        admin.waitForEvent("popup"),
        admin.getByRole("button", { name: "Print / PDF" }).click(),
      ]);
      await print.getByText("Purchase Invoice", { exact: true }).waitFor({ timeout: 15_000 });
      await print.getByText(/Rupees Six Thousand Only/).waitFor();
      await shot(print, "flow2-03-print");
      await print.close();
      await admin.keyboard.press("Escape");
    });

    await step("staff member, payroll prepared by admin and approved by accountant", async () => {
      await admin.goto(`${BASE}/staff/staff`);
      await admin.getByRole("button", { name: "New Staff Member" }).click();
      const dlg = admin.getByRole("dialog");
      await dlg.getByLabel("Employee ID *").fill(`E-${run}`);
      await dlg.getByLabel("Full name *").fill(`Staff ${run}`);
      await dlg.getByLabel("Basic salary (Rs)").fill("30000");
      await dlg.getByLabel("Allowances (Rs)").fill("5000");
      await dlg.getByRole("button", { name: "Save" }).click();
      await expectToast(admin, /Staff Member saved/);

      // A month inside the open 2026-27 year, varied per run (payroll is unique per month).
      const m = 7 + (parseInt(run, 36) % 12);
      const month =
        m > 12 ? `2027-${String(m - 12).padStart(2, "0")}` : `2026-${String(m).padStart(2, "0")}`;
      const pay = await newDoc(admin, "/staff/payroll", "New Payroll");
      await pay.getByLabel(/Payroll month/).fill(month);
      await pay.getByRole("button", { name: "Load active staff" }).click();
      await pay.getByText(`Staff ${run}`).waitFor({ timeout: 15_000 });
      await pay.getByRole("button", { name: "Save draft" }).click();
      const res = await Promise.race([
        expectToast(admin, /saved as draft/).then(() => "ok"),
        admin
          .getByRole("alert")
          .waitFor({ timeout: 15_000 })
          .then(() => "alert"),
      ]);
      if (res === "alert") {
        const msg = await admin.getByRole("alert").innerText();
        if (/financial year|already exists/.test(msg)) {
          console.log(`(skipped: ${msg}) `);
          await admin.keyboard.press("Escape");
          return;
        }
        throw new Error(msg);
      }
      await openDocFromToast(admin);
      const payNo = await openDocNo(admin);
      await admin.getByRole("button", { name: "Submit for approval" }).click();
      await expectToast(admin, /Sent for approval/);
      await admin.keyboard.press("Escape");
      await approveFromInbox(checker, new RegExp(payNo));
    });

    await step("trial balance balanced and audit chain intact", async () => {
      await admin.goto(`${BASE}/reports?r=tb`);
      await admin.getByText(/Closing debits/).waitFor({ timeout: 15_000 });
      const tb = await admin.getByText(/Closing debits/).innerText();
      if (/NOT balanced/.test(tb)) throw new Error(tb);
      await admin.goto(`${BASE}/settings/audit-log`);
      await admin.getByRole("button", { name: "Verify audit trail" }).click();
      await expectToast(admin, /Audit trail intact/);
    });

    console.log(`\nFLOW2 OK. Browser errors: ${errors.length ? errors.join(" | ") : "none"}`);
  } catch (e) {
    await shot(admin, "flow2-failure-admin").catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(
    "\nFLOW2 FAILED:",
    e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n") : e,
  );
  process.exitCode = 1;
});
