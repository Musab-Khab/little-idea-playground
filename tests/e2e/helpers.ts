/** Shared browser-test helpers. */
import type { Page } from "playwright-core";

export async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log("ok");
}

/** Waits for a toast and fails on error toasts. */
export async function expectToast(page: Page, text: RegExp) {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: text }).first();
  try {
    await toast.waitFor({ timeout: 15_000 });
  } catch {
    const all = await page.locator("[data-sonner-toast]").allInnerTexts();
    const alert = await page.getByRole("alert").allInnerTexts();
    throw new Error(
      `Expected toast ${text}; saw toasts=${JSON.stringify(all)} alerts=${JSON.stringify(alert)}`,
    );
  }
}

export async function pickSelect(page: Page, label: string, option: string) {
  await page.getByRole("dialog").getByLabel(label, { exact: false }).first().click();
  await page.getByRole("option", { name: option, exact: false }).first().click();
}

export async function pickSearch(page: Page, trigger: ReturnType<Page["locator"]>, text: string) {
  await trigger.click();
  const input = page.getByPlaceholder("Type to search…").last();
  await input.fill(text);
  await page
    .getByRole("option", { name: new RegExp(text) })
    .first()
    .click();
  await input.waitFor({ state: "detached", timeout: 5_000 });
}

export async function openDocFromToast(page: Page) {
  // Saving a document opens its detail view automatically.
  await page
    .getByRole("dialog")
    .getByText(/^[A-Z][A-Za-z /]+ [A-Z]+-\d{4}-\d{4}/)
    .first()
    .waitFor({ timeout: 15_000 });
}

/** Second-user approval through the topbar inbox. */
export async function approveFromInbox(page: Page, docNo: RegExp) {
  await page.reload();
  await page.getByLabel("Documents awaiting your approval").click();
  await page.getByRole("button", { name: docNo }).first().click();
  await page.getByRole("button", { name: "Approve & post" }).click();
  await expectToast(page, /Approved and posted/);
  await page.keyboard.press("Escape");
}

/** Reads the document number from the open document dialog's heading. */
export async function openDocNo(page: Page) {
  const title = await page.getByRole("dialog").getByRole("heading").first().innerText();
  return /[A-Z]+-\d{4}-\d{4}/.exec(title)?.[0] ?? "";
}
