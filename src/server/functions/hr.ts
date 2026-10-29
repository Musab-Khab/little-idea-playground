import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, between, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getDb } from "../db/client";
import * as t from "../db/schema";
import { writeAudit } from "../audit";
import { assertPerm, requireUser } from "../security/session";
import { fail } from "../posting/context";
import { safe, toRows } from "./_safe";
import { STAFF_DOCUMENT_TYPES } from "@/shared/masters";

const month = z.string().regex(/^\d{4}-\d{2}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const monthRange = (m: string) => {
  const end = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  return { from: `${m}-01`, to: end };
};

export const getAttendance = createServerFn({ method: "GET" })
  .validator(z.object({ month }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.view", "staff.manage");
      const { from, to } = monthRange(data.month);
      const db = getDb();
      const staff = await db
        .select({
          id: t.staff.id,
          empId: t.staff.empId,
          name: t.staff.name,
          department: t.staff.department,
          status: t.staff.employmentStatus,
        })
        .from(t.staff)
        .orderBy(asc(t.staff.empId));
      const marks = await db
        .select()
        .from(t.attendance)
        .where(between(t.attendance.date, from, to));
      return {
        from,
        to,
        staff: toRows(staff),
        marks: toRows(marks.map((m) => ({ staffId: m.staffId, date: m.date, status: m.status }))),
      };
    }),
  );

export const markAttendance = createServerFn({ method: "POST" })
  .validator(
    z.object({
      date: isoDate,
      marks: z
        .array(
          z.object({
            staffId: z.string().uuid(),
            status: z.enum(["Present", "Absent", "Late", "Leave"]),
          }),
        )
        .min(1)
        .max(500),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.manage");
      const db = getDb();
      await db.transaction(async (tx) => {
        for (const m of data.marks) {
          await tx
            .insert(t.attendance)
            .values({ staffId: m.staffId, date: data.date, status: m.status, markedBy: user.id })
            .onConflictDoUpdate({
              target: [t.attendance.staffId, t.attendance.date],
              set: { status: m.status, markedBy: user.id, markedAt: new Date() },
            });
        }
        await writeAudit(tx, user, {
          action: "Attendance marked",
          entity: "Attendance",
          ref: data.date,
          details: { count: data.marks.length },
        });
      });
      return { ok: true };
    }),
  );

export const listLeave = createServerFn({ method: "GET" })
  .validator(z.object({ year: z.number().int().min(2000).max(2100) }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.view", "staff.manage");
      const db = getDb();
      const rows = await db
        .select({
          l: t.leaveApplications,
          staff: t.staff.name,
          empId: t.staff.empId,
          type: t.leaveTypes.name,
          allowed: t.leaveTypes.daysPerYear,
        })
        .from(t.leaveApplications)
        .innerJoin(t.staff, eq(t.staff.id, t.leaveApplications.staffId))
        .innerJoin(t.leaveTypes, eq(t.leaveTypes.id, t.leaveApplications.leaveTypeId))
        .where(sql`extract(year from ${t.leaveApplications.fromDate}) = ${data.year}`)
        .orderBy(desc(t.leaveApplications.fromDate));
      const used = new Map<string, number>();
      for (const r of rows)
        if (r.l.status === "Approved")
          used.set(
            `${r.l.staffId}:${r.l.leaveTypeId}`,
            (used.get(`${r.l.staffId}:${r.l.leaveTypeId}`) ?? 0) + r.l.days,
          );
      return toRows(
        rows.map((r) => ({
          id: r.l.id,
          staffId: r.l.staffId,
          staff: r.staff,
          empId: r.empId,
          type: r.type,
          fromDate: r.l.fromDate,
          toDate: r.l.toDate,
          days: r.l.days,
          reason: r.l.reason,
          status: r.l.status,
          allowed: r.allowed,
          used: used.get(`${r.l.staffId}:${r.l.leaveTypeId}`) ?? 0,
        })),
      );
    }),
  );

export const applyLeave = createServerFn({ method: "POST" })
  .validator(
    z.object({
      staffId: z.string().uuid(),
      leaveTypeId: z.string().uuid(),
      fromDate: isoDate,
      toDate: isoDate,
      reason: z.string().trim().max(500),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.manage");
      if (data.toDate < data.fromDate) fail("The end date is before the start date.");
      const days = Math.round((Date.parse(data.toDate) - Date.parse(data.fromDate)) / 86400000) + 1;
      if (days > 366) fail("Leave period is too long.");
      const db = getDb();
      const overlap = await db
        .select()
        .from(t.leaveApplications)
        .where(
          and(
            eq(t.leaveApplications.staffId, data.staffId),
            sql`${t.leaveApplications.status} in ('Pending', 'Approved')`,
            sql`${t.leaveApplications.fromDate} <= ${data.toDate} and ${t.leaveApplications.toDate} >= ${data.fromDate}`,
          ),
        );
      if (overlap.length) fail("This staff member already has leave in that period.");
      const [row] = await db
        .insert(t.leaveApplications)
        .values({ ...data, days, createdBy: user.id })
        .returning();
      await writeAudit(db, user, {
        action: "Leave applied",
        entity: "Leave",
        entityId: row!.id,
        details: { days, from: data.fromDate },
      });
      return { id: row!.id };
    }),
  );

