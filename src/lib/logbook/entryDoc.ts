import type { LogbookEntry } from "@/types/domain";

/**
 * Firestore <-> LogbookEntry serialization shared by the client SDK repo
 * (src/lib/repo/firestoreRepos.ts) and the server-side sync engine
 * (src/lib/sync/server), so both always write the exact same document
 * shape.
 */

function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  const maybeTs = value as { toDate?: () => Date } | undefined;
  if (maybeTs && typeof maybeTs.toDate === "function") return maybeTs.toDate().toISOString();
  return new Date(0).toISOString();
}

export function entryFromDoc(data: Record<string, unknown>): LogbookEntry {
  return {
    ...(data as unknown as LogbookEntry),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export function entryToDoc(e: LogbookEntry): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: e.id,
    templateId: e.templateId,
    values: e.values,
    source: {
      // Firestore does not allow `undefined` field values.
      system: e.source?.system || "unknown",
      ...(e.source?.connectorId ? { connectorId: e.source.connectorId } : {}),
      ...(e.source?.externalKey ? { externalKey: e.source.externalKey } : {}),
    },
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
  if (e.manualOverrides) base.manualOverrides = e.manualOverrides;
  return base;
}
