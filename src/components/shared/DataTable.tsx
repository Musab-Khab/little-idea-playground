import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, Download, Printer, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface Column<T> {
  key: string;
  header: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  align?: "right";
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  compact?: boolean;
  exportName?: string;
}

export function DataTable<T>({ rows, columns, pageSize = 10, compact, exportName = "export" }: Props<T>) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    let r = term ? rows.filter((row) => columns.some((c) => String(c.value(row)).toLowerCase().includes(term))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)!;
      r = [...r].sort((a, b) => (col.value(a) > col.value(b) ? 1 : -1) * sort.dir);
    }
    return r;
  }, [rows, columns, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const exportCsv = () => {
    const csv = [columns.map((c) => c.header), ...filtered.map((r) => columns.map((c) => c.value(r)))]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${exportName}.csv`;
    a.click();
  };

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4" />Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={`py-2 pr-3 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                  <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>
                    {c.header}
                    {!compact && <ArrowUpDown className="size-3 opacity-50" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={`py-2.5 pr-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.render ? c.render(row) : c.value(row)}
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={columns.length} className="py-8 text-center text-muted-foreground">No records found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!compact && pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          Page {page + 1} of {pages}
          <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
