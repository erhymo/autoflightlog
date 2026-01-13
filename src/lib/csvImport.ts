import { FIELD_CATALOG } from "@/types/fieldCatalog";

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
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
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
        values[mapping.fieldId] = convertValue(rawValue, field.type);
      } catch (error) {
        warnings.push(`Invalid ${field.name}: ${rawValue}`);
      }
    }

    return { values, warnings };
  });
}

function convertValue(value: string, type: string): any {
  const trimmed = value.trim();

  switch (type) {
    case "number":
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

