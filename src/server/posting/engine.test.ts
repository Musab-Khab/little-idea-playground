// @vitest-environment node
/**
 * Integration tests for the posting engine against the real Postgres test database
 * (TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL, created by `npm run db:setup`).
 * The test database is wiped and re-migrated at the start of the run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";

if (existsSync(".env")) process.loadEnvFile(".env");
const TEST_URL = process.env.TEST_DATABASE_URL;
const TEST_OWNER_URL = process.env.TEST_DATABASE_OWNER_URL;
if (TEST_URL) process.env.DATABASE_URL = TEST_URL;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-1234";

const { getDb, closeDb } = await import("../db/client");
const t = await import("../db/schema");
const { seedBaseData, fyFor } = await import("../db/baseData");
const engine = await import("./engine");
const { PERMISSION_KEYS } = await import("@/shared/permissions");
const { todayISO, payStatus } = await import("@/shared/documents");
type SessionUser = import("../security/session").SessionUser;

const today = todayISO();
const user = (name: string, perms = PERMISSION_KEYS): SessionUser => ({
  id: randomUUID(),
  name,
  email: `${name}@test`,
  roleId: "admin",
  totpEnabled: true,
  mustChangePassword: false,
  permissions: new Set(perms),
  mfaRequired: false,
  sessionId: "s",
  mfaVerified: true,
});
const maker = user("maker");
const checker = user("checker");

let customerId = "",
  supplierId = "",
  bookId = "",
  bankId = "",
  staffId = "";

async function resetDatabase() {
  const owner = postgres(TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
  await owner.unsafe(`drop schema if exists public cascade; drop schema if exists drizzle cascade;
    create schema public; revoke all on schema public from public; grant usage on schema public to mfahh_app;`);
  await migrate(drizzle(owner), { migrationsFolder: "./migrations" });
  await owner`select apply_app_privileges()`;
  await owner.end();
}

async function newDoc(input: Parameters<typeof engine.createDocument>[1], approve = true) {
  const res = await engine.createDocument(maker, input);
  if (approve) await engine.approveDocument(checker, res.id);
  return res;
}

const db = () => getDb();
const product = async () =>
  (await db().select().from(t.products).where(eq(t.products.id, bookId)))[0]!;
const doc = async (id: string) =>
  (await db().select().from(t.documents).where(eq(t.documents.id, id)))[0]!;
async function trialBalance() {
  const [r] = await db().execute<{ dr: string; cr: string }>(
    sql`select coalesce(sum(debit),0) dr, coalesce(sum(credit),0) cr from gl_entries`,
  );
  return { dr: Number(r!.dr), cr: Number(r!.cr) };
}
async function balance(key: string, partyId?: string) {
  const [r] = await db().execute<{
    b: string;
  }>(sql`select coalesce(sum(g.debit - g.credit),0) b from gl_entries g join accounts a on a.id = g.account_id
    where a.system_key = ${key} ${partyId ? sql`and g.party_id = ${partyId}` : sql``}`);
  return Number(r!.b);
}

const run = TEST_URL && TEST_OWNER_URL ? describe : describe.skip;

run("posting engine", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seedBaseData(db(), today);
    const [c] = await db()
      .insert(t.customers)
      .values({
        code: "C1",
        name: "Al-Falah Bookstore",
        category: "Bookshop",
        creditDays: 30,
        creditLimit: 0,
      })
      .returning();
    const [s] = await db()
      .insert(t.suppliers)
      .values({ code: "S1", name: "Star Offset Printers", category: "Printer", creditDays: 30 })
      .returning();
    const [b] = await db()
      .insert(t.products)
      .values({ code: "ENG-1", name: "English Grammar 1", costPrice: 50, salePrice: 100 })
      .returning();
    const [group] = await db()
      .select()
      .from(t.accounts)
      .where(eq(t.accounts.systemKey, "BANK_GROUP"));
    const [acc] = await db()
      .insert(t.accounts)
      .values({ code: "1201", name: "Meezan Bank", type: "Asset", parentId: group!.id })
      .returning();
    const [bank] = await db()
      .insert(t.bankAccounts)
      .values({ name: "Meezan Bank", accountNo: "0101", accountId: acc!.id })
      .returning();
    const [st] = await db()
      .insert(t.staff)
      .values({ empId: "E1", name: "Faisal", basic: 50000, allowances: 5000 })
      .returning();
    customerId = c!.id;
    supplierId = s!.id;
    bookId = b!.id;
    bankId = bank!.id;
    staffId = st!.id;
  });
  afterAll(closeDb);

  it("posts opening stock and balances with weighted average cost", async () => {
    await newDoc({
      type: "OB",
      date: today,
      lines: [
        { productId: bookId, qty: 100, rate: 50 },
        { partyType: "customer", partyId: customerId, debit: 10000 },
        {
          accountId: (
            await db().select().from(t.accounts).where(eq(t.accounts.systemKey, "CASH"))
          )[0]!.id,
          debit: 25000,
        },
      ],
    });
    const p = await product();
    expect(p.stockQty).toBe(100);
    expect(p.avgCost).toBe(50);
    expect(await balance("AR", customerId)).toBe(10000);
    expect(await balance("INVENTORY")).toBe(5000);
    expect(await balance("OPENING")).toBe(-40000);
  });

  it("purchase of books raises stock and re-weights the average cost", async () => {
    const pi = await newDoc({
      type: "PI",
      date: today,
      partyId: supplierId,
      kind: "Books",
      lines: [{ productId: bookId, qty: 50, rate: 80 }],
    });
    const p = await product();
    expect(p.stockQty).toBe(150);
    expect(p.avgCost).toBe(60);
    expect((await doc(pi.id)).total).toBe(4000);
    expect(await balance("AP", supplierId)).toBe(-4000);
  });

  let invoiceId = "";
  it("sales invoice posts revenue, tax, receivable and cost of sales at average cost", async () => {
    const si = await engine.createDocument(maker, {
      type: "SI",
      date: today,
      partyId: customerId,
      taxPct: 0,
      discount: 0,
      lines: [{ productId: bookId, qty: 30, rate: 100, discountPct: 10 }],
    });
    invoiceId = si.id;
    await expect(engine.approveDocument(maker, si.id)).rejects.toThrow(/another authorised user/);
    await engine.approveDocument(checker, si.id);
    const d = await doc(si.id);
    expect(d.total).toBe(2700);
    expect(d.docNo).toMatch(/^INV-\d{4}-0001$/);
    expect((await product()).stockQty).toBe(120);
    expect(await balance("COGS")).toBe(1800);
    expect(await balance("SALES")).toBe(-2700);
    expect(await balance("AR", customerId)).toBe(12700);
  });

  it("blocks selling more than available stock", async () => {
    const si = await engine.createDocument(maker, {
      type: "SI",
      date: today,
      partyId: customerId,
      lines: [{ productId: bookId, qty: 5000, rate: 100 }],
    });
    const noNegative = user(
      "strict",
      PERMISSION_KEYS.filter((p) => p !== "stock.negative_allow"),
    );
    await expect(engine.approveDocument(noNegative, si.id)).rejects.toThrow(/Not enough stock/);
    expect((await doc(si.id)).status).toBe("Draft");
    expect((await product()).stockQty).toBe(120);
    await engine.cancelDocument(maker, si.id, "entered by mistake");
  });

  let receiptId = "",
    returnId = "";
  it("receipt allocation and sales return update the invoice status", async () => {
    receiptId = (
      await newDoc({
        type: "RV",
        date: today,
        partyId: customerId,
        amount: 2000,
        method: "Bank",
        bankAccountId: bankId,
        allocations: [{ invoiceId, amount: 2000 }],
      })
    ).id;
    let d = await doc(invoiceId);
    expect(d.paidAmount).toBe(2000);
    expect(payStatus({ ...d, dueDate: d.dueDate }, today)).toBe("Partially Paid");

    const invLine = (
      await db().select().from(t.documentLines).where(eq(t.documentLines.documentId, invoiceId))
    )[0]!;
    returnId = (
      await newDoc({
        type: "SR",
        date: today,
        partyId: customerId,
        refDocId: invoiceId,
        extra: { reason: "damaged in transit" },
        lines: [{ refLineId: invLine.id, qty: 5 }],
      })
    ).id;
    expect((await doc(returnId)).total).toBe(450);
    d = await doc(invoiceId);
    expect(d.creditedAmount).toBe(450);
    expect((await product()).stockQty).toBe(125);
    expect(await balance("AR", customerId)).toBe(10250);
  });

  it("refuses to cancel an invoice while returns or receipts depend on it, then reverses everything", async () => {
    await expect(engine.cancelDocument(checker, invoiceId, "wrong customer")).rejects.toThrow(
      /Cancel these first/,
    );
    await engine.cancelDocument(checker, returnId, "reverse test");
    await expect(engine.cancelDocument(checker, invoiceId, "wrong customer")).rejects.toThrow(
      /Payments are allocated/,
    );
    await engine.cancelDocument(checker, receiptId, "reverse test");
    await engine.cancelDocument(checker, invoiceId, "wrong customer");
    const p = await product();
    expect(p.stockQty).toBe(150);
    expect(p.avgCost).toBe(60);
    expect(await balance("AR", customerId)).toBe(10000);
    expect(await balance("COGS")).toBe(0);
    expect((await doc(invoiceId)).status).toBe("Cancelled");
  });

  it("samples reduce stock at cost without a sale, and returns restore it", async () => {
    const smp = await engine.createDocument(maker, {
      type: "SMP",
      date: today,
      partyId: customerId,
      extra: { issuedTo: "Principal", purpose: "Adoption", expectedReturn: today },
      lines: [{ productId: bookId, qty: 10 }],
    });
    expect((await doc(smp.id)).status).toBe("Approved");
    expect((await product()).stockQty).toBe(140);
    expect(await balance("SAMPLE_EXP")).toBe(600);
    expect(await balance("SALES")).toBe(0);
    const line = (
      await db().select().from(t.documentLines).where(eq(t.documentLines.documentId, smp.id))
    )[0]!;
    await engine.createDocument(maker, {
      type: "SMR",
      date: today,
      partyId: customerId,
      refDocId: smp.id,
      lines: [{ refLineId: line.id, qty: 4 }],
    });
    expect((await product()).stockQty).toBe(144);
    expect(await balance("SAMPLE_EXP")).toBe(360);
  });

  it("payroll recovers staff advances and salary payment clears the payable", async () => {
    await newDoc({
      type: "LOAN",
      date: today,
      partyId: staffId,
      amount: 10000,
      method: "Cash",
      extra: { loanType: "Advance", installment: 2000 },
    });
    const month = today.slice(0, 7);
    const pay = await newDoc({
      type: "PAYROLL",
      date: today,
      extra: { month },
      lines: [
        {
          partyType: "staff",
          partyId: staffId,
          extra: { basic: 50000, allowances: 5000, deductions: 1000, recovery: 2000 },
        },
      ],
    });
    expect((await doc(pay.id)).total).toBe(52000);
    expect(await balance("STAFF_ADV", staffId)).toBe(8000);
    expect(await balance("SALARY_PAYABLE", staffId)).toBe(-52000);
    await expect(
      engine.createDocument(maker, {
        type: "PAYROLL",
        date: today,
        extra: { month },
        lines: [{ partyType: "staff", partyId: staffId, extra: { basic: 1 } }],
      }),
    ).rejects.toThrow(/already exists/);
    await newDoc({
      type: "SALPAY",
      date: today,
      refDocId: pay.id,
      method: "Bank",
      bankAccountId: bankId,
      lines: [{ partyId: staffId, rate: 52000 }],
    });
    expect(await balance("SALARY_PAYABLE", staffId)).toBe(0);
  });

  it("issues unique sequential numbers under concurrent saves", async () => {
    const [head] = await db().select().from(t.expenseHeads).limit(1);
    const ok = await Promise.all(
      Array.from({ length: 8 }, () =>
        engine.createDocument(maker, {
          type: "EXP",
          date: today,
          amount: 100,
          method: "Cash",
          expenseHeadId: head!.id,
          narration: "tea",
        }),
      ),
    );
    expect(new Set(ok.map((r) => r.docNo)).size).toBe(8);
  });

  it("keeps the books balanced and the audit chain intact", async () => {
    const tb = await trialBalance();
    expect(tb.dr).toBeCloseTo(tb.cr, 2);
    const [v] = await db().execute<{ broken: string | null }>(sql`select audit_verify() as broken`);
    expect(v!.broken).toBeNull();
  });

  it("the app database role cannot tamper with ledgers, audit log or documents", async () => {
    /** Drizzle wraps driver errors; the Postgres message is on `cause`. */
    const dbError = async (q: Promise<unknown>) => {
      try {
        await q;
      } catch (e) {
        return String(
          (e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message,
        );
      }
      return "no error";
    };
    expect(await dbError(db().execute(sql`update gl_entries set debit = debit + 1`))).toMatch(
      /permission denied/,
    );
    expect(await dbError(db().execute(sql`delete from audit_log`))).toMatch(/permission denied/);
    expect(await dbError(db().execute(sql`delete from documents`))).toMatch(/permission denied/);
    expect(
      await dbError(db().execute(sql`update documents set total = 1 where status = 'Approved'`)),
    ).toMatch(/cannot be edited/);
    expect(
      await dbError(
        db().execute(
          sql`insert into gl_entries (document_id, date, fy_id, account_id, debit) select id, date, fy_id, (select id from accounts where system_key='CASH'), 5 from documents limit 1`,
        ),
      ),
    ).toMatch(/Unbalanced/);
    expect(await dbError(db().execute(sql`create table hack (id int)`))).toMatch(
      /permission denied/,
    );
  });

  it("rejects postings into a closed financial year", async () => {
    const fy = fyFor(today);
    const owner = postgres(TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
    await owner`update financial_years set status = 'Closed' where label = ${fy.label}`;
    await expect(
      engine.createDocument(maker, {
        type: "EXP",
        date: today,
        amount: 5,
        method: "Cash",
        narration: "x",
      }),
    ).rejects.toThrow(/closed/);
    await owner`update financial_years set status = 'Open' where label = ${fy.label}`;
    await owner.end();
  });

  it("enforces role permissions on the server, not just in the UI", async () => {
    const { DEFAULT_ROLES } = await import("@/shared/permissions");
    const role = (id: string) => user(id, DEFAULT_ROLES.find((r) => r.id === id)!.permissions);
    const sales = role("sales"),
      store = role("store"),
      hr = role("hr"),
      accountant = role("accountant");

    // Sales staff can raise an invoice but not approve or cancel postings.
    const si = await engine.createDocument(sales, {
      type: "SI",
      date: today,
      partyId: customerId,
      lines: [{ productId: bookId, qty: 1, rate: 100 }],
    });
    await expect(engine.approveDocument(sales, si.id)).rejects.toThrow(/permission/);
    await engine.approveDocument(accountant, si.id);
    await expect(engine.cancelDocument(sales, si.id, "not allowed")).rejects.toThrow(/permission/);

    // Store keepers cannot touch money; HR cannot post sales; accountants cannot run payroll.
    await expect(
      engine.createDocument(store, {
        type: "EXP",
        date: today,
        amount: 10,
        method: "Cash",
        narration: "x",
      }),
    ).rejects.toThrow(/permission/);
    await expect(
      engine.createDocument(hr, {
        type: "SI",
        date: today,
        partyId: customerId,
        lines: [{ productId: bookId, qty: 1 }],
      }),
    ).rejects.toThrow(/permission/);
    await expect(
      engine.createDocument(accountant, {
        type: "PAYROLL",
        date: today,
        extra: { month: "2001-01" },
        lines: [],
      }),
    ).rejects.toThrow(/permission/);

    // Salary documents stay hidden from report viewers without HR rights.
    const viewer = user("viewer", ["reports.view"]);
    expect(engine.visibleTypes(viewer)).toContain("SI");
    expect(engine.visibleTypes(viewer)).not.toContain("PAYROLL");
    expect(engine.visibleTypes(viewer)).not.toContain("LOAN");
  });
});
