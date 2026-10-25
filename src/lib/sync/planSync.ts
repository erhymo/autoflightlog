import type { LogbookEntry } from "@/types/domain";
import type { Connector, FlightRecord, SyncSummary } from "@/types/integrations";
import { normalizeFlightRecord } from "./flightRecord";

export const SYNC_SOURCE_SYSTEM = "api_sync";

/** FNV-1a 32-bit, hex. Good enough to shorten long/odd external keys deterministically. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Deterministic Firestore document id for a synced flight, so re-running a
 * sync upserts the same document instead of creating duplicates. Firestore
 * ids must avoid "/" and stay short, so keys that aren't already simple
 * identifiers are hashed.
 */
export function syncedEntryId(connectorId: string, externalKey: string): string {
  const key = externalKey.trim();
  const simple = /^[A-Za-z0-9_-]{1,48}$/.test(key) ? key : `h${fnv1a(key)}_${key.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24)}`;
  return `sync_${connectorId}_${simple}`;
}

export function isSyncedEntry(entry: LogbookEntry): boolean {
  return entry.source?.system === SYNC_SOURCE_SYSTEM && !!entry.source?.externalKey;
}

function routeKey(values: Record<string, unknown>): string | null {
  const date = values.date;
  const dep = values.departure;
  const arr = values.arrival;
  if (!date || !dep || !arr) return null;
  return `${String(date)}|${String(dep).trim().toUpperCase()}|${String(arr).trim().toUpperCase()}`;
}

function shallowEqualValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export interface PlanSyncInput {
  connector: Connector;
  records: FlightRecord[];
  /** All of the pilot's current entries (synced and manual). */
  existingEntries: LogbookEntry[];
  /** External keys (for this connector) the pilot deleted after sync; never recreate these. */
  ignoredExternalKeys: Set<string>;
  nowIso: string;
}

export interface PlanSyncResult {
  /** Entries to upsert (full documents). */
  writes: LogbookEntry[];
  summary: SyncSummary;
  warnings: string[];
}

/**
 * Pure planning step of a sync: given what the API returned and what the
 * logbook already holds, decide exactly which documents to write.
 *
 * Rules, in order:
 * 1. Records without a usable externalKey or date are dropped (invalid).
 * 2. Records on/before the connector's syncSince floor are dropped (silently).
 * 3. If the pilot previously deleted this synced entry, leave it deleted (ignored).
 * 4. If the entry already exists as a synced entry, update it - but never
 *    overwrite a field the pilot has edited by hand (manualOverrides).
 * 5. Otherwise, if a *manual* entry exists for the same date + departure +
 *    arrival, adopt it: link it to the external key and only fill in fields
 *    it was missing. The pilot's own values always win (linked).
 * 6. Otherwise create a new entry (created).
 */
export function planSync(input: PlanSyncInput): PlanSyncResult {
  const { connector, records, existingEntries, ignoredExternalKeys, nowIso } = input;
  const summary: SyncSummary = { fetched: records.length, created: 0, linked: 0, updated: 0, unchanged: 0, ignored: 0, invalid: 0 };
  const warnings: string[] = [];
  const writes: LogbookEntry[] = [];

  const byId = new Map(existingEntries.map((e) => [e.id, e]));
  // Adopted manual entries keep their original id, so look synced entries
  // up by external key first and only then by the deterministic id.
  const byKey = indexSyncedEntriesByKey(existingEntries, connector.id);

  // Manual entries indexed by date|dep|arr, for adoption. Only entries that
  // aren't already tied to some external system are candidates.
  const manualByRoute = new Map<string, LogbookEntry[]>();
  for (const e of existingEntries) {
    if (isSyncedEntry(e)) continue;
    const key = routeKey(e.values ?? {});
    if (!key) continue;
    const list = manualByRoute.get(key) ?? [];
    list.push(e);
    manualByRoute.set(key, list);
  }
  const adopted = new Set<string>();
  const seenKeys = new Set<string>();

  for (const record of records) {
    const normalized = normalizeFlightRecord(record, { durationFormat: connector.config?.durationFormat });
    for (const w of normalized.warnings) warnings.push(`${normalized.externalKey || "?"}: ${w}`);

    if (!normalized.externalKey || typeof normalized.values.date !== "string") {
      summary.invalid++;
      continue;
    }
    if (seenKeys.has(normalized.externalKey)) {
      // Same flight twice in one response: keep the first.
      continue;
    }
    seenKeys.add(normalized.externalKey);

    if (connector.syncSince && normalized.values.date < connector.syncSince) {
      summary.fetched--; // Not counted as fetched: it's outside the window the pilot asked for.
      continue;
    }

    if (ignoredExternalKeys.has(normalized.externalKey)) {
      summary.ignored++;
      continue;
    }
    const id = syncedEntryId(connector.id, normalized.externalKey);

    const source: LogbookEntry["source"] = {
      system: SYNC_SOURCE_SYSTEM,
      connectorId: connector.id,
      externalKey: normalized.externalKey,
    };

    const existing = byKey.get(normalized.externalKey) ?? byId.get(id);
    if (existing) {
      const overrides = existing.manualOverrides ?? {};
      const nextValues: Record<string, unknown> = { ...existing.values };
      for (const [k, v] of Object.entries(normalized.values)) {
        if (overrides[k]) continue;
        nextValues[k] = v;
      }
      if (shallowEqualValues(nextValues, existing.values ?? {})) {
        summary.unchanged++;
        continue;
      }
      writes.push({ ...existing, values: nextValues, source, updatedAt: nowIso });
      summary.updated++;
      continue;
    }

    const route = routeKey(normalized.values);
    const candidates = route ? manualByRoute.get(route) ?? [] : [];
    const manual = candidates.find((c) => !adopted.has(c.id));
    if (manual) {
      adopted.add(manual.id);
      const nextValues: Record<string, unknown> = { ...manual.values };
      // The pilot typed everything on a manual entry, so treat every
      // non-empty field as a manual override from now on.
      const overrides: Record<string, boolean> = { ...(manual.manualOverrides ?? {}) };
      for (const [k, v] of Object.entries(manual.values ?? {})) {
        if (v !== undefined && v !== null && v !== "") overrides[k] = true;
      }
      for (const [k, v] of Object.entries(normalized.values)) {
        if (overrides[k]) continue;
        nextValues[k] = v;
      }
      // The linked entry keeps its own document id (the pilot may have it
      // open, and a rename would just be churn); the externalKey in source
      // is what ties it to the API from now on.
      writes.push({ ...manual, values: nextValues, manualOverrides: overrides, source, updatedAt: nowIso });
      summary.linked++;
      continue;
    }

    writes.push({
      id,
      templateId: "tmpl_easa_default",
      values: normalized.values,
      source,
      manualOverrides: {},
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    summary.created++;
  }

  return { writes, summary, warnings };
}

/**
 * Finds the synced entry (if any) that a given external key already maps
 * to, including adopted manual entries whose id differs from the
 * deterministic one.
 */
export function indexSyncedEntriesByKey(entries: LogbookEntry[], connectorId: string): Map<string, LogbookEntry> {
  const map = new Map<string, LogbookEntry>();
  for (const e of entries) {
    if (e.source?.system !== SYNC_SOURCE_SYSTEM || e.source.connectorId !== connectorId || !e.source.externalKey) continue;
    map.set(e.source.externalKey, e);
  }
  return map;
}
