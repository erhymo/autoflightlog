import "server-only";

import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { entryFromDoc, entryToDoc } from "@/lib/logbook/entryDoc";
import { shiftIsoDate } from "@/lib/logbook/dateUtils";
import { getAdapter } from "@/lib/sync/adapters";
import { planSync } from "@/lib/sync/planSync";
import type { Connector, SyncSummary } from "@/types/integrations";
import type { LogbookEntry } from "@/types/domain";
import { readSecret, requireConnector, updateConnector } from "./connectorStore";

/** How far back an incremental sync re-fetches, to pick up late corrections in the source system. */
const INCREMENTAL_OVERLAP_DAYS = 14;
/** Consecutive failures before the connector is flagged as "error" in the UI. */
const FAILURES_BEFORE_ERROR_STATUS = 3;
const BATCH_SIZE = 400;

export interface RunSyncOptions {
  /** "cron" for the scheduled job, "manual" for the pilot's Sync-now button. */
  trigger: "cron" | "manual";
  /** Ignore lastSyncAt and fetch everything from syncSince (or all). */
  full?: boolean;
  fetchImpl?: typeof fetch;
}

export interface RunSyncResult {
  ok: boolean;
  summary?: SyncSummary;
  warnings: string[];
  error?: string;
  connector: Connector;
}

function computeSince(connector: Connector, full: boolean): string | undefined {
  if (full || !connector.lastSyncAt || connector.lastSyncStatus !== "ok") return connector.syncSince;
  const lastDate = connector.lastSyncAt.slice(0, 10);
  const overlap = shiftIsoDate(lastDate, -INCREMENTAL_OVERLAP_DAYS);
  if (connector.syncSince && connector.syncSince > overlap) return connector.syncSince;
  return overlap;
}

async function loadEntries(uid: string): Promise<LogbookEntry[]> {
  const snap = await getFirebaseAdmin().db.collection(`users/${uid}/entries`).get();
  return snap.docs.map((d) => entryFromDoc(d.data() as Record<string, unknown>));
}

async function loadIgnoredKeys(uid: string, connectorId: string): Promise<Set<string>> {
  const snap = await getFirebaseAdmin()
    .db.collection(`users/${uid}/syncIgnored`)
    .where("connectorId", "==", connectorId)
    .get();
  const keys = new Set<string>();
  for (const d of snap.docs) {
    const key = (d.data() as { externalKey?: unknown }).externalKey;
    if (typeof key === "string" && key) keys.add(key);
  }
  return keys;
}

async function writeEntries(uid: string, entries: LogbookEntry[]): Promise<void> {
  const { db } = getFirebaseAdmin();
  const col = db.collection(`users/${uid}/entries`);
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const e of entries.slice(i, i + BATCH_SIZE)) {
      batch.set(col.doc(e.id), entryToDoc(e));
    }
    await batch.commit();
  }
}

/**
 * Runs one sync for one connector end to end: fetch from the source
 * system via its adapter, plan the merge against the pilot's current
 * logbook, write the changes, and record the outcome on the connector.
 * Never throws for sync failures - they're recorded on the connector and
 * returned - so the cron loop can keep going for other pilots.
 */
export async function runConnectorSync(uid: string, connectorId: string, options: RunSyncOptions): Promise<RunSyncResult> {
  const startedAt = new Date();
  const nowIso = startedAt.toISOString();
  let connector = await requireConnector(uid, connectorId);

  try {
    const secret = await readSecret(uid, connector);
    const adapter = getAdapter(connector.provider);
    const since = computeSince(connector, options.full ?? false);

    const [records, existingEntries, ignoredExternalKeys] = await Promise.all([
      adapter.fetchFlights({ connector, secret, fetchImpl: options.fetchImpl }, { since }),
      loadEntries(uid),
      loadIgnoredKeys(uid, connectorId),
    ]);

    const plan = planSync({ connector, records, existingEntries, ignoredExternalKeys, nowIso });
    await writeEntries(uid, plan.writes);

    const next = new Date(startedAt.getTime() + connector.syncIntervalMinutes * 60_000).toISOString();
    await updateConnector(uid, connectorId, {
      lastSyncAttemptAt: nowIso,
      lastSyncAt: nowIso,
      lastSyncStatus: "ok",
      lastSyncError: null,
      lastSyncSummary: plan.summary,
      consecutiveFailures: 0,
      nextSyncAt: next,
      status: connector.status === "error" ? "active" : connector.status,
    });
    connector = await requireConnector(uid, connectorId);
    return { ok: true, summary: plan.summary, warnings: plan.warnings, connector };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failures = (connector.consecutiveFailures ?? 0) + 1;
    // Exponential backoff, capped at 8x the normal interval.
    const backoff = connector.syncIntervalMinutes * Math.min(2 ** (failures - 1), 8);
    const next = new Date(startedAt.getTime() + backoff * 60_000).toISOString();
    await updateConnector(uid, connectorId, {
      lastSyncAttemptAt: nowIso,
      lastSyncStatus: "error",
      lastSyncError: message.slice(0, 500),
      consecutiveFailures: failures,
      nextSyncAt: next,
      status: failures >= FAILURES_BEFORE_ERROR_STATUS && connector.status === "active" ? "error" : connector.status,
    });
    connector = await requireConnector(uid, connectorId);
    return { ok: false, warnings: [], error: message, connector };
  }
}

/**
 * Tests a connector's configuration and credentials against the live API
 * and records the outcome. Returns the adapter's sample so the UI can show
 * what the first flight looks like after field mapping.
 */
export async function testConnector(uid: string, connectorId: string, fetchImpl?: typeof fetch) {
  const connector = await requireConnector(uid, connectorId);
  const nowIso = new Date().toISOString();
  try {
    const secret = await readSecret(uid, connector);
    const result = await getAdapter(connector.provider).testConnection({ connector, secret, fetchImpl });
    await updateConnector(uid, connectorId, {
      lastTestAt: nowIso,
      lastTestError: null,
      status: connector.status === "error" ? "active" : connector.status,
    });
    return { ok: true as const, sampleCount: result.sampleCount, sample: result.sample, connector: await requireConnector(uid, connectorId) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateConnector(uid, connectorId, { lastTestAt: nowIso, lastTestError: message.slice(0, 500) });
    return { ok: false as const, error: message, connector: await requireConnector(uid, connectorId) };
  }
}

