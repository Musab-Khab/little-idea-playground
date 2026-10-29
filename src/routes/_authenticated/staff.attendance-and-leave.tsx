import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Field, SelectField, TextField } from "@/components/shared/Field";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction, useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/format";
import {
  applyLeave,
  decideLeave,
  getAttendance,
  listLeave,
  markAttendance,
} from "@/server/functions/hr";
import { todayISO } from "@/shared/documents";

export const Route = createFileRoute("/_authenticated/staff/attendance-and-leave")({
  head: () => ({ meta: [{ title: "Attendance & Leave – MFAHH" }] }),
  component: AttendancePage,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
const CODES: Record<string, string> = { Present: "P", Absent: "A", Late: "L", Leave: "LV" };
const NEXT: Record<string, string> = {
  "": "Present",
  Present: "Absent",
  Absent: "Late",
  Late: "Leave",
  Leave: "Present",
};

function AttendancePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance & Leave"
        crumbs={["Home", "Staff & HR", "Attendance & Leave"]}
      />
      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance register</TabsTrigger>
          <TabsTrigger value="leave">Leave applications</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance">
          <AttendanceGrid />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttendanceGrid() {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const today = lk?.today ?? todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const q = useApi(["attendance", month], () => getAttendance({ data: { month } }));
  const save = useAction(
    (v: {
      date: string;
      marks: { staffId: string; status: "Present" | "Absent" | "Late" | "Leave" }[];
    }) => markAttendance({ data: v }),
    "Attendance saved",
  );
  const staff = (q.data?.staff ?? []).filter((x) => x["status"] === "Active");
  const marks = useMemo(
    () =>
      new Map(
        (q.data?.marks ?? []).map((m) => [`${s(m, "staffId")}:${s(m, "date")}`, s(m, "status")]),
      ),
    [q.data],
  );
  const days = q.data
    ? Array.from(
        { length: Number(q.data.to.slice(8)) },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      )
    : [];
  const editable = can("staff.manage");

  return (
    <section className="card-surface space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Month"
          type="month"
          value={month}
          onChange={(v) => {
            setMonth(v);
            setDraft({});
          }}
        />
        {editable && (
          <>
            <TextField
              label="Mark date"
              type="date"
              value={date}
              onChange={(v) => {
                setDate(v);
                setDraft({});
              }}
            />
            <Button
              variant="outline"
              onClick={() =>
                setDraft(Object.fromEntries(staff.map((x) => [s(x, "id"), "Present"])))
              }
            >
              All present
            </Button>
            <Button
              disabled={!Object.keys(draft).length || save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    date,
                    marks: Object.entries(draft).map(([staffId, status]) => ({
                      staffId,
                      status: status as "Present",
                    })),
                  },
                  { onSuccess: () => setDraft({}) },
                )
              }
            >
              Save {Object.keys(draft).length || ""} marks for {formatDate(date)}
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        P = Present, A = Absent, L = Late, LV = Leave.{" "}
        {editable
          ? "Click a cell in the selected date's column to cycle the status, then save."
          : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card px-2 py-1 text-left">Employee</th>
              {days.map((d) => (
                <th key={d} className={`w-8 px-1 ${d === date ? "bg-primary/10" : ""}`}>
                  {d.slice(8)}
                </th>
              ))}
              <th className="px-2">P</th>
              <th className="px-2">A</th>
              <th className="px-2">L</th>
              <th className="px-2">LV</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((st) => {
              const id = s(st, "id");
              const counts: Record<string, number> = { Present: 0, Absent: 0, Late: 0, Leave: 0 };
              return (
                <tr key={id} className="border-t">
                  <td className="sticky left-0 whitespace-nowrap bg-card px-2 py-1 font-medium">
                    {s(st, "empId")} · {s(st, "name")}
                  </td>
                  {days.map((d) => {
                    const value =
                      d === date && draft[id] ? draft[id]! : (marks.get(`${id}:${d}`) ?? "");
                    if (value) counts[value] = (counts[value] ?? 0) + 1;
                    const clickable = editable && d === date;
                    return (
                      <td
                        key={d}
                        className={`px-0.5 text-center ${d === date ? "bg-primary/5" : ""}`}
                      >
                        <button
                          disabled={!clickable}
                          onClick={() => setDraft({ ...draft, [id]: NEXT[value] ?? "Present" })}
                          className={`size-7 rounded ${value === "Absent" ? "bg-tint-pink text-destructive" : value === "Late" ? "bg-tint-orange" : value === "Leave" ? "bg-tint-blue" : value === "Present" ? "bg-tint-green" : ""} ${clickable ? "ring-1 ring-primary/40" : ""}`}
                        >
                          {CODES[value] ?? ""}
                        </button>
                      </td>
                    );
                  })}
                  {["Present", "Absent", "Late", "Leave"].map((k) => (
                    <td key={k} className="px-2 text-center font-semibold">
                      {counts[k]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeaveList() {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const year = Number((lk?.today ?? new Date().toISOString()).slice(0, 4));
  const q = useApi(["leave", year], () => listLeave({ data: { year } }));
  const decide = useAction(
    (v: { id: string; decision: "Approved" | "Rejected" | "Cancelled" }) =>
      decideLeave({ data: v }),
    "Leave updated",
  );
  const [open, setOpen] = useState(false);
  return (
    <section className="card-surface space-y-4 p-4">
      {can("staff.manage") && (
        <Button onClick={() => setOpen(true)}>
          <Plus />
          New leave application
        </Button>
      )}
      <DataTable
        rows={q.data ?? []}
        exportName="leave"
        columns={[
          { key: "staff", header: "Employee", value: (r) => `${s(r, "empId")} ${s(r, "staff")}` },
          { key: "type", header: "Leave type", value: (r) => s(r, "type") },
          {
            key: "fromDate",
            header: "From",
            value: (r) => s(r, "fromDate"),
            render: (r) => formatDate(s(r, "fromDate")),
          },
          {
            key: "toDate",
            header: "To",
            value: (r) => s(r, "toDate"),
            render: (r) => formatDate(s(r, "toDate")),
          },
          { key: "days", header: "Days", value: (r) => Number(r["days"]), align: "right" },
          {
            key: "used",
            header: "Used / allowed",
            value: (r) => Number(r["used"]),
            render: (r) => `${s(r, "used")} / ${s(r, "allowed")}`,
          },
          { key: "reason", header: "Reason", value: (r) => s(r, "reason") },
          {
            key: "status",
            header: "Status",
            value: (r) => s(r, "status"),
            render: (r) => <StatusBadge status={s(r, "status")} />,
          },
          {
            key: "actions",
            header: "Actions",
            value: () => "",
            render: (r) =>
              can("staff.manage") && (
                <div className="flex gap-1">
                  {r["status"] === "Pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => decide.mutate({ id: s(r, "id"), decision: "Approved" })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide.mutate({ id: s(r, "id"), decision: "Rejected" })}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {(r["status"] === "Pending" || r["status"] === "Approved") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decide.mutate({ id: s(r, "id"), decision: "Cancelled" })}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ),
          },
        ]}
      />
      {open && <LeaveForm onClose={() => setOpen(false)} />}
    </section>
  );
}

function LeaveForm({ onClose }: { onClose: () => void }) {
  const { data: lk } = useLookups();
  const [v, setV] = useState({
    staffId: "",
    leaveTypeId: "",
    fromDate: lk?.today ?? "",
    toDate: lk?.today ?? "",
    reason: "",
  });
  const save = useAction(() => applyLeave({ data: v }), "Leave application recorded");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave application</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee *" className="sm:col-span-2">
            <SearchSelect
              options={(lk?.staff ?? [])
                .filter((x) => x.status === "Active")
                .map((x) => ({ value: x.id, label: x.name, hint: x.code }))}
              value={v.staffId}
              onChange={(x) => setV({ ...v, staffId: x })}
            />
          </Field>
          <SelectField
            label="Leave type"
            required
            value={v.leaveTypeId}
            onChange={(x) => setV({ ...v, leaveTypeId: x })}
            options={(lk?.leaveTypes ?? []).map((x) => ({ value: x.id, label: x.name }))}
          />
          <div />
          <TextField
            label="From"
            type="date"
            required
            value={v.fromDate}
            onChange={(x) => setV({ ...v, fromDate: x })}
          />
          <TextField
            label="To"
            type="date"
            required
            value={v.toDate}
            onChange={(x) => setV({ ...v, toDate: x })}
          />
          <TextField
            label="Reason"
            className="sm:col-span-2"
            value={v.reason}
            onChange={(x) => setV({ ...v, reason: x })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
