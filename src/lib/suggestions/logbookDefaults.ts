import { LogbookEntry } from "@/types/domain";

type Stats = { count: number; lastSeen: string };

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length ? v : null;
}

function getLastSeenTs(entry: LogbookEntry): string {
  // All timestamps are stored as ISO strings in this app.
  return entry.updatedAt || entry.createdAt || "";
}

export function getFieldSuggestions(
  entries: LogbookEntry[],
  fieldKey: string,
  limit = 8
): string[] {
  const stats = new Map<string, Stats>();

  for (const e of entries) {
    const value = asNonEmptyString((e.values as any)?.[fieldKey]);
    if (!value) continue;
    const lastSeen = getLastSeenTs(e);

    const existing = stats.get(value);
    if (!existing) {
      stats.set(value, { count: 1, lastSeen });
    } else {
      existing.count += 1;
      if (lastSeen && lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
    }
  }

  const ranked = [...stats.entries()]
    .sort((a, b) => {
      const ac = a[1].count;
      const bc = b[1].count;
      if (ac !== bc) return bc - ac;
      return (b[1].lastSeen || "").localeCompare(a[1].lastSeen || "");
    })
    .slice(0, limit)
    .map(([value]) => value);

  // Seed common helicopter type for empty/new datasets.
  if (fieldKey === "aircraft" && !ranked.includes("AW169")) {
    return ["AW169", ...ranked].slice(0, limit);
  }

  return ranked;
}

/**
 * Arrival suggestions ranked by places actually flown to from the given
 * departure before, falling back to the general most-used list once the
 * route-specific matches run out - the pilot's own history already
 * encodes which routes are common, so use it instead of a flat list.
 */
export function getRouteAwareArrivalSuggestions(
  entries: LogbookEntry[],
  departure: string,
  limit = 8
): string[] {
  const dep = departure.trim().toUpperCase();
  if (!dep) return getFieldSuggestions(entries, "arrival", limit);

  const matchingDeparture = entries.filter(
    (e) => String((e.values as any)?.departure ?? "").trim().toUpperCase() === dep
  );
  const fromRoute = getFieldSuggestions(matchingDeparture, "arrival", limit);
  if (fromRoute.length >= limit) return fromRoute;

  const general = getFieldSuggestions(entries, "arrival", limit);
  const merged = [...fromRoute];
  for (const candidate of general) {
    if (merged.length >= limit) break;
    if (!merged.includes(candidate)) merged.push(candidate);
  }
  return merged;
}

export function findMostRecentEntryForAircraft(
  entries: LogbookEntry[],
  aircraftRaw: unknown
): LogbookEntry | null {
  if (typeof aircraftRaw !== "string") return null;
  const target = aircraftRaw.trim().toUpperCase();
  if (!target) return null;

  let best: LogbookEntry | null = null;
  let bestTimestamp = "";

  for (const entry of entries) {
    const ac = String((entry.values as any)?.aircraft ?? "").trim().toUpperCase();
    if (!ac || ac !== target) continue;

    const ts = entry.updatedAt || entry.createdAt || "";
    if (!best || ts > bestTimestamp) {
      best = entry;
      bestTimestamp = ts;
    }
  }

  return best;
}

/**
 * The "pilot function time" fields (PIC / Co-pilot / Dual / Instructor) plus
 * Multi-pilot / Turbine / Single-pilot SE / ME - the fields that together
 * say *how* a flight's Total Time should be credited. Which of these apply
 * depends on the pilot's crew position on a given flight (e.g. PIC vs
 * co-pilot), which isn't tracked as its own field - it's implied by which
 * of these mirrors Total Time.
 */
const ROLE_TIME_FIELD_KEYS = [
  "picTime",
  "copilotTime",
  "dualTime",
  "instructorTime",
  "multiPilotTime",
  "turbineTime",
  "singlePilotSeTime",
  "singlePilotMeTime",
];

/**
 * Which role-time fields mirrored Total Time on the most recent flight
 * logged with this aircraft type - e.g. if the pilot was PIC last time,
 * "picTime" is in the returned set; if co-pilot, "copilotTime" is instead.
 * A pilot's crew position typically stays the same across a stretch of
 * flights (until e.g. a type-rating or role change), so this lets a new
 * entry default to the same fields instead of re-typing which one applies
 * on every single flight - see the Total Time mirroring in the edit-entry
 * page. Falls back to ["picTime"] when there's no prior flight on this
 * aircraft type to learn from yet.
 */
export function getMirroredRoleFieldKeys(entries: LogbookEntry[], aircraftRaw: unknown): string[] {
  const source = findMostRecentEntryForAircraft(entries, aircraftRaw);
  if (!source) return ["picTime"];

  const total = Number((source.values as any)?.totalTime);
  if (!Number.isFinite(total) || total <= 0) return ["picTime"];

  const matched = ROLE_TIME_FIELD_KEYS.filter((key) => {
    const v = Number((source.values as any)?.[key]);
    return Number.isFinite(v) && v === total;
  });

  return matched.length > 0 ? matched : ["picTime"];
}

function getMostRecentEntry(entries: LogbookEntry[]): LogbookEntry | null {
  let best: LogbookEntry | null = null;
  for (const e of entries) {
    if (!best) {
      best = e;
      continue;
    }
    if (getLastSeenTs(e) > getLastSeenTs(best)) best = e;
  }
  return best;
}

function defaultFromRecentOrCommon(entries: LogbookEntry[], fieldKey: string): string | undefined {
  const recent = getMostRecentEntry(entries);
  const fromRecent = recent ? asNonEmptyString((recent.values as any)?.[fieldKey]) : null;
  if (fromRecent) return fromRecent;

  const [mostCommon] = getFieldSuggestions(entries, fieldKey, 1);
  return mostCommon;
}

export function getPrefillValuesForNewEntry(entries: LogbookEntry[]) {
  const today = new Date().toISOString().slice(0, 10);

  const aircraft = defaultFromRecentOrCommon(entries, "aircraft") || "AW169";
  const registration = defaultFromRecentOrCommon(entries, "registration");
  const departure = defaultFromRecentOrCommon(entries, "departure") || "ENOS";
  const arrival = defaultFromRecentOrCommon(entries, "arrival") || "ENBR";

  return {
    date: today,
    aircraft,
    ...(registration ? { registration } : {}),
    departure,
    arrival,
  };
}
