import { useState, type ReactNode } from "react";
import { Plus, Pencil, Power, ClipboardList, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Field, SelectField, TextAreaField, TextField } from "@/components/shared/Field";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorText, useAction, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useLookups } from "@/lib/lookups";
import { formatAmount, formatDate, formatPKR, formatQty } from "@/lib/format";
import {
  listMasters,
  saveMaster,
  setMasterStatus,
  type MasterEntity,
} from "@/server/functions/masters";
import type { Permission } from "@/shared/permissions";
import { useQueryClient } from "@tanstack/react-query";

export type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

export interface FieldDef {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "email"
    | "date"
    | "select"
    | "textarea"
    | "account"
    | "groupAccount"
    | "checkbox";
  options?: readonly string[];
  required?: boolean;
  /** Only shown/editable with this permission. */
  perm?: Permission;
  /** Filter for account pickers. */
  accountType?: string;
  wide?: boolean;
  /** Locked once the record exists (e.g. account codes of system accounts). */
  lockWhen?: (r: Row) => boolean;
}

export interface ColumnDef {
  key: string;
  header: string;
  kind?: "money" | "qty" | "status" | "date" | "badge";
  perm?: Permission;
}

export interface MasterPageProps {
  entity: MasterEntity;
  title: string;
  section: string;
  singular: string;
  editPerm: Permission;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaults?: Row;
  kpis?: (rows: Row[]) => { title: string; value: string; sub?: string; danger?: boolean }[];
  /** Extra tabs in the record view. */
  tabs?: (row: Row) => { id: string; label: string; content: ReactNode }[];
  filters?: { key: string; label: string }[];
  headerExtra?: ReactNode;
}

