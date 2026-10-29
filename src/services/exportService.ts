/** Client-side exports of what is on screen. Libraries load on demand to keep the bundle small. */
export async function exportExcel(name: string, headers: string[], rows: (string | number)[][]) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  XLSX.writeFile(workbook, `${name}.xlsx`);
}

export async function exportPdf(
  name: string,
  headers: string[],
  rows: (string | number)[][],
  title?: string,
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text("Turnkey Publishers · MFAHH", 14, 15);
  doc.setFontSize(11);
  doc.text(title ?? name.replaceAll("-", " "), 14, 22);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 27);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) =>
      r.map((c) =>
        typeof c === "number" ? c.toLocaleString("en-US", { maximumFractionDigits: 2 }) : c,
      ),
    ),
    startY: 31,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [11, 46, 89] },
    theme: "grid",
  });
  doc.save(`${name}.pdf`);
}
