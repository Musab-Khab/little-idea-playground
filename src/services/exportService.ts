import { generatedOn, splitTitle } from "@/components/print/ReportHeading";

/** Client-side exports of what is on screen. Libraries load on demand to keep the bundle small. */
export async function exportExcel(name: string, headers: string[], rows: (string | number)[][]) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  XLSX.writeFile(workbook, `${name}.xlsx`);
}

/** PDF in Turnkey's report format: "Generated on" top right, centred underlined title and period. */
export async function exportPdf(
  name: string,
  headers: string[],
  rows: (string | number)[][],
  title?: string,
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: headers.length > 6 ? "landscape" : "portrait" });
  const width = doc.internal.pageSize.getWidth();
  const heading = splitTitle(title ?? name.replaceAll("-", " "));
  const centredUnderlined = (text: string, y: number, size: number) => {
    doc.setFont("times", "bold");
    doc.setFontSize(size);
    doc.text(text, width / 2, y, { align: "center" });
    const w = doc.getTextWidth(text);
    doc.setLineWidth(0.3);
    doc.line(width / 2 - w / 2, y + 1, width / 2 + w / 2, y + 1);
  };
  doc.setFont("times", "normal");
  doc.setFontSize(8);
  doc.text(`Generated on: ${generatedOn()}`, width - 14, 10, { align: "right" });
  centredUnderlined(heading.title, 17, 13);
  if (heading.period) centredUnderlined(heading.period, 23, 10);
  const numeric = headers.map(
    (_, i) => rows.length > 0 && rows.every((r) => typeof r[i] === "number"),
  );
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) =>
      r.map((c) =>
        typeof c === "number"
          ? c.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
          : c,
      ),
    ),
    startY: heading.period ? 28 : 23,
    theme: "plain",
    styles: { font: "times", fontSize: 9, textColor: 0, cellPadding: 1.5 },
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.3 }, lineColor: 0 },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: 110 },
    columnStyles: Object.fromEntries(
      numeric.flatMap((isNum, i) => (isNum ? [[i, { halign: "right" as const }]] : [])),
    ),
    didParseCell: (cell) => {
      if (cell.section === "head" && numeric[cell.column.index]) cell.cell.styles.halign = "right";
    },
  });
  doc.save(`${name}.pdf`);
}
