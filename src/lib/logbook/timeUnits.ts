/**
 * All flight-duration fields in this app (Total Time, PIC Time, Night
 * Time, IFR Time, etc.) are stored in whole minutes - never decimal
 * hours. This keeps a single canonical unit across manual entry, CSV
 * import/export, the dashboard, and the EASA currency calculations,
 * instead of some parts of the app assuming hours and others minutes.
 */

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
