import { FIELD_CATALOG, FieldDefinition } from "@/types/fieldCatalog";
import { normalizeDurationMinutes } from "@/lib/logbook/timeUnits";

export interface CSVRow {
  [key: string]: string;
}

export interface ParsedCSV {
  headers: string[];
  rows: CSVRow[];
}

export interface ColumnMapping {
  csvColumn: string;
  fieldId: string | null;
  confidence: number; // 0-1, how confident we are in the mapping
}

export interface MappedEntry {
  values: Record<string, any>;
  warnings: string[];
  isDuplicate?: boolean;
  duplicateOf?: string;
}

/**
 * Parse CSV file content into headers and rows
 */
export function parseCSV(content: string): ParsedCSV {
  const records = parseCSVRecords(content);
  const nonEmpty = records.filter(fields => fields.some(f => f.trim() !== ""));

  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmpty[0].map(h => h.trim());
  const rows: CSVRow[] = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const values = nonEmpty[i];
    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse full CSV content into rows of raw fields, honoring quoted values
 * that span multiple lines and escaped quotes ("") inside quoted fields.
 */
function parseCSVRecords(content: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  let rowStarted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      rowStarted = true;
    } else if (char === ",") {
      row.push(current);
      current = "";
      rowStarted = true;
    } else if (char === "\r") {
      // skip; \n (or end of content) terminates the row
    } else if (char === "\n") {
      row.push(current);
      records.push(row);
      row = [];
      current = "";
      rowStarted = false;
    } else {
      current += char;
      rowStarted = true;
    }
  }

  if (rowStarted || current !== "" || row.length > 0) {
    row.push(current);
    records.push(row);
  }

  return records;
}

/**
 * Automatically map CSV columns to field IDs
 */
export function mapCSVColumns(headers: string[]): ColumnMapping[] {
  return headers.map(header => {
    const normalized = header.toLowerCase().trim();
    let bestMatch: { fieldId: string; confidence: number } | null = null;

    for (const field of FIELD_CATALOG) {
      const fieldName = field.name.toLowerCase();
      const fieldKey = (field.key || field.id).toLowerCase();
      
      // Exact match
      if (normalized === fieldName || normalized === fieldKey) {
        bestMatch = { fieldId: field.key || field.id, confidence: 1.0 };
        break;
      }

      // Partial match
      if (normalized.includes(fieldName) || fieldName.includes(normalized)) {
        const confidence = Math.max(
          normalized.length / fieldName.length,
          fieldName.length / normalized.length
        ) * 0.8;
        
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { fieldId: field.key || field.id, confidence };
        }
      }

      // Common aliases
      const aliases: Record<string, string[]> = {
        date: ["date", "flight date", "flightdate", "datum"],
        departure: ["dep", "from", "origin", "departure", "depart"],
        arrival: ["arr", "to", "dest", "destination", "arrival"],
        aircraft: ["ac", "aircraft", "acft", "aircraft type", "type"],
        registration: ["reg", "registration", "tail", "tail number"],
        totalTime: ["total", "total time", "flight time", "block time", "total flight time"],
        picTime: ["pic", "pic time", "captain time"],
        copilotTime: ["sic", "copilot", "co-pilot", "fo", "first officer"],
        landingsDay: ["day landings", "landings day", "day ldg"],
        landingsNight: ["night landings", "landings night", "night ldg"],
      };

      for (const [fieldId, aliasList] of Object.entries(aliases)) {
        if (aliasList.some(alias => normalized === alias || normalized.includes(alias))) {
          const confidence = 0.9;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { fieldId, confidence };
          }
        }
      }
    }

    return {
      csvColumn: header,
      fieldId: bestMatch?.fieldId || null,
      confidence: bestMatch?.confidence || 0,
    };
  });
}

/**
 * Convert CSV rows to logbook entries using column mappings
 */
export function mapRowsToEntries(
  rows: CSVRow[],
  mappings: ColumnMapping[]
): MappedEntry[] {
  return rows.map(row => {
    const values: Record<string, any> = {};
    const warnings: string[] = [];

    for (const mapping of mappings) {
      if (!mapping.fieldId) continue;

      const rawValue = row[mapping.csvColumn];
      if (!rawValue || rawValue.trim() === "") continue;

      const field = FIELD_CATALOG.find(f => f.key === mapping.fieldId || f.id === mapping.fieldId);
      if (!field) continue;

      // Convert value based on field type
      try {
        values[mapping.fieldId] = convertValue(rawValue, field);
      } catch (error) {
        warnings.push(`Invalid ${field.name}: ${rawValue}`);
      }
    }

    return { values, warnings };
  });
}

const DURATION_TIME_CATEGORIES = new Set(["time"]);

function isDurationField(field: FieldDefinition): boolean {
  return DURATION_TIME_CATEGORIES.has(field.category ?? "") || field.id === "syntheticTime";
}

function convertValue(value: string, field: FieldDefinition): any {
  const trimmed = value.trim();

  switch (field.type) {
    case "number":
      if (isDurationField(field)) {
        // Flight-duration fields are stored in minutes; auto-detect and
        // convert values imported from decimal-hours-based logbooks
        // (e.g. "1.5") instead of assuming every source uses minutes too.
        if (!/^-?[0-9]+([.,][0-9]+)?$/.test(trimmed)) throw new Error("Invalid number");
        return normalizeDurationMinutes(trimmed);
      }
      const num = parseFloat(trimmed);
      if (isNaN(num)) throw new Error("Invalid number");
      return num;

    case "date":
      // Try to parse various date formats
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) throw new Error("Invalid date");
      return date.toISOString().split("T")[0];

    case "checkbox":
      return ["true", "yes", "1", "x"].includes(trimmed.toLowerCase());

    default:
      return trimmed;
  }
}

