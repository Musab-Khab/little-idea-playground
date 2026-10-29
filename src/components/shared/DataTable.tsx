import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, Download, Printer, Search } from "lucide-react";
import { useRouteContext } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { exportExcel, exportPdf } from "@/services/exportService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  /** Title printed at the top of PDF exports. */
  exportTitle?: string;
  onRowClick?: (row: T) => void;
  /** Extra rows rendered after the data (e.g. totals). */
  footer?: ReactNode;
}

function useCanExport() {
  const ctx = useRouteContext({ strict: false }) as { session?: { permissions: string[] } };
  return ctx.session?.permissions.includes("reports.export") ?? false;
}

export function DataTable<T>({
  rows,
  columns,
  pageSize = 15,
  compact,
  exportName = "export",
  exportTitle,
  onRowClick,
  footer,
}: Props<T>) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const canExport = useCanExport();

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    let r = term
      ? rows.filter((row) => columns.some((c) => String(c.value(row)).toLowerCase().includes(term)))
      : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col)
        r = [...r].sort(
          (a, b) =>
            (col.value(a) > col.value(b) ? 1 : col.value(a) < col.value(b) ? -1 : 0) * sort.dir,
        );
    }
    return r;
  }, [rows, columns, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const view = compact
    ? filtered
    : filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const download = async (kind: "excel" | "pdf") => {
    try {
      const visible = columns.filter(
        (c) => c.header && !["Actions", "Decision", "Action"].includes(c.header),
      );
      const headers = visible.map((c) => c.header);
      const data = filtered.map((r) => visible.map((c) => c.value(r)));
      await (kind === "excel"
        ? exportExcel(exportName, headers, data)
        : exportPdf(exportName, headers, data, exportTitle));
    } catch {
      toast.error("Unable to export records.");
    }
  };

  return (
    <div>
      {!compact && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search…"
              className="pl-9"
              aria-label="Search table"
            />
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => download("excel")}>
                <Download className="size-4" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => download("pdf")}>
                <Download className="size-4" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
              </Button>
            </>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn("py-2 pr-3 font-semibold", c.align === "right" && "text-right")}
                >
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setSort((s) => ({
                        key: c.key,
                        dir: s?.key === c.key && s.dir === 1 ? -1 : 1,
                      }))
                    }
                  >
                    {c.header}
                    {!compact && c.header && <ArrowUpDown className="size-3 opacity-50" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-muted/50",
                )}
                onClick={
                  onRowClick
                    ? (e) => {
                        if (!(e.target as HTMLElement).closest("button,a,input")) onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("py-2.5 pr-3", c.align === "right" && "text-right tabular-nums")}
                  >
                    {c.render ? c.render(row) : c.value(row)}
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
          {footer && <tfoot className="border-t-2 font-semibold">{footer}</tfoot>}
        </table>
      </div>
      {!compact && pages > 1 && (
        <div className="no-print mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Prev
          </Button>
          Page {currentPage + 1} of {pages}
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
