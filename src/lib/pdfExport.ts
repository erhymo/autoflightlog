import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LogbookEntry } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";

export interface PDFExportOptions {
  includeAllFields: boolean;
  selectedFields?: string[];
  entries: LogbookEntry[];
  title?: string;
}

/**
 * Export logbook entries to PDF
 */
export function exportToPDF(options: PDFExportOptions): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const fields = options.includeAllFields
    ? FIELD_CATALOG
    : FIELD_CATALOG.filter(f => options.selectedFields?.includes(f.key || f.id));

  const margin = 10;

  // Add AutoFlightLog branding (small logo text)
  const brand = "AutoFlightLog";
  doc.setFontSize(10);
  doc.setTextColor(15, 42, 68); // aviation-blue
  doc.setFont("helvetica", "bold");
  doc.text(brand, margin, margin + 4);

  // Ensure title/date don't overlap the brand text
  const titleX = margin + doc.getTextWidth(brand) + 6;

  // Add title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 42, 68); // aviation-blue
  doc.text(options.title || "Flight Logbook", titleX, margin + 4);

  // Add date
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // text-secondary
  const exportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Exported: ${exportDate}`, titleX, margin + 9);

  // Prepare table data
  const headers = fields.map(f => f.name);
  const rows = options.entries.map(entry => {
    return fields.map(field => {
      const key = field.key || field.id;
      const value = entry.values[key];
      return value !== undefined && value !== null ? String(value) : "-";
    });
  });

  // Carried-forward totals, matching the paper-logbook convention of a
  // "Total this page" / "Total to date" row at the bottom of each page, so
  // the numbers stay meaningful when the export is printed or reviewed
  // page by page rather than as one continuous table.
  const numericColumnIndices = new Set(
    fields.map((f, i) => (f.type === "number" ? i : -1)).filter(i => i >= 0)
  );
  const labelColumnIndex = 0;
  const hasNumericColumns = numericColumnIndices.size > 0;

  let pageTotals = new Array(fields.length).fill(0);
  const cumulativeTotals = new Array(fields.length).fill(0);

  // Add table
  autoTable(doc, {
    head: [headers],
    body: rows,
    foot: hasNumericColumns
      ? [
          fields.map((_, i) => (i === labelColumnIndex ? "Total this page" : "")),
          fields.map((_, i) => (i === labelColumnIndex ? "Total to date" : "")),
        ]
      : undefined,
    showFoot: hasNumericColumns ? "everyPage" : "never",
    startY: margin + 14,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [15, 42, 68], // aviation-blue
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      textColor: [15, 23, 42], // text-primary
    },
    footStyles: {
      fillColor: [226, 232, 240], // border-default
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // bg-primary
    },
    columnStyles: generateColumnStyles(fields),
    // NOTE: didParseCell runs once during autotable's layout pass, before
    // pagination is known, so body cells there reflect the whole table
    // rather than a single page. didDrawCell instead fires once per cell
    // at the moment it is actually painted onto a given page, in draw
    // order — which is what per-page running totals need.
    didDrawCell: (data) => {
      if (data.section === "body" && numericColumnIndices.has(data.column.index)) {
        const raw = parseFloat(String(data.cell.raw ?? ""));
        const value = Number.isFinite(raw) ? raw : 0;
        pageTotals[data.column.index] += value;
        cumulativeTotals[data.column.index] += value;
      } else if (data.section === "foot" && numericColumnIndices.has(data.column.index)) {
        const isThisPageRow = data.row.index === 0;
        const total = isThisPageRow ? pageTotals[data.column.index] : cumulativeTotals[data.column.index];
        const text = total === 0 ? "-" : String(Math.round(total * 100) / 100);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42); // text-primary, matches footStyles
        doc.text(text, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2 + 1, {
          align: "right",
        });
      }
    },
    didDrawPage: () => {
      pageTotals = new Array(fields.length).fill(0);
    },
  });

  // Add footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // text-muted
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: "center" }
    );
    doc.text(
      "AutoFlightLog - Professional Flight Logbook",
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 5,
      { align: "right" }
    );
  }

  return doc;
}

/**
 * Generate column styles based on field types
 */
function generateColumnStyles(fields: typeof FIELD_CATALOG) {
  const styles: any = {};
  
  fields.forEach((field, index) => {
    const key = field.key || field.id;
    
    // Adjust column widths based on field type
    if (field.type === "date") {
      styles[index] = { cellWidth: 25 };
    } else if (field.type === "number") {
      styles[index] = { halign: "right", cellWidth: 20 };
    } else if (key === "remarks") {
      styles[index] = { cellWidth: "auto" };
    } else {
      styles[index] = { cellWidth: "auto" };
    }
  });
  
  return styles;
}

/**
 * Download PDF file
 */
export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}

/**
 * Get PDF as blob for email attachment
 */
export function getPDFBlob(doc: jsPDF): Blob {
  return doc.output("blob");
}

/**
 * Get PDF as base64 for email attachment
 */
export function getPDFBase64(doc: jsPDF): string {
  return doc.output("datauristring");
}

/**
 * Estimate how many entries fit on one PDF page
 */
export function estimateEntriesPerPage(fieldCount: number): number {
  // A4 landscape has roughly 180mm of usable height
  // Header takes ~20mm, each row ~6mm
  // Rough estimate: (180 - 20) / 6 = ~26 rows per page
  // But with more fields, rows might wrap, so reduce estimate
  const baseEntriesPerPage = 26;
  const reductionFactor = Math.max(0.5, 1 - (fieldCount - 5) * 0.05);
  return Math.floor(baseEntriesPerPage * reductionFactor);
}