export function MasterPage({
  entity,
  title,
  section,
  singular,
  editPerm,
  fields,
  columns,
  defaults = {},
  kpis,
  tabs,
  filters = [],
  headerExtra,
}: MasterPageProps) {
  const { can } = useSession();
  const q = useApi(["masters", entity], () => listMasters({ data: { entity } }));
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [status, setStatus] = useState("Active");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const toggle = useAction(
    (r: Row) =>
      setMasterStatus({ data: { entity, id: s(r, "id"), active: s(r, "status") !== "Active" } }),
    "Status updated",
  );
  const canEdit = can(editPerm);
  const all = q.data ?? [];
  const rows = all.filter(
    (r) =>
      (status === "All" || s(r, "status") === status) &&
      filters.every(
        (f) =>
          !filterValues[f.key] ||
          filterValues[f.key] === "All" ||
          s(r, f.key) === filterValues[f.key],
      ),
  );

  const cols: Column<Row>[] = columns
    .filter((c) => !c.perm || can(c.perm))
    .map((c) => ({
      key: c.key,
      header: c.header,
      value: (r) => (c.kind === "money" || c.kind === "qty" ? Number(r[c.key] ?? 0) : s(r, c.key)),
      align: c.kind === "money" || c.kind === "qty" ? "right" : undefined,
      render: (r) =>
        c.kind === "money" ? (
          <span className="whitespace-nowrap tabular-nums">{formatPKR(Number(r[c.key] ?? 0))}</span>
        ) : c.kind === "qty" ? (
          formatQty(Number(r[c.key] ?? 0))
        ) : c.kind === "status" || c.kind === "badge" ? (
          <StatusBadge status={s(r, c.key)} />
        ) : c.kind === "date" ? (
          formatDate(s(r, c.key))
        ) : c.key === "name" ? (
          <span className="font-medium text-navy">{s(r, c.key)}</span>
        ) : (
          s(r, c.key)
        ),
    }));
  if (canEdit) {
    cols.push({
      key: "actions",
      header: "Actions",
      value: () => "",
      render: (r) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Edit"
            aria-label="Edit"
            onClick={() => setEditing(r)}
          >
            <Pencil className="size-4" />
          </Button>
          {!r["systemKey"] && (
            <Button
              variant="ghost"
              size="icon"
              title={s(r, "status") === "Active" ? "Deactivate" : "Activate"}
              aria-label="Toggle status"
              onClick={() => toggle.mutate(r)}
            >
              <Power
                className={`size-4 ${s(r, "status") === "Active" ? "text-destructive" : "text-success"}`}
              />
            </Button>
          )}
        </div>
      ),
    });
  }

  const cards = kpis?.(all) ?? [
    { title: "Records", value: String(all.length) },
    { title: "Active", value: String(all.filter((r) => s(r, "status") === "Active").length) },
    { title: "Inactive", value: String(all.filter((r) => s(r, "status") !== "Active").length) },
  ];
  const icons = [ClipboardList, CheckCircle2, Wallet, Wallet];
  const tints = ["blue", "green", "orange", "pink"] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        crumbs={["Home", section, ...(section !== title ? [title] : [])]}
        actions={
          canEdit && (
            <Button onClick={() => setEditing(null)}>
              <Plus />
              New {singular}
            </Button>
          )
        }
      />
      <div
        className={`grid gap-3 sm:grid-cols-2 ${cards.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
      >
        {cards.map((c, i) => (
          <KpiCard
            key={c.title}
            title={c.title}
            value={c.value}
            {...(c.sub ? { sub: c.sub } : {})}
            subTone={c.danger ? "danger" : "muted"}
            icon={icons[i % 4]!}
            tint={tints[i % 4]!}
          />
        ))}
      </div>
      {headerExtra}
      <section className="card-surface space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Active", "Inactive", "All"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x === "All" ? "All records" : x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.map((f) => (
            <Select
              key={f.key}
              value={filterValues[f.key] ?? "All"}
              onValueChange={(v) => setFilterValues({ ...filterValues, [f.key]: v })}
            >
              <SelectTrigger className="w-48" aria-label={f.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["All", ...new Set(all.map((r) => s(r, f.key)).filter(Boolean))]
                  .sort()
                  .map((x) => (
                    <SelectItem key={x} value={x}>
                      {x === "All" ? `All ${f.label.toLowerCase()}` : x}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ))}
        </div>
        {q.isLoading ? (
          <p className="py-8 text-center text-muted-foreground">Loading…</p>
        ) : (
          <DataTable
            rows={rows}
            columns={cols}
            exportName={entity}
            exportTitle={title}
            onRowClick={setViewing}
          />
        )}
      </section>
      {editing !== undefined && (
        <MasterForm
          entity={entity}
          singular={singular}
          fields={fields}
          record={editing}
          defaults={defaults}
          onClose={() => setEditing(undefined)}
        />
      )}
      {viewing && (
        <MasterView
          row={all.find((r) => r["id"] === viewing["id"]) ?? viewing}
          fields={fields}
          tabs={tabs?.(viewing) ?? []}
          onClose={() => setViewing(null)}
          onEdit={
            canEdit
              ? () => {
                  setEditing(viewing);
                  setViewing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function MasterForm({
  entity,
  singular,
  fields,
  record,
  defaults,
  onClose,
}: {
  entity: MasterEntity;
  singular: string;
  fields: FieldDef[];
  record: Row | null;
  defaults: Row;
  onClose: () => void;
}) {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const [values, setValues] = useState<Row>(() =>
    record
      ? { ...record }
      : {
          ...Object.fromEntries(
            fields.map((f) => [
              f.key,
              f.type === "number"
                ? 0
                : f.type === "checkbox"
                  ? false
                  : f.type === "select"
                    ? (f.options?.[0] ?? "")
                    : "",
            ]),
          ),
          ...defaults,
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string | number | boolean | null) =>
    setValues((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        fields
          .filter((f) => !f.perm || can(f.perm))
          .map((f) => [
            f.key,
            f.type === "number"
              ? Number(values[f.key] ?? 0)
              : (values[f.key] ?? (f.type === "checkbox" ? false : "")),
          ]),
      );
      await saveMaster({ data: { entity, id: record ? s(record, "id") : null, values: payload } });
      toast.success(`${singular} saved`);
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${singular}` : `New ${singular}`}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {fields
              .filter((f) => !f.perm || can(f.perm))
              .map((f) => {
                const locked = Boolean(record && f.lockWhen?.(record));
                const v = values[f.key];
                const cls = f.wide || f.type === "textarea" ? "sm:col-span-2" : "";
                if (f.type === "select")
                  return (
                    <SelectField
                      key={f.key}
                      className={cls}
                      label={f.label}
                      required={f.required}
                      disabled={locked}
                      value={String(v ?? "")}
                      options={f.options ?? []}
                      onChange={(x) => set(f.key, x)}
                    />
                  );
                if (f.type === "textarea")
                  return (
                    <TextAreaField
                      key={f.key}
                      className={cls}
                      label={f.label}
                      required={f.required}
                      value={String(v ?? "")}
                      onChange={(x) => set(f.key, x)}
                    />
                  );
                if (f.type === "checkbox")
                  return (
                    <label key={f.key} className="flex items-center gap-2 pt-6 text-sm">
                      <Checkbox
                        checked={Boolean(v)}
                        disabled={locked}
                        onCheckedChange={(c) => set(f.key, Boolean(c))}
                      />
                      {f.label}
                    </label>
                  );
                if (f.type === "account" || f.type === "groupAccount") {
                  const opts = (lk?.accounts ?? []).filter(
                    (a) =>
                      (f.type === "groupAccount" ? a.isGroup : !a.isGroup) &&
                      (!f.accountType ||
                        a.type === (f.accountType === "same" ? values["type"] : f.accountType)) &&
                      a.id !== record?.["id"],
                  );
                  return (
                    <Field
                      key={f.key}
                      label={f.required ? `${f.label} *` : f.label}
                      className={cls}
                    >
                      <SearchSelect
                        disabled={locked}
                        options={[
                          ...(f.type === "groupAccount"
                            ? [{ value: "", label: "— Top level —" }]
                            : []),
                          ...opts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
                        ]}
                        value={String(v ?? "")}
                        onChange={(x) => set(f.key, x || null)}
                      />
                    </Field>
                  );
                }
                return (
                  <TextField
                    key={f.key}
                    className={cls}
                    label={f.label}
                    required={f.required}
                    disabled={locked}
                    type={f.type ?? "text"}
                    min={f.type === "number" ? 0 : undefined}
                    step={f.type === "number" ? "any" : undefined}
                    value={v as string | number}
                    onChange={(x) => set(f.key, x)}
                  />
                );
              })}
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MasterView({
  row,
  fields,
  tabs,
  onClose,
  onEdit,
}: {
  row: Row;
  fields: FieldDef[];
  tabs: { id: string; label: string; content: ReactNode }[];
  onClose: () => void;
  onEdit: (() => void) | undefined;
}) {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const display = (f: FieldDef) => {
    const v = row[f.key];
    if (f.type === "account" || f.type === "groupAccount") {
      const a = lk?.accounts.find((x) => x.id === v);
      return a ? `${a.code} ${a.name}` : "—";
    }
    if (f.type === "number")
      return f.key.toLowerCase().includes("price") ||
        ["creditLimit", "basic", "allowances", "deductions"].includes(f.key)
        ? formatPKR(Number(v ?? 0))
        : formatQty(Number(v ?? 0));
    if (f.type === "date") return formatDate(String(v ?? ""));
    if (f.type === "checkbox") return v ? "Yes" : "No";
    return v === null || v === "" || v === undefined ? "—" : String(v);
  };
  const computed = (
    ["balance", "overdue", "stockQty", "avgCost", "stockValue", "damagedQty", "advances"] as const
  ).filter((k) => row[k] !== undefined && row[k] !== null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {s(row, "name")}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {s(row, "code") || s(row, "empId") || s(row, "accountNo")}
            </span>
            <StatusBadge status={s(row, "status")} />
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="profile" className="space-y-4">
            {computed.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {computed.map((k) => (
                  <div key={k} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      {
                        {
                          balance: "Balance",
                          overdue: "Overdue",
                          stockQty: "In stock",
                          avgCost: "Weighted average cost",
                          stockValue: "Stock value",
                          damagedQty: "Damaged (written off)",
                          advances: "Advances outstanding",
                        }[k]
                      }
                    </p>
                    <p className="text-lg font-bold text-navy">
                      {k === "stockQty" || k === "damagedQty"
                        ? formatQty(Number(row[k]))
                        : k === "avgCost"
                          ? `Rs ${formatAmount(Number(row[k]))}`
                          : formatPKR(Number(row[k]))}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {fields
                .filter((f) => !f.perm || can(f.perm))
                .map((f) => (
                  <div
                    key={f.key}
                    className={f.type === "textarea" ? "sm:col-span-2 lg:col-span-3" : ""}
                  >
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="break-words font-medium">{display(f)}</dd>
                  </div>
                ))}
            </dl>
          </TabsContent>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id}>
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
        <DialogFooter>
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil />
              Edit
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
