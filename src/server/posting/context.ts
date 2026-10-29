import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as t from "../db/schema";
import type { SessionUser } from "../security/session";
import { round2, type PartyType } from "@/shared/documents";

/** Business-rule violation; its message is shown to the user as-is. */
export class PostingError extends Error {}
export const fail = (message: string): never => {
  throw new PostingError(message);
};

export type SystemAccount =
  | "CASH"
  | "BANK_GROUP"
  | "AR"
  | "INVENTORY"
  | "STAFF_ADV"
  | "TAX_INPUT"
  | "AP"
  | "TAX_OUTPUT"
  | "SALARY_PAYABLE"
  | "PAYROLL_DEDUCTIONS"
  | "CAPITAL"
  | "RETAINED"
  | "OPENING"
  | "SALES"
  | "SALES_RETURNS"
  | "COGS"
  | "MATERIALS"
  | "SALARY_EXP"
  | "SAMPLE_EXP"
  | "STOCK_ADJ"
  | "STOCK_LOSS";

export type Doc = typeof t.documents.$inferSelect;
export type Line = typeof t.documentLines.$inferSelect;
export type Product = typeof t.products.$inferSelect;

export interface GlLine {
  accountId: string;
  debit: number;
  credit: number;
  partyType?: PartyType | null;
  partyId?: string | null;
  narration?: string;
}

export class PostingContext {
  private accountCache = new Map<string, string>();
  private products = new Map<string, Product>();
  readonly gl: GlLine[] = [];

  constructor(
    readonly tx: Tx,
    readonly user: SessionUser,
  ) {}

  get canGoNegative() {
    return this.user.permissions.has("stock.negative_allow");
  }

  async account(key: SystemAccount): Promise<string> {
    const cached = this.accountCache.get(key);
    if (cached) return cached;
    const [row] = await this.tx
      .select({ id: t.accounts.id })
      .from(t.accounts)
      .where(eq(t.accounts.systemKey, key));
    if (!row) return fail(`System account ${key} is missing from the chart of accounts.`);
    this.accountCache.set(key, row.id);
    return row.id;
  }

  dr(
    accountId: string,
    amount: number,
    party?: { type: PartyType; id: string } | null,
    narration = "",
  ) {
    this.push(accountId, round2(amount), 0, party, narration);
  }

  cr(
    accountId: string,
    amount: number,
    party?: { type: PartyType; id: string } | null,
    narration = "",
  ) {
    this.push(accountId, 0, round2(amount), party, narration);
  }

  private push(
    accountId: string,
    debit: number,
    credit: number,
    party: { type: PartyType; id: string } | null | undefined,
    narration: string,
  ) {
    // Negative amounts flip side; zero lines are dropped.
    if (debit < 0) [debit, credit] = [0, -debit];
    if (credit < 0) [debit, credit] = [-credit, 0];
    if (debit === 0 && credit === 0) return;
    this.gl.push({
      accountId,
      debit,
      credit,
      partyType: party?.type ?? null,
      partyId: party?.id ?? null,
      narration,
    });
  }

  /** Writes the accumulated journal for a document after checking it balances. */
  async flushGl(doc: Doc, isReversal = false) {
    const dr = round2(this.gl.reduce((s, g) => s + g.debit, 0));
    const cr = round2(this.gl.reduce((s, g) => s + g.credit, 0));
    if (dr !== cr)
      fail(`Internal error: journal for ${doc.docNo} does not balance (${dr} vs ${cr}).`);
    if (this.gl.length) {
      await this.tx.insert(t.glEntries).values(
        this.gl.map((g) => ({
          documentId: doc.id,
          date: doc.date,
          fyId: doc.fyId,
          accountId: g.accountId,
          debit: g.debit,
          credit: g.credit,
          partyType: g.partyType ?? null,
          partyId: g.partyId ?? null,
          narration: g.narration || doc.narration,
          isReversal,
        })),
      );
    }
    this.gl.length = 0;
  }

