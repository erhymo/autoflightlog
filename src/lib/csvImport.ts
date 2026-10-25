import { FIELD_CATALOG, FieldDefinition } from "@/types/fieldCatalog";
import { normalizeDurationMinutes, parseTimeInput } from "@/lib/logbook/timeUnits";
import { parseClockTime, parseDateToIso } from "@/lib/logbook/dateUtils";

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
 * Common header spellings per field. Checked as whole-header matches (after
 * trimming punctuation), never as substrings - "to" must not turn
 * "Total time" into an arrival column.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "flight date", "flightdate", "datum", "dato"],
  departure: ["dep", "from", "origin", "departure", "depart", "departure place", "dep place", "fra", "avgang"],
  departureTime: ["dep time", "departure time", "off block", "off-block", "block off", "std", "atd", "out"],
  arrival: ["arr", "to", "dest", "destination", "arrival", "arrival place", "arr place", "til", "ankomst"],
  arrivalTime: ["arr time", "arrival time", "on block", "on-block", "block on", "sta", "ata", "in"],
  aircraft: ["ac", "aircraft", "acft", "aircraft type", "type", "model", "make model variant", "mark model variant"],
  registration: ["reg", "registration", "tail", "tail number", "reg no", "regnr"],
  pic: ["pic", "name of pic", "pic name", "captain", "commander"],
  totalTime: ["total", "total time", "flight time", "block time", "total flight time", "block", "total time of flight", "tt"],
  picTime: ["pic time", "captain time", "pilot in command", "pilot-in-command", "p1"],
  copilotTime: ["sic", "sic time", "copilot", "co-pilot", "copilot time", "co-pilot time", "fo", "first officer", "p2"],
  dualTime: ["dual", "dual time", "dual received"],
  instructorTime: ["instructor", "instr", "instructor time", "fi"],
  multiPilotTime: ["multi pilot", "multi-pilot", "multi pilot time", "mp"],
  nightTime: ["night", "night time"],
  ifrTime: ["ifr", "ifr time", "instrument", "instrument time"],
  landingsDay: ["day landings", "landings day", "day ldg", "ldg day", "landings (day)", "day"],
  landingsNight: ["night landings", "landings night", "night ldg", "ldg night", "landings (night)"],
  remarks: ["remarks", "remark", "notes", "comment", "comments", "merknader"],
};

/** Lower-cases and strips units/punctuation so "Total Time (min)" and "total_time" compare equal to "total time". */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\((?:min|mins|minutes|h|hrs|hours|hh:mm)\)/g, " ")
    .replace(/[_\-.:/]+/g, " ")
    .replace(/[^a-z0-9() ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Automatically map CSV columns to field IDs.
 *
 * Match order: exact field name/id (1.0), exact alias (0.9), then a
 * contained field name as a weak fallback (<= 0.8) - the fallback only
 * ever applies when nothing matched exactly, so short aliases can't hijack
 * longer headers.
 */
export function mapCSVColumns(headers: string[]): ColumnMapping[] {
  const aliasIndex = new Map<string, string>();
  for (const [fieldId, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const key = normalizeHeader(alias);
      // First field listed wins if two fields share an alias (none do today).
      if (!aliasIndex.has(key)) aliasIndex.set(key, fieldId);
    }
  }

  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return { csvColumn: header, fieldId: null, confidence: 0 };

    for (const field of FIELD_CATALOG) {
      const id = field.key || field.id;
      if (normalized === normalizeHeader(field.name) || normalized === normalizeHeader(id) || normalized === normalizeHeader(field.label ?? "")) {
        return { csvColumn: header, fieldId: id, confidence: 1.0 };
      }
    }

    const aliased = aliasIndex.get(normalized);
    if (aliased) return { csvColumn: header, fieldId: aliased, confidence: 0.9 };

    let bestMatch: { fieldId: string; confidence: number } | null = null;
    for (const field of FIELD_CATALOG) {
      const fieldName = normalizeHeader(field.name);
      if (fieldName.length < 4) continue;
      if (normalized.includes(fieldName) || fieldName.includes(normalized)) {
        const confidence = Math.min(normalized.length / fieldName.length, fieldName.length / normalized.length) * 0.8;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { fieldId: field.key || field.id, confidence };
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
      } catch {
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
        if (!/^-?[0-9]+(?::[0-9]{1,2}|[.,][0-9]+)?$/.test(trimmed)) throw new Error("Invalid number");
        return trimmed.includes(":") ? parseTimeInput(trimmed) : normalizeDurationMinutes(trimmed);
      }
      const num = parseFloat(trimmed);
      if (isNaN(num)) throw new Error("Invalid number");
      return num;

    case "date": {
      // Shared parser: handles ISO, 15.01.2024, 15/01/2024 etc. without the
      // one-day time-zone shift that `new Date(...).toISOString()` causes.
      const iso = parseDateToIso(trimmed);
      if (!iso) throw new Error("Invalid date");
      return iso;
    }

    case "time": {
      const clock = parseClockTime(trimmed);
      if (!clock) throw new Error("Invalid time");
      return clock;
    }

    case "checkbox":
      return ["true", "yes", "1", "x"].includes(trimmed.toLowerCase());

    default:
      return trimmed;
  }
}

