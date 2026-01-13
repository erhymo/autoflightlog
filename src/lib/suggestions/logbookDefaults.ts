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
