import { LogbookEntry } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";

export interface ExportOptions {
  includeAllFields: boolean;
  selectedFields?: string[];
}

/**
 * Export logbook entries to CSV format
 */
export function exportToCSV(
  entries: LogbookEntry[],
  options: ExportOptions
): string {
  const fields = options.includeAllFields
    ? FIELD_CATALOG
    : FIELD_CATALOG.filter(f => options.selectedFields?.includes(f.key || f.id));

  // Create header row
  const headers = fields.map(f => f.name);
  const headerRow = headers.map(escapeCSVValue).join(",");

  // Create data rows
  const dataRows = entries.map(entry => {
    const values = fields.map(field => {
      const key = field.key || field.id;
      const value = entry.values[key];
      return value !== undefined && value !== null ? String(value) : "";
    });
    return values.map(escapeCSVValue).join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: string): string {
  if (!value) return "";
  
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  
  return value;
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Generate filename with current date
 */
export function generateExportFilename(extension: "csv" | "pdf"): string {
  const date = new Date().toISOString().split("T")[0];
  return `AutoFlightLog-export-${date}.${extension}`;
}

