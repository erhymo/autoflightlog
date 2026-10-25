import { FIELD_CATALOG } from "@/types/fieldCatalog";
import type { DurationFormat, FlightRecord } from "@/types/integrations";
import { isDurationFieldId, normalizeDurationMinutes, parseTimeInput } from "@/lib/logbook/timeUnits";
import { parseClockTime, parseDateToIso } from "@/lib/logbook/dateUtils";

const FIELD_BY_ID = new Map(FIELD_CATALOG.map((f) => [f.key || f.id, f]));

/** Text fields the app keeps in their original case (everything else is upper-cased, like the edit form does). */
const KEEP_CASE_FIELDS = new Set(["remarks"]);

export interface NormalizedFlight {
  externalKey: string;
  /** Typed values keyed by EASA field id; only fields that parsed cleanly. */
  values: Record<string, string | number>;
  warnings: string[];
}

function parseDuration(raw: unknown, format: DurationFormat): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (format === "hours_decimal") return Math.round(raw * 60);
    if (format === "minutes") return Math.round(raw);
    // "auto"/"hhmm" with a bare number: a fractional number can only be
    // decimal hours, a whole one is minutes (same rule as CSV import).
    return normalizeDurationMinutes(raw);
  }
  const s = String(raw).trim();
  if (!s) return null;
  switch (format) {
    case "minutes": {
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    case "hours_decimal": {
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? Math.round(n * 60) : null;
    }
    case "hhmm":
    case "auto":
    default: {
      if (!/^-?\d+(?::\d{1,2}|[.,]\d+)?$/.test(s)) return null;
      return parseTimeInput(s);
    }
  }
}

/**
 * Coerces a raw adapter record into the exact shapes the rest of the app
 * stores: ISO dates, "HH:MM" clock times, whole-minute durations, numeric
 * counts, upper-cased codes. Unknown field ids are dropped; values that
 * can't be parsed are dropped with a warning rather than failing the whole
 * flight, so one odd column never blocks a sync.
 */
export function normalizeFlightRecord(
  record: FlightRecord,
  options: { durationFormat?: DurationFormat } = {}
): NormalizedFlight {
  const durationFormat = options.durationFormat ?? "auto";
  const values: Record<string, string | number> = {};
  const warnings: string[] = [];

  for (const [fieldId, raw] of Object.entries(record.values ?? {})) {
    const def = FIELD_BY_ID.get(fieldId);
    if (!def) {
      warnings.push(`Unknown field "${fieldId}" ignored`);
      continue;
    }
    if (raw === null || raw === undefined || raw === "") continue;

    switch (def.type) {
      case "date": {
        const iso = parseDateToIso(raw);
        if (iso) values[fieldId] = iso;
        else warnings.push(`Invalid date for ${fieldId}: ${String(raw)}`);
        break;
      }
      case "time": {
        const t = parseClockTime(raw);
        if (t) values[fieldId] = t;
        else warnings.push(`Invalid time for ${fieldId}: ${String(raw)}`);
        break;
      }
      case "number": {
        if (isDurationFieldId(fieldId)) {
          const minutes = parseDuration(raw, durationFormat);
          if (minutes !== null) values[fieldId] = minutes;
          else warnings.push(`Invalid duration for ${fieldId}: ${String(raw)}`);
        } else {
          const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
          if (Number.isFinite(n)) values[fieldId] = n;
          else warnings.push(`Invalid number for ${fieldId}: ${String(raw)}`);
        }
        break;
      }
      default: {
        const text = String(raw).trim();
        if (!text) break;
        values[fieldId] = KEEP_CASE_FIELDS.has(fieldId) ? text : text.toUpperCase();
      }
    }
  }

  return { externalKey: String(record.externalKey ?? "").trim(), values, warnings };
}

/**
 * Reads a dot-path like "data.flights[0].dep.icao" out of a JSON value.
 * Returns undefined for any missing segment instead of throwing.
 */
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((s) => s.length > 0);
  let current: unknown = source;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}
