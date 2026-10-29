import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileCheck2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Field, SelectField, TextField } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { useSession } from "@/lib/session";
import { importMasters, importOpeningBalances } from "@/server/functions/imports";
import { CUSTOMER_CATEGORIES, PRODUCT_CATEGORIES, SUPPLIER_CATEGORIES } from "@/shared/masters";
import type { Permission } from "@/shared/permissions";

export const Route = createFileRoute("/_authenticated/settings/data-import")({
  head: () => ({ meta: [{ title: "Data Import – MFAHH" }] }),
  component: DataImport,
});

type Kind = "customers" | "suppliers" | "products" | "opening";
const TEMPLATES: Record<
  Kind,
  { label: string; perm: Permission; headers: string[]; sample: (string | number)[]; note: string }
> = {
  customers: {
    label: "Customers",
    perm: "customers.manage",
    headers: [
      "code",
      "name",
      "category",
      "contactPerson",
      "phone",
      "email",
      "address",
      "city",
      "ntn",
      "creditDays",
      "creditLimit",
    ],
    sample: [
      "CUS-001",
      "Al-Falah Bookstore",
      "Bookshop",
      "Imran Sheikh",
      "0300-1234567",
      "",
      "Urdu Bazar",
      "Karachi",
      "",
      30,
      400000,
    ],
    note: `Category: ${CUSTOMER_CATEGORIES.join(", ")}`,
  },
  suppliers: {
    label: "Suppliers / vendors",
    perm: "suppliers.manage",
    headers: [
      "code",
      "name",
      "category",
      "contactPerson",
      "phone",
      "email",
      "address",
      "city",
      "ntn",
      "creditDays",
    ],
    sample: [
      "SUP-001",
      "Star Offset Printers",
      "Printer",
      "Kamran",
      "021-1234567",
      "",
      "Lyari",
      "Karachi",
      "1234567-8",
      30,
    ],
    note: `Category: ${SUPPLIER_CATEGORIES.join(", ")}`,
  },
  products: {
    label: "Books & products",
    perm: "books.manage",
    headers: [
      "code",
      "name",
      "category",
      "subject",
      "className",
      "series",
      "edition",
      "costPrice",
      "salePrice",
      "minStock",
    ],
    sample: [
      "ENG-5",
      "English Grammar 5",
      "Textbook",
      "English",
      "5",
      "Grammar Series",
      "2026",
      120,
      250,
      50,
    ],
    note: `Category: ${PRODUCT_CATEGORIES.join(", ")}. Opening stock is imported separately as opening balances.`,
  },
  opening: {
    label: "Opening balances",
    perm: "accounts.manage",
    headers: ["kind", "code", "qty", "rate", "debit", "credit"],
    sample: ["stock", "ENG-5", 500, 120, "", ""],
    note: "kind = stock (book code, qty, cost rate) · customer (code, debit = they owe us) · supplier (code, credit = we owe them) · account (account code e.g. 1100 cash, bank GL code; debit or credit). Creates a draft Opening Balances document for approval.",
  },
};

function DataImport() {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const kinds = (Object.keys(TEMPLATES) as Kind[]).filter((k) => can(TEMPLATES[k].perm));
  const [kind, setKind] = useState<Kind>(kinds[0] ?? "customers");
  const [rows, setRows] = useState<Record<string, string | number | null>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{
    ok: boolean;
    valid: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const fyStart = lk?.financialYears.find((f) => f.status === "Open")?.startDate ?? lk?.today ?? "";
  const [date, setDate] = useState("");
  const tpl = TEMPLATES[kind];

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([tpl.headers, tpl.sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import");
    XLSX.writeFile(wb, `mfahh-import-${kind}.xlsx`);
  };

  const readFile = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const data = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(sheet, {
      defval: null,
      raw: true,
    });
    const missing = tpl.headers.filter((h) => !(h in (data[0] ?? {})));
    if (missing.length)
      toast.warning(`Columns not found: ${missing.join(", ")}. Use the template headers.`);
    setRows(data);
  };

  const run = async (dryRun: boolean) => {
    if (!rows) return;
    setBusy(true);
    try {
      const res =
        kind === "opening"
          ? await importOpeningBalances({ data: { date: date || fyStart, rows, dryRun } })
          : await importMasters({ data: { entity: kind, rows, dryRun } });
      setResult(res);
      if (!dryRun && res.ok) {
        toast.success(
          kind === "opening"
            ? `Draft ${"docNo" in res ? res.docNo : ""} created — approve it under Accounts → Opening Balances`
            : `${res.valid} records imported`,
        );
        setRows(null);
        setFileName("");
        await qc.invalidateQueries();
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Data Import" crumbs={["Home", "Settings", "Data Import"]} />
      <section className="card-surface space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Move data from the previous software: download the template, fill it in Excel, upload it,
          check, then import. Nothing is saved unless every row is valid.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="What to import"
            className="w-64"
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              setRows(null);
              setResult(null);
            }}
            options={kinds.map((k) => ({ value: k, label: TEMPLATES[k].label }))}
          />
          <Button variant="outline" onClick={downloadTemplate}>
            <Download />
            Download template
          </Button>
          {kind === "opening" && (
            <TextField
              label="Opening date"
              type="date"
              value={date || fyStart}
              onChange={setDate}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{tpl.note}</p>
        <Field label="Filled file (.xlsx or .csv)">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
        </Field>
        {rows && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              {fileName}: <b>{rows.length}</b> rows
            </span>
            <Button variant="outline" disabled={busy} onClick={() => run(true)}>
              <FileCheck2 />
              Check
            </Button>
            <Button disabled={busy || !result?.ok} onClick={() => run(false)}>
              <Upload />
              Import {result?.valid ?? ""} rows
            </Button>
          </div>
        )}
        {result &&
          (result.ok ? (
            <p className="rounded-md bg-tint-green p-3 text-sm">
              All {result.valid} rows are valid.
            </p>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="mb-2 font-semibold text-destructive">
                {result.errors.length} problem(s) — fix the file and upload again:
              </p>
              <ul className="max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5">
                {result.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>
    </div>
  );
}
