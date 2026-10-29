import { eq } from "drizzle-orm";
import { getDb, type Tx } from "../db/client";
import * as t from "../db/schema";
import { writeAudit } from "../audit";
import { assertPerm, type SessionUser } from "../security/session";
import { fail, fyForDate, nextDocNo, PostingContext, type Doc } from "./context";
import { prepareDocument, type DocInput } from "./prepare";
import { post, reverse } from "./rules";
import { DOC_DEFS, type DocType } from "@/shared/documents";

const actor = (u: SessionUser) => ({ id: u.id, name: u.name });

async function lockDocument(tx: Tx, id: string): Promise<Doc> {
  const [doc] = await tx.select().from(t.documents).where(eq(t.documents.id, id)).for("update");
  return doc ?? fail("Document not found.");
}

async function makerCheckerOn(tx: Tx) {
  const [c] = await tx
    .select({ settings: t.company.settings })
    .from(t.company)
    .where(eq(t.company.id, 1));
  return c?.settings.makerChecker !== false;
}

async function writeLines(
  tx: Tx,
  docId: string,
  prepared: Awaited<ReturnType<typeof prepareDocument>>,
) {
  if (prepared.lines.length) {
    await tx
      .insert(t.documentLines)
      .values(prepared.lines.map((l) => ({ ...l, documentId: docId })));
  }
  if (prepared.allocations.length) {
    await tx
      .insert(t.allocations)
      .values(prepared.allocations.map((a) => ({ ...a, paymentId: docId })));
  }
}

/** Creates a draft (auto-approving types are posted immediately). */
export async function createDocument(user: SessionUser, input: DocInput) {
  const def = DOC_DEFS[input.type];
  assertPerm(user, def.createPerm);
  return getDb().transaction(async (tx) => {
    const prepared = await prepareDocument(tx, input);
    const fy = await fyForDate(tx, input.date);
    const docNo = await nextDocNo(tx, def.prefix, fy);
    const [doc] = await tx
      .insert(t.documents)
      .values({ ...prepared.header, docNo, status: "Draft", createdBy: user.id })
      .returning();
    await writeLines(tx, doc!.id, prepared);
    await writeAudit(tx, actor(user), {
      action: "Created",
      entity: def.label,
      entityId: doc!.id,
      ref: docNo,
      details: { total: doc!.total },
    });
    if (def.autoApprove) await approveInTx(tx, user, doc!.id);
    return { id: doc!.id, docNo, warnings: prepared.warnings };
  });
}

export async function updateDraft(user: SessionUser, id: string, input: DocInput) {
  return getDb().transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    const def = DOC_DEFS[doc.type];
    assertPerm(user, def.createPerm);
    if (doc.type !== input.type) fail("Document type cannot change.");
    if (doc.status !== "Draft")
      fail(`${doc.docNo} is ${doc.status.toLowerCase()} and can no longer be edited.`);
    const prepared = await prepareDocument(tx, input, id);
    if (prepared.header.fyId !== doc.fyId)
      fail("The date must stay within the same financial year; cancel and re-enter instead.");
    await tx.delete(t.allocations).where(eq(t.allocations.paymentId, id));
    await tx.delete(t.documentLines).where(eq(t.documentLines.documentId, id));
    await tx
      .update(t.documents)
      .set({ ...prepared.header, editedBy: user.id, editedAt: new Date() })
      .where(eq(t.documents.id, id));
    await writeLines(tx, id, prepared);
    await writeAudit(tx, actor(user), {
      action: "Edited",
      entity: def.label,
      entityId: id,
      ref: doc.docNo,
      details: { totalBefore: doc.total, totalAfter: prepared.header.total },
    });
    return { id, docNo: doc.docNo, warnings: prepared.warnings };
  });
}

export async function submitDocument(user: SessionUser, id: string) {
  return getDb().transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    const def = DOC_DEFS[doc.type];
    assertPerm(user, def.createPerm);
    if (doc.status !== "Draft") fail("Only drafts can be submitted for approval.");
    await fyForDate(tx, doc.date);
    await tx
      .update(t.documents)
      .set({ status: "Pending", submittedBy: user.id, submittedAt: new Date() })
      .where(eq(t.documents.id, id));
    await writeAudit(tx, actor(user), {
      action: "Submitted",
      entity: def.label,
      entityId: id,
      ref: doc.docNo,
    });
  });
}

