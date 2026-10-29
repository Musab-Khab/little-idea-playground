/**
 * Accounting rules: what each document type posts when approved, and how it is reversed when cancelled.
 * All work happens inside the caller's transaction with the document row locked.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import * as t from "../db/schema";
import { checkAllocations, salaryPayable, staffAdvances } from "./prepare";
import { fail, type Doc, type Line, type PostingContext } from "./context";
import { allocate, round2, type PartyType } from "@/shared/documents";

const partyOf = (doc: Doc) =>
  doc.partyType && doc.partyId ? { type: doc.partyType as PartyType, id: doc.partyId } : null;

async function lockDoc(ctx: PostingContext, id: string) {
  const [d] = await ctx.tx.select().from(t.documents).where(eq(t.documents.id, id)).for("update");
  return d ?? fail("Referenced document not found.");
}

async function linesOf(ctx: PostingContext, docId: string) {
  return ctx.tx
    .select()
    .from(t.documentLines)
    .where(eq(t.documentLines.documentId, docId))
    .orderBy(t.documentLines.lineNo);
}

async function cashOrBank(ctx: PostingContext, doc: Doc) {
  if (doc.method === "Cash") return ctx.account("CASH");
  const [bank] = await ctx.tx
    .select()
    .from(t.bankAccounts)
    .where(eq(t.bankAccounts.id, doc.bankAccountId ?? ""));
  return bank?.accountId ?? fail("Bank account not found.");
}

async function addDone(ctx: PostingContext, lineId: string, delta: number) {
  await ctx.tx
    .update(t.documentLines)
    .set({ doneQty: sql`${t.documentLines.doneQty} + ${delta}` })
    .where(eq(t.documentLines.id, lineId));
}

async function stampCost(ctx: PostingContext, lineId: string, unitCost: number) {
  await ctx.tx
    .update(t.documentLines)
    .set({ unitCost: Math.round(unitCost * 10000) / 10000 })
    .where(eq(t.documentLines.id, lineId));
}

/* ------------------------------------------------------------------ post */

