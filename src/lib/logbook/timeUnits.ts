/**
 * All flight-duration fields in this app (Total Time, PIC Time, Night
 * Time, IFR Time, etc.) are stored in whole minutes - never decimal
 * hours. This keeps a single canonical unit across manual entry, CSV
 * import/export, the dashboard, and the EASA currency calculations,
 * instead of some parts of the app assuming hours and others minutes.
 */

import { FIELD_CATALOG } from "@/types/fieldCatalog";
import type { LogbookEntry } from "@/types/domain";

const DURATION_FIELD_IDS = new Set(
  FIELD_CATALOG.filter((f) => f.category === "time" || f.id === "syntheticTime").map(
    (f) => f.key || f.id
  )
);

/** True for whole-minute duration fields (Total Time, PIC Time, Night Time, ...). */
export function isDurationFieldId(fieldId: string): boolean {
  return DURATION_FIELD_IDS.has(fieldId);
}

/** Parses an "HH:MM" clock time (departure/arrival time-of-day) to minutes since midnight. */
export function parseClockTimeToMinutes(value: unknown): number | null {
  if (!value) return null;
  const str = String(value);
  const [h, m] = str.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** Computes flight duration in minutes from departure/arrival clock times, handling a midnight crossing. */
export function computeTotalTimeMinutes(departureTime: unknown, arrivalTime: unknown): number | null {
  const dep = parseClockTimeToMinutes(departureTime);
  const arr = parseClockTimeToMinutes(arrivalTime);
  if (dep == null || arr == null) return null;

  let diff = arr - dep;
  if (diff < 0) diff += 24 * 60; // Crossed midnight: assume same day, wrapped.
  return Math.round(diff);
}

/**
 * Normalizes a duration value to whole minutes, auto-detecting values
 * that were typed or imported as decimal hours (e.g. "1.5" or the
 * Norwegian "1,5") - a very common habit and the convention used by
 * some other logbook software and paper EASA forms. A value with no
 * decimal separator is assumed to already be minutes (e.g. "90").
 */
export function normalizeDurationMinutes(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const str = String(raw).trim().replace(",", ".");
  if (!str) return 0;

  const n = parseFloat(str);
  if (!Number.isFinite(n)) return 0;

  const looksLikeDecimalHours = str.includes(".");
  return looksLikeDecimalHours ? Math.round(n * 60) : Math.round(n);
}

/**
 * Parses duration input in the pilot's preferred "H:MM" format (e.g. "1:21"
 * for 1 hour 21 minutes), which is how EASA logbook duration columns are
 * conventionally written. Falls back to normalizeDurationMinutes for
 * pasted/legacy-style input with no colon (plain minutes, or decimal hours
 * typed out of habit), so those keep working too.
 */
export function parseTimeInput(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const str = String(raw).trim();
  if (!str) return 0;

  const colonMatch = str.match(/^(-?\d+):(\d{1,2})$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    const sign = hours < 0 ? -1 : 1;
    return sign * (Math.abs(hours) * 60 + minutes);
  }

  return normalizeDurationMinutes(str);
}

/**
 * Repairs a logbook entry's duration fields that still hold a pre-fix
 * decimal-hours value (e.g. 0.7 meaning 42 minutes) instead of whole
 * minutes. Every code path since normalizeDurationMinutes was introduced
 * only ever writes whole minutes, so a stored value that is still
 * fractional can only be a leftover from before that fix - see the
 * "store flight durations in minutes, not decimal hours" commit, which
 * intentionally left already-saved entries unmigrated. Returns the
 * possibly-updated entry plus whether anything changed, so a caller can
 * persist the repair once and skip it on every later load.
 */
export function migrateLegacyDurationFields(entry: LogbookEntry): { entry: LogbookEntry; changed: boolean } {
  const values = entry.values ?? {};
  let changed = false;
  const nextValues: Record<string, any> = { ...values };

  for (const key of Object.keys(values)) {
    if (!isDurationFieldId(key)) continue;
    const raw = values[key];
    if (raw === "" || raw === null || raw === undefined) continue;

    const numeric = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (!Number.isFinite(numeric) || Number.isInteger(numeric)) continue;

    nextValues[key] = normalizeDurationMinutes(raw);
    changed = true;
  }

  if (!changed) return { entry, changed: false };
  return { entry: { ...entry, values: nextValues }, changed: true };
}

/** Formats a whole-minute duration as "HH:MM", tolerating stray float noise or bad data defensively. */
export function formatMinutesToHHMM(minutes: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}