/** Sends a pending document back to draft with a reason. */
export async function rejectDocument(user: SessionUser, id: string, reason: string) {
  if (!reason.trim()) fail("Enter a reason.");
  return getDb().transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    const def = DOC_DEFS[doc.type];
    assertPerm(user, def.approvePerm);
    if (doc.status !== "Pending") fail("Only documents awaiting approval can be returned.");
    await tx
      .update(t.documents)
      .set({ status: "Draft", submittedBy: null, submittedAt: null })
      .where(eq(t.documents.id, id));
    await writeAudit(tx, actor(user), {
      action: "Returned to draft",
      entity: def.label,
      entityId: id,
      ref: doc.docNo,
      details: { reason },
    });
  });
}

async function approveInTx(tx: Tx, user: SessionUser, id: string) {
  const doc = await lockDocument(tx, id);
  const def = DOC_DEFS[doc.type];
  assertPerm(user, def.approvePerm);
  if (doc.status !== "Draft" && doc.status !== "Pending")
    fail(`${doc.docNo} is already ${doc.status.toLowerCase()}.`);
  if (def.makerChecker && doc.createdBy === user.id && (await makerCheckerOn(tx))) {
    fail("You created this document, so another authorised user must approve it.");
  }
  await fyForDate(tx, doc.date);
  const lines = await tx
    .select()
    .from(t.documentLines)
    .where(eq(t.documentLines.documentId, id))
    .orderBy(t.documentLines.lineNo);
  const ctx = new PostingContext(tx, user);
  await post(ctx, doc, lines);
  await tx
    .update(t.documents)
    .set({ status: "Approved", approvedBy: user.id, approvedAt: new Date() })
    .where(eq(t.documents.id, id));
  await writeAudit(tx, actor(user), {
    action: "Approved",
    entity: def.label,
    entityId: id,
    ref: doc.docNo,
    details: { total: doc.total },
  });
}

export async function approveDocument(user: SessionUser, id: string) {
  return getDb().transaction((tx) => approveInTx(tx, user, id));
}

/** Drafts/pending: simply cancelled. Approved: reversed (stock, ledgers, links) and cancelled. */
export async function cancelDocument(user: SessionUser, id: string, reason: string) {
  if (reason.trim().length < 3) fail("Enter the reason for cancelling.");
  return getDb().transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    const def = DOC_DEFS[doc.type];
    if (doc.status === "Cancelled") fail(`${doc.docNo} is already cancelled.`);
    if (doc.type === "CLOSE")
      fail("Re-open the financial year instead of cancelling its closing entry.");
    if (doc.status === "Approved") {
      assertPerm(user, "docs.cancel");
      await fyForDate(tx, doc.date);
      const lines = await tx
        .select()
        .from(t.documentLines)
        .where(eq(t.documentLines.documentId, id));
      await reverse(new PostingContext(tx, user), doc, lines);
    } else {
      assertPerm(user, def.createPerm, def.approvePerm);
    }
    await tx
      .update(t.documents)
      .set({
        status: "Cancelled",
        cancelledBy: user.id,
        cancelledAt: new Date(),
        cancelReason: reason.trim(),
      })
      .where(eq(t.documents.id, id));
    await writeAudit(tx, actor(user), {
      action: doc.status === "Approved" ? "Cancelled & reversed" : "Cancelled",
      entity: def.label,
      entityId: id,
      ref: doc.docNo,
      details: { reason },
    });
  });
}

/** Which document types a user may see. */
export function visibleTypes(user: SessionUser): DocType[] {
  return (Object.keys(DOC_DEFS) as DocType[]).filter((type) => {
    const d = DOC_DEFS[type];
    if (user.permissions.has(d.createPerm) || user.permissions.has(d.approvePerm)) return true;
    // Salary documents stay restricted to HR/payroll roles even for report viewers.
    if (type === "PAYROLL" || type === "SALPAY" || type === "LOAN")
      return user.permissions.has("hr.salary_view");
    return user.permissions.has("reports.view");
  });
}
