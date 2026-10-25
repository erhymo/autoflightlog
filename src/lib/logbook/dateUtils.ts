/**
 * Date/time parsing shared by CSV import and API sync. Everything the app
 * stores is a plain calendar date ("YYYY-MM-DD") or clock time ("HH:MM"),
 * never a timestamp - a flight logged on the 15th is on the 15th no matter
 * which time zone the browser or server happens to run in. The built-in
 * `new Date(string)` is deliberately avoided for non-ISO input: it parses
 * "15 Jan 2024" as *local* midnight, and toISOString() then yields the
 * 14th anywhere east of UTC (including Norway).
 */

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;
const DMY_DOTTED = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const YMD_SLASHED = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const COMPACT = /^(\d{4})(\d{2})(\d{2})$/;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): string | null {
  return isValidYmd(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}

/**
 * Parses a date in any of the common logbook formats to "YYYY-MM-DD", or
 * null if it can't be understood. Slashed dates are read as day/month/year
 * (European) unless the first number can only be a month.
 */
export function parseDateToIso(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Epoch milliseconds (or seconds, if it's small enough to be one).
    const ms = raw < 1e11 ? raw * 1000 : raw;
    const d = new Date(ms);
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(ISO_DATE_PREFIX);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(DMY_DOTTED);
  if (m) return toIso(Number(m[3]), Number(m[2]), Number(m[1]));

  m = s.match(YMD_SLASHED);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(SLASHED);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    // "13/01/2024" can only be D/M; "01/13/2024" can only be M/D.
    if (a > 12 && b <= 12) return toIso(y, b, a);
    if (b > 12 && a <= 12) return toIso(y, a, b);
    return toIso(y, b, a);
  }

  m = s.match(COMPACT);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  // Last resort for formats like "15 Jan 2024": let the engine parse it, but
  // read back the *local* components so the calendar date is preserved.
  const fallback = new Date(s);
  if (Number.isNaN(fallback.getTime())) return null;
  return toIso(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate());
}

const HHMM = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const COMPACT_TIME = /^(\d{2})(\d{2})$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T\s](\d{2}):(\d{2})/;

/**
 * Parses a clock time to "HH:MM". Accepts "7:05", "07:05", "07:05:30",
 * "0705", and ISO datetimes (whose time-of-day is taken as written, i.e.
 * in whatever zone the source wrote it - usually UTC for flight ops data).
 */
export function parseClockTime(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(HHMM);
  if (!m) m = s.match(ISO_DATETIME);
  if (!m) m = s.match(COMPACT_TIME);
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

/** Formats an ISO date for an API "since" parameter. */
export function formatSince(isoDate: string, format: "date" | "datetime" = "date"): string {
  return format === "datetime" ? `${isoDate}T00:00:00Z` : isoDate;
}

/** Returns the ISO date `days` days before the given ISO date. */
export function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function todayIso(now = new Date()): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}