export async function post(ctx: PostingContext, doc: Doc, lines: Line[]) {
  const party = partyOf(doc);
  const taxable = round2(doc.subtotal - doc.discount);
  await ctx.lockProducts(lines.map((l) => l.productId));

  switch (doc.type) {
    case "SO":
      break; // orders reserve nothing; invoices deliver against them

    case "SI": {
      if (doc.refDocId) {
        await lockDoc(ctx, doc.refDocId);
        const soLines = new Map((await linesOf(ctx, doc.refDocId)).map((l) => [l.id, l]));
        for (const l of lines.filter((x) => x.refLineId)) {
          const so = soLines.get(l.refLineId!) ?? fail("Order line not found.");
          if (so.doneQty + l.qty > so.qty) fail(`Order quantity exceeded for line ${l.lineNo}.`);
          await addDone(ctx, so.id, l.qty);
        }
      }
      let cogs = 0;
      for (const l of lines) {
        const value = await ctx.moveStock(doc, l.productId!, -l.qty, null);
        await stampCost(ctx, l.id, value / l.qty);
        cogs += value;
      }
      ctx.dr(await ctx.account("AR"), doc.total, party);
      ctx.cr(await ctx.account("SALES"), taxable);
      ctx.cr(await ctx.account("TAX_OUTPUT"), doc.taxAmount);
      ctx.dr(await ctx.account("COGS"), cogs);
      ctx.cr(await ctx.account("INVENTORY"), cogs);
      break;
    }

    case "SR": {
      const inv = await lockDoc(ctx, doc.refDocId!);
      if (inv.status !== "Approved") fail(`${inv.docNo} is no longer approved.`);
      const invLines = new Map((await linesOf(ctx, inv.id)).map((l) => [l.id, l]));
      let cost = 0;
      for (const l of lines) {
        const o = invLines.get(l.refLineId!) ?? fail("Invoice line not found.");
        if (o.doneQty + l.qty > o.qty) fail(`Line ${l.lineNo}: more than sold is being returned.`);
        await addDone(ctx, o.id, l.qty);
        const value = await ctx.moveStock(
          doc,
          l.productId!,
          l.qty,
          round2(l.qty * (o.unitCost ?? 0)),
        );
        await stampCost(ctx, l.id, o.unitCost ?? 0);
        cost += value;
      }
      await ctx.tx
        .update(t.documents)
        .set({ creditedAmount: round2(inv.creditedAmount + doc.total) })
        .where(eq(t.documents.id, inv.id));
      ctx.dr(await ctx.account("SALES_RETURNS"), taxable);
      ctx.dr(await ctx.account("TAX_OUTPUT"), doc.taxAmount);
      ctx.cr(await ctx.account("AR"), doc.total, party);
      ctx.dr(await ctx.account("INVENTORY"), cost);
      ctx.cr(await ctx.account("COGS"), cost);
      break;
    }

    case "RV":
    case "PV": {
      const allocs = await ctx.tx
        .select()
        .from(t.allocations)
        .where(eq(t.allocations.paymentId, doc.id));
      await checkAllocations(ctx.tx, doc.type === "RV" ? "SI" : "PI", doc.partyId!, allocs);
      for (const a of allocs.sort((x, y) => x.invoiceId.localeCompare(y.invoiceId))) {
        const inv = await lockDoc(ctx, a.invoiceId);
        await ctx.tx
          .update(t.documents)
          .set({ paidAmount: round2(inv.paidAmount + a.amount) })
          .where(eq(t.documents.id, inv.id));
      }
      const money = await cashOrBank(ctx, doc);
      if (doc.type === "RV") {
        ctx.dr(money, doc.total);
        ctx.cr(await ctx.account("AR"), doc.total, party);
      } else {
        ctx.dr(await ctx.account("AP"), doc.total, party);
        ctx.cr(money, doc.total);
      }
      break;
    }

    case "PI": {
      const shares = allocate(
        taxable,
        lines.map((l) => l.amount),
      );
      for (const [i, l] of lines.entries()) {
        const share = shares[i] ?? 0;
        if (doc.kind === "Books") {
          await ctx.moveStock(doc, l.productId!, l.qty, share);
          await stampCost(ctx, l.id, share / l.qty);
        } else {
          ctx.dr(l.accountId!, share, null, l.description);
        }
      }
      if (doc.kind === "Books") ctx.dr(await ctx.account("INVENTORY"), taxable);
      ctx.dr(await ctx.account("TAX_INPUT"), doc.taxAmount);
      ctx.cr(await ctx.account("AP"), doc.total, party);
      break;
    }

    case "PR": {
      const inv = await lockDoc(ctx, doc.refDocId!);
      if (inv.status !== "Approved") fail(`${inv.docNo} is no longer approved.`);
      const invLines = new Map((await linesOf(ctx, inv.id)).map((l) => [l.id, l]));
      const shares = allocate(
        taxable,
        lines.map((l) => l.amount),
      );
      for (const [i, l] of lines.entries()) {
        const o = invLines.get(l.refLineId!) ?? fail("Invoice line not found.");
        if (o.doneQty + l.qty > o.qty)
          fail(`Line ${l.lineNo}: more than purchased is being returned.`);
        await addDone(ctx, o.id, l.qty);
        const share = shares[i] ?? 0;
        if (inv.kind === "Books") {
          await ctx.moveStock(doc, l.productId!, -l.qty, share);
          await stampCost(ctx, l.id, share / l.qty);
        } else {
          ctx.cr(l.accountId!, share, null, l.description);
        }
      }
      await ctx.tx
        .update(t.documents)
        .set({ creditedAmount: round2(inv.creditedAmount + doc.total) })
        .where(eq(t.documents.id, inv.id));
      ctx.dr(await ctx.account("AP"), doc.total, party);
      if (inv.kind === "Books") ctx.cr(await ctx.account("INVENTORY"), taxable);
      ctx.cr(await ctx.account("TAX_INPUT"), doc.taxAmount);
      break;
    }

    case "EXP": {
      const [head] = await ctx.tx
        .select()
        .from(t.expenseHeads)
        .where(eq(t.expenseHeads.id, doc.expenseHeadId ?? ""));
      if (!head) fail("Expense head not found.");
      ctx.dr(head!.accountId, doc.total);
      ctx.cr(await cashOrBank(ctx, doc), doc.total);
      break;
    }

    case "JV":
      for (const l of lines) {
        const p =
          l.partyType && l.partyId ? { type: l.partyType as PartyType, id: l.partyId } : null;
        ctx.dr(l.accountId!, l.debit, p, l.description);
        ctx.cr(l.accountId!, l.credit, p, l.description);
      }
      break;

    case "SMP": {
      let value = 0;
      for (const l of lines) {
        const v = await ctx.moveStock(doc, l.productId!, -l.qty, null);
        await stampCost(ctx, l.id, v / l.qty);
        value += v;
      }
      await ctx.tx
        .update(t.documents)
        .set({ total: round2(value) })
        .where(eq(t.documents.id, doc.id));
      ctx.dr(await ctx.account("SAMPLE_EXP"), value, null, "Samples issued (at cost)");
      ctx.cr(await ctx.account("INVENTORY"), value);
      break;
    }

    case "SMR": {
      const smp = await lockDoc(ctx, doc.refDocId!);
      if (smp.status !== "Approved") fail(`${smp.docNo} is not an active sample issue.`);
      const issued = new Map((await linesOf(ctx, smp.id)).map((l) => [l.id, l]));
      let value = 0;
      for (const l of lines) {
        const o = issued.get(l.refLineId!) ?? fail("Sample line not found.");
        if (o.doneQty + l.qty > o.qty)
          fail(`Line ${l.lineNo}: more than issued is being returned.`);
        await addDone(ctx, o.id, l.qty);
        value += await ctx.moveStock(doc, l.productId!, l.qty, round2(l.qty * (o.unitCost ?? 0)));
        await stampCost(ctx, l.id, o.unitCost ?? 0);
      }
      ctx.dr(await ctx.account("INVENTORY"), value);
      ctx.cr(await ctx.account("SAMPLE_EXP"), value, null, "Samples returned");
      break;
    }

    case "ADJ": {
      const inv = await ctx.account("INVENTORY"),
        adj = await ctx.account("STOCK_ADJ");
      for (const l of lines) {
        const value = await ctx.moveStock(
          doc,
          l.productId!,
          l.qty,
          l.qty > 0 ? round2(l.qty * l.rate) : null,
        );
        await stampCost(ctx, l.id, value / Math.abs(l.qty));
        if (l.qty > 0) {
          ctx.dr(inv, value);
          ctx.cr(adj, value);
        } else {
          ctx.dr(adj, value);
          ctx.cr(inv, value);
        }
      }
      break;
    }

    case "DMG": {
      let value = 0;
      for (const l of lines) {
        const v = await ctx.moveStock(doc, l.productId!, -l.qty, null);
        await stampCost(ctx, l.id, v / l.qty);
        await ctx.tx
          .update(t.products)
          .set({ damagedQty: sql`${t.products.damagedQty} + ${l.qty}` })
          .where(eq(t.products.id, l.productId!));
        value += v;
      }
      ctx.dr(
        await ctx.account("STOCK_LOSS"),
        value,
        null,
        `Stock ${String(doc.extra["condition"] ?? "damaged").toLowerCase()}`,
      );
      ctx.cr(await ctx.account("INVENTORY"), value);
      break;
    }

    case "OB": {
      const keys = { customer: "AR", supplier: "AP", staff: "STAFF_ADV" } as const;
      for (const l of lines) {
        if (l.productId) {
          const v = await ctx.moveStock(doc, l.productId, l.qty, l.amount);
          await stampCost(ctx, l.id, v / l.qty);
          ctx.dr(await ctx.account("INVENTORY"), v, null, "Opening stock");
        } else if (l.partyType && l.partyId) {
          const acc = await ctx.account(keys[l.partyType as PartyType]);
          const p = { type: l.partyType as PartyType, id: l.partyId };
          ctx.dr(acc, l.debit, p, "Opening balance");
          ctx.cr(acc, l.credit, p, "Opening balance");
        } else {
          ctx.dr(l.accountId!, l.debit, null, "Opening balance");
          ctx.cr(l.accountId!, l.credit, null, "Opening balance");
        }
      }
      const diff = round2(ctx.gl.reduce((s, g) => s + g.debit - g.credit, 0));
      const opening = await ctx.account("OPENING");
      if (diff > 0) ctx.cr(opening, diff);
      else ctx.dr(opening, -diff);
      break;
    }

    case "PAYROLL": {
      const advances = new Map((await staffAdvances(ctx.tx)).map((r) => [r.staffId, r.balance]));
      let gross = 0,
        deductions = 0;
      const payable = await ctx.account("SALARY_PAYABLE"),
        adv = await ctx.account("STAFF_ADV");
      for (const l of lines) {
        const e = l.extra as {
          basic: number;
          allowances: number;
          deductions: number;
          recovery: number;
        };
        const staff = { type: "staff" as const, id: l.partyId! };
        if (e.recovery > (advances.get(l.partyId!) ?? 0))
          fail(`Line ${l.lineNo}: recovery exceeds the outstanding advance.`);
        gross += e.basic + e.allowances;
        deductions += e.deductions;
        ctx.cr(adv, e.recovery, staff, "Advance/loan recovery");
        ctx.cr(payable, l.amount, staff, "Net salary");
      }
      ctx.dr(await ctx.account("SALARY_EXP"), gross);
      ctx.cr(await ctx.account("PAYROLL_DEDUCTIONS"), deductions);
      break;
    }

    case "SALPAY": {
      const due = new Map((await salaryPayable(ctx.tx)).map((r) => [r.staffId, r.balance]));
      const payable = await ctx.account("SALARY_PAYABLE");
      for (const l of lines) {
        if (l.amount > (due.get(l.partyId!) ?? 0))
          fail(`Line ${l.lineNo}: amount exceeds the unpaid salary.`);
        ctx.dr(payable, l.amount, { type: "staff", id: l.partyId! }, "Salary paid");
      }
      ctx.cr(await cashOrBank(ctx, doc), doc.total);
      const payroll = await lockDoc(ctx, doc.refDocId!);
      await ctx.tx
        .update(t.documents)
        .set({ paidAmount: round2(payroll.paidAmount + doc.total) })
        .where(eq(t.documents.id, payroll.id));
      break;
    }

    case "LOAN":
      ctx.dr(
        await ctx.account("STAFF_ADV"),
        doc.total,
        party,
        `${String(doc.extra["loanType"] ?? "Advance")} to staff`,
      );
      ctx.cr(await cashOrBank(ctx, doc), doc.total);
      break;

    case "CLOSE":
      fail("Closing entries are generated by the year-end close.");
  }

  await ctx.flushGl(doc);
}