export const decideLeave = createServerFn({ method: "POST" })
  .validator(
    z.object({ id: z.string().uuid(), decision: z.enum(["Approved", "Rejected", "Cancelled"]) }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.manage");
      const db = getDb();
      return db.transaction(async (tx) => {
        const [l] = await tx
          .select()
          .from(t.leaveApplications)
          .where(eq(t.leaveApplications.id, data.id))
          .for("update");
        if (!l) return fail("Leave application not found.");
        if (data.decision !== "Cancelled" && l.status !== "Pending")
          fail("This application was already decided.");
        if (data.decision === "Cancelled" && l.status === "Cancelled") fail("Already cancelled.");
        if (data.decision === "Approved" && l.createdBy === user.id && user.roleId !== "admin")
          fail("Another authorised user must approve leave you entered.");
        await tx
          .update(t.leaveApplications)
          .set({ status: data.decision, decidedBy: user.id, decidedAt: new Date() })
          .where(eq(t.leaveApplications.id, l.id));
        if (data.decision === "Approved") {
          for (let d = Date.parse(l.fromDate); d <= Date.parse(l.toDate); d += 86400000) {
            const date = new Date(d).toISOString().slice(0, 10);
            await tx
              .insert(t.attendance)
              .values({ staffId: l.staffId, date, status: "Leave", markedBy: user.id })
              .onConflictDoUpdate({
                target: [t.attendance.staffId, t.attendance.date],
                set: { status: "Leave", markedBy: user.id },
              });
          }
        }
        await writeAudit(tx, user, {
          action: `Leave ${data.decision.toLowerCase()}`,
          entity: "Leave",
          entityId: l.id,
        });
        return { ok: true };
      });
    }),
  );

/* ---------------------------------------------------------- documents */

const ALLOWED = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);
const MAX_BYTES = 5 * 1024 * 1024;

export const storageDir = () => {
  const dir = resolve(process.env.STORAGE_DIR || "./storage", "staff-docs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
};

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  return null;
}

export const listStaffDocuments = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    const user = await requireUser();
    assertPerm(user, "hr.salary_view");
    const rows = await getDb()
      .select({ d: t.staffDocuments, staff: t.staff.name, empId: t.staff.empId })
      .from(t.staffDocuments)
      .innerJoin(t.staff, eq(t.staff.id, t.staffDocuments.staffId))
      .orderBy(desc(t.staffDocuments.createdAt));
    return toRows(
      rows.map((r) => ({
        id: r.d.id,
        staffId: r.d.staffId,
        staff: r.staff,
        empId: r.empId,
        type: r.d.type,
        fileName: r.d.fileName,
        size: r.d.size,
        status: r.d.status,
        uploadedAt: r.d.createdAt,
      })),
    );
  }),
);

export const uploadStaffDocument = createServerFn({ method: "POST" })
  .validator(
    z.object({
      staffId: z.string().uuid(),
      type: z.enum(STAFF_DOCUMENT_TYPES),
      fileName: z.string().trim().min(1).max(200),
      base64: z.string().max(Math.ceil((MAX_BYTES * 4) / 3) + 8),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.manage");
      assertPerm(user, "hr.salary_view");
      const buf = Buffer.from(data.base64, "base64");
      if (buf.length === 0 || buf.length > MAX_BYTES)
        fail("Files must be between 1 byte and 5 MB.");
      const mime = sniff(buf);
      if (!mime || !ALLOWED.has(mime)) fail("Only PDF, JPG or PNG files are accepted.");
      const db = getDb();
      const [st] = await db.select().from(t.staff).where(eq(t.staff.id, data.staffId));
      if (!st) fail("Staff member not found.");
      const storedName = `${randomBytes(16).toString("hex")}${ALLOWED.get(mime!)}`;
      writeFileSync(join(storageDir(), storedName), buf, { flag: "wx" });
      const fileName = data.fileName.replace(/[^\w.\- ()]/g, "_");
      const [row] = await db
        .insert(t.staffDocuments)
        .values({
          staffId: data.staffId,
          type: data.type,
          fileName,
          storedName,
          mimeType: mime!,
          size: buf.length,
          createdBy: user.id,
        })
        .returning();
      await writeAudit(db, user, {
        action: "Document uploaded",
        entity: "Staff Document",
        entityId: row!.id,
        ref: st!.name,
        details: { type: data.type, fileName },
      });
      return { id: row!.id };
    }),
  );

export const archiveStaffDocument = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, "staff.manage");
      await getDb()
        .update(t.staffDocuments)
        .set({ status: "Inactive" })
        .where(eq(t.staffDocuments.id, data.id));
      await writeAudit(getDb(), user, {
        action: "Document archived",
        entity: "Staff Document",
        entityId: data.id,
      });
      return { ok: true };
    }),
  );
