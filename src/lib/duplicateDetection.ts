import type { LogbookEntry } from "@/types/domain";

/**
 * Finds an existing entry that looks like the same flight (same date,
 * departure, and arrival), used to warn before double-logging a flight —
 * whether typed in manually or imported from CSV.
 */
export function findDuplicateEntry(
  existingEntries: LogbookEntry[],
  values: Record<string, any>,
  excludeId?: string
): LogbookEntry | undefined {
  if (!values.date || !values.departure || !values.arrival) return undefined;
  return existingEntries.find(
    (existing) =>
      existing.id !== excludeId &&
      existing.values.date === values.date &&
      existing.values.departure === values.departure &&
      existing.values.arrival === values.arrival
  );
}