/* --------------------------------------------------------------- reverse */

/** Refuses cancellation while later documents depend on this one. */
async function assertNoDependents(ctx: PostingContext, doc: Doc) {
  const children = await ctx.tx
    .select({ no: t.documents.docNo, type: t.documents.type })
    .from(t.documents)
    .where(and(eq(t.documents.refDocId, doc.id), ne(t.documents.status, "Cancelled")));
  if (children.length) fail(`Cancel these first: ${children.map((c) => c.no).join(", ")}.`);
  const payments = await ctx.tx
    .select({ no: t.documents.docNo })
    .from(t.allocations)
    .innerJoin(t.documents, eq(t.documents.id, t.allocations.paymentId))
    .where(and(eq(t.allocations.invoiceId, doc.id), ne(t.documents.status, "Cancelled")));
  if (payments.length)
    fail(
      `Payments are allocated to this invoice. Cancel these first: ${payments.map((p) => p.no).join(", ")}.`,
    );
}

export async function reverse(ctx: PostingContext, doc: Doc, lines: Line[]) {
  await assertNoDependents(ctx, doc);

  // 1. Undo links to other documents.
  if (doc.refDocId && ["SI", "SR", "PR", "SMR"].includes(doc.type)) {
    await lockDoc(ctx, doc.refDocId);
    for (const l of lines.filter((x) => x.refLineId)) await addDone(ctx, l.refLineId!, -l.qty);
  }
  if (doc.type === "SR" || doc.type === "PR") {
    const inv = await lockDoc(ctx, doc.refDocId!);
    await ctx.tx
      .update(t.documents)
      .set({ creditedAmount: round2(inv.creditedAmount - doc.total) })
      .where(eq(t.documents.id, inv.id));
  }
  if (doc.type === "RV" || doc.type === "PV") {
    const allocs = await ctx.tx
      .select()
      .from(t.allocations)
      .where(eq(t.allocations.paymentId, doc.id));
    for (const a of allocs.sort((x, y) => x.invoiceId.localeCompare(y.invoiceId))) {
      const inv = await lockDoc(ctx, a.invoiceId);
      await ctx.tx
        .update(t.documents)
        .set({ paidAmount: round2(inv.paidAmount - a.amount) })
        .where(eq(t.documents.id, inv.id));
    }
  }
  if (doc.type === "SALPAY") {
    const payroll = await lockDoc(ctx, doc.refDocId!);
    await ctx.tx
      .update(t.documents)
      .set({ paidAmount: round2(payroll.paidAmount - doc.total) })
      .where(eq(t.documents.id, payroll.id));
  }
  if (doc.type === "DMG") {
    for (const l of lines) {
      await ctx.tx
        .update(t.products)
        .set({ damagedQty: sql`${t.products.damagedQty} - ${l.qty}` })
        .where(eq(t.products.id, l.productId!));
    }
  }

  // 2. Opposite stock movements at the original values.
  const moves = await ctx.tx
    .select()
    .from(t.stockLedger)
    .where(and(eq(t.stockLedger.documentId, doc.id), eq(t.stockLedger.isReversal, false)));
  await ctx.lockProducts(moves.map((m) => m.productId));
  for (const m of moves) {
    await ctx.moveStock(doc, m.productId, m.qtyIn > 0 ? -m.qtyIn : m.qtyOut, m.value, true);
  }

  // 3. Mirror-image journal.
  const entries = await ctx.tx
    .select()
    .from(t.glEntries)
    .where(and(eq(t.glEntries.documentId, doc.id), eq(t.glEntries.isReversal, false)));
  for (const g of entries) {
    ctx.gl.push({
      accountId: g.accountId,
      debit: g.credit,
      credit: g.debit,
      partyType: g.partyType,
      partyId: g.partyId,
      narration: `Reversal: ${g.narration}`,
    });
  }
  await ctx.flushGl(doc, true);
}
