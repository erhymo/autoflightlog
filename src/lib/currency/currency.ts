import { LogbookEntry } from "@/types/domain";

export interface WindowedRequirement {
  label: string;
  windowDays: number;
  requiredCount: number;
  actualCount: number;
  missingCount: number;
  isMet: boolean;
  expiresAt: Date | null;
}

export interface CurrencySummary {
  passengerLandings90: WindowedRequirement;
  nightPassengerLandings90: WindowedRequirement;
  ifrMinutes90: number;
  nightMinutes90: number;
  /** The aircraft type the figures were filtered to, or null for all entries. */
  aircraftType: string | null;
}

export interface CurrencyOptions {
  /**
   * Restrict to flights on this aircraft type (case-insensitive match on
   * the "aircraft" field). EASA FCL.060(b) recency is per type for
   * helicopters and per type/class for aeroplanes, so this is what makes
   * the figure meaningful for a pilot flying more than one type.
   */
  aircraftType?: string | null;
}

export function normalizeAircraftType(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

/** Distinct aircraft types in the logbook, most recently flown first. */
export function listAircraftTypes(entries: LogbookEntry[]): string[] {
  const lastFlown = new Map<string, number>();
  for (const e of entries) {
    const type = normalizeAircraftType(e.values?.aircraft);
    if (!type) continue;
    const d = getEntryDate(e);
    const t = d ? d.getTime() : 0;
    if ((lastFlown.get(type) ?? -1) < t) lastFlown.set(type, t);
  }
  return [...lastFlown.entries()].sort((a, b) => b[1] - a[1]).map(([type]) => type);
}

function getEntryDate(entry: LogbookEntry): Date | null {
  const raw = (entry.values?.date as string | undefined) || entry.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWindow(now: Date, windowDays: number): Date {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - windowDays);
  return cutoff;
}

function expandEvents(entries: LogbookEntry[], countKey: string): Date[] {
  const out: Date[] = [];
  for (const e of entries) {
    const d = getEntryDate(e);
    if (!d) continue;
    const values = (e.values ?? {}) as Record<string, unknown>;
    const count = Number(values[countKey]) || 0;
    for (let i = 0; i < count; i++) out.push(d);
  }
  return out;
}

function sumMinutesInWindow(entries: LogbookEntry[], minutesKey: string, windowDays: number, now: Date): number {
  const cutoff = startOfWindow(now, windowDays);
  return entries
    .filter((e) => {
      const d = getEntryDate(e);
      return d ? d >= cutoff : false;
    })
    .reduce((sum, e) => {
      const values = (e.values ?? {}) as Record<string, unknown>;
      return sum + (Number(values[minutesKey]) || 0);
    }, 0);
}

function computeRequirementFromEvents(
  events: Date[],
  windowDays: number,
  requiredCount: number,
  now: Date
): WindowedRequirement {
  const cutoff = startOfWindow(now, windowDays);
  const inWindow = events.filter((d) => d >= cutoff).sort((a, b) => b.getTime() - a.getTime());
  const actualCount = inWindow.length;
  const missingCount = Math.max(0, requiredCount - actualCount);
  const isMet = actualCount >= requiredCount;

  let expiresAt: Date | null = null;
  if (isMet) {
    const nthMostRecent = inWindow[requiredCount - 1];
    expiresAt = new Date(nthMostRecent);
    expiresAt.setDate(expiresAt.getDate() + windowDays);
  }

  return {
    label: `${requiredCount} in ${windowDays} days`,
    windowDays,
    requiredCount,
    actualCount,
    missingCount,
    isMet,
    expiresAt,
  };
}

/**
 * EASA-style recency helpers (FCL.060(b): 3 take-offs/landings in the
 * preceding 90 days to carry passengers, at least one of them at night for
 * night passenger flights).
 *
 * Notes:
 * - Pass `aircraftType` to get the per-type figure the rule actually asks
 *   for; without it, landings on every type are pooled.
 * - Counts landings from `landingsDay` and `landingsNight` fields.
 */
export function calculateCurrencySummary(
  allEntries: LogbookEntry[],
  now = new Date(),
  options: CurrencyOptions = {}
): CurrencySummary {
  const wanted = options.aircraftType ? normalizeAircraftType(options.aircraftType) : null;
  const entries = wanted ? allEntries.filter((e) => normalizeAircraftType(e.values?.aircraft) === wanted) : allEntries;

  const landingsAll = [
    ...expandEvents(entries, "landingsDay"),
    ...expandEvents(entries, "landingsNight"),
  ];
  const landingsNight = expandEvents(entries, "landingsNight");

  return {
    passengerLandings90: computeRequirementFromEvents(landingsAll, 90, 3, now),
    nightPassengerLandings90: computeRequirementFromEvents(landingsNight, 90, 1, now),
    ifrMinutes90: sumMinutesInWindow(entries, "ifrTime", 90, now),
    nightMinutes90: sumMinutesInWindow(entries, "nightTime", 90, now),
    aircraftType: wanted,
  };
}