  /** Locks product rows in id order (prevents deadlocks between concurrent postings). */
  async lockProducts(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))]
      .filter((id) => !this.products.has(id))
      .sort();
    if (!wanted.length) return;
    const rows = await this.tx
      .select()
      .from(t.products)
      .where(inArray(t.products.id, wanted))
      .orderBy(asc(t.products.id))
      .for("update");
    for (const r of rows) this.products.set(r.id, r);
    for (const id of wanted)
      if (!this.products.has(id)) fail("A product on this document no longer exists.");
  }

  product(id: string): Product {
    return this.products.get(id) ?? fail("Product not locked.");
  }

  /**
   * Moves stock and records it in the stock ledger. Positive qty = in, negative = out.
   * `value` (total cost of the movement) is optional; outbound default is the current weighted average.
   * Returns the value moved (always positive).
   */
  async moveStock(
    doc: Doc,
    productId: string,
    qty: number,
    value: number | null,
    isReversal = false,
  ): Promise<number> {
    if (!Number.isInteger(qty) || qty === 0)
      fail("Stock quantity must be a non-zero whole number.");
    const p = this.product(productId);
    const onHand = p.stockQty;
    const avg = p.avgCost;
    let newQty: number, newAvg: number, moved: number;
    if (qty > 0) {
      moved = round2(value ?? qty * avg);
      newQty = onHand + qty;
      newAvg = onHand <= 0 || newQty <= 0 ? moved / qty : (onHand * avg + moved) / newQty;
    } else {
      const out = -qty;
      if (onHand - out < 0 && !this.canGoNegative) {
        fail(`Not enough stock for ${p.name}: available ${onHand}, required ${out}.`);
      }
      moved = round2(value ?? out * avg);
      newQty = onHand - out;
      newAvg =
        value === null ? avg : newQty > 0 ? Math.max(0, (onHand * avg - moved) / newQty) : avg;
    }
    newAvg = Math.round(newAvg * 10000) / 10000;
    await this.tx
      .update(t.products)
      .set({ stockQty: newQty, avgCost: newAvg })
      .where(eq(t.products.id, productId));
    this.products.set(productId, { ...p, stockQty: newQty, avgCost: newAvg });
    await this.tx.insert(t.stockLedger).values({
      documentId: doc.id,
      date: doc.date,
      productId,
      qtyIn: qty > 0 ? qty : 0,
      qtyOut: qty < 0 ? -qty : 0,
      unitCost: Math.round((moved / Math.abs(qty)) * 10000) / 10000,
      value: moved,
      balanceQty: newQty,
      isReversal,
    });
    return moved;
  }
}

export async function fyForDate(tx: Tx, date: string, mustBeOpen = true) {
  const [fy] = await tx
    .select()
    .from(t.financialYears)
    .where(and(lte(t.financialYears.startDate, date), gte(t.financialYears.endDate, date)));
  if (!fy)
    return fail(`No financial year covers ${date}. Create it under Settings → Financial Years.`);
  if (mustBeOpen && fy.status === "Closed")
    fail(`Financial year ${fy.label} is closed; ${date} cannot be posted to.`);
  return fy;
}

/** Concurrency-safe per-year counter: INV-2526-0001. */
export async function nextDocNo(tx: Tx, prefix: string, fy: { id: string; label: string }) {
  const rows = await tx.execute<{ n: number }>(sql`
    insert into number_series (prefix, fy_id, next) values (${prefix}, ${fy.id}, 2)
    on conflict (prefix, fy_id) do update set next = number_series.next + 1
    returning next - 1 as n`);
  const n = Number(rows[0]?.n ?? 1);
  const m = /^(\d{4})-(\d{2})$/.exec(fy.label);
  const code = m ? `${m[1]!.slice(2)}${m[2]}` : fy.label.replace(/\W/g, "");
  return `${prefix}-${code}-${String(n).padStart(4, "0")}`;
}

/** Balance (debit − credit) of an account, optionally for one party. */
export async function accountBalance(
  tx: Tx,
  accountId: string,
  party?: { type: PartyType; id: string },
) {
  const rows = await tx.execute<{ bal: string | null }>(sql`
    select coalesce(sum(debit - credit), 0) as bal from gl_entries
    where account_id = ${accountId}
    ${party ? sql`and party_type = ${party.type} and party_id = ${party.id}` : sql``}`);
  return round2(Number(rows[0]?.bal ?? 0));
}
