import { buildDefaultEasaTemplate } from "@/lib/defaults/easaTemplate";
import { buildDefaultView } from "@/lib/defaults/defaultView";
import { getFirebaseClient } from "@/lib/firebase/client";
import type { LogbookEntry, Template, ViewDefinition } from "@/types/domain";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";

function requireUid(): string {
  const { auth } = getFirebaseClient();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  return uid;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  const ts = value as Timestamp | undefined;
  if (ts && typeof (ts as any).toDate === "function") return (ts as any).toDate();
  return new Date(0);
}

function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  const ts = value as Timestamp | undefined;
  if (ts && typeof (ts as any).toDate === "function") return (ts as any).toDate().toISOString();
  return new Date(0).toISOString();
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function templateFromDoc(data: any): Template {
  return {
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Template;
}

function viewFromDoc(data: any): ViewDefinition {
  return {
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as ViewDefinition;
}

function entryFromDoc(data: any): LogbookEntry {
  return {
    ...data,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  } as LogbookEntry;
}

function entryToDoc(e: LogbookEntry): Record<string, any> {
  const base: Record<string, any> = {
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

export async function ensureDefaultSetup() {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const nowIso = new Date().toISOString();

  const templateRef = doc(db, `users/${uid}/templates/tmpl_easa_default`);
  const viewRef = doc(db, `users/${uid}/views/view_default`);
  const flagsRef = doc(db, `users/${uid}/flags/main`);

  const [tmplSnap, viewSnap, flagsSnap] = await Promise.all([
    getDoc(templateRef),
    getDoc(viewRef),
    getDoc(flagsRef),
  ]);

  const writes: Promise<unknown>[] = [];

  if (!tmplSnap.exists()) {
    const tmpl = buildDefaultEasaTemplate(nowIso);
    writes.push(setDoc(templateRef, tmpl as any));
  }

  if (!viewSnap.exists()) {
    const v = buildDefaultView(nowIso, "tmpl_easa_default");
    writes.push(setDoc(viewRef, v as any));
  } else {
    const data: any = viewSnap.data();
    if (!Array.isArray(data?.columns) || data.columns.length === 0) {
      const v = buildDefaultView(nowIso, "tmpl_easa_default");
      writes.push(
        setDoc(
          viewRef,
          {
            columns: v.columns,
            visibleFields: v.visibleFields,
            templateId: v.templateId,
            updatedAt: new Date(nowIso),
          },
          { merge: true }
        )
      );
    }
  }

  const flags: any = flagsSnap.exists() ? flagsSnap.data() : null;
  if (!flagsSnap.exists() || !flags?.setupComplete) {
    writes.push(setDoc(flagsRef, { setupComplete: true }, { merge: true }));
  }

  await Promise.all(writes);
}

export async function getTemplate(templateId: string): Promise<Template | null> {
  if (templateId === "tmpl_easa_default") await ensureDefaultSetup();
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snap = await getDoc(doc(db, `users/${uid}/templates/${templateId}`));
  return snap.exists() ? templateFromDoc(snap.data()) : null;
}

export async function upsertTemplate(t: Template) {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/templates/${t.id}`), t as any);
}

export async function getView(viewId: string): Promise<ViewDefinition | null> {
  if (viewId === "view_default") await ensureDefaultSetup();
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snap = await getDoc(doc(db, `users/${uid}/views/${viewId}`));
  return snap.exists() ? viewFromDoc(snap.data()) : null;
}

export async function upsertView(v: ViewDefinition) {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/views/${v.id}`), v as any);
}

export async function listEntries(): Promise<LogbookEntry[]> {
  await ensureDefaultSetup();
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/entries`));
  return snaps.docs.map((d) => entryFromDoc(d.data()));
}

export async function getEntry(entryId: string): Promise<LogbookEntry | null> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snap = await getDoc(doc(db, `users/${uid}/entries/${entryId}`));
  return snap.exists() ? entryFromDoc(snap.data()) : null;
}

export async function upsertEntry(e: LogbookEntry) {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/entries/${e.id}`), entryToDoc(e));
}

export async function deleteEntry(entryId: string): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await deleteDoc(doc(db, `users/${uid}/entries/${entryId}`));
}

export async function getUserFlags(): Promise<{ setupComplete?: boolean }> {
  await ensureDefaultSetup();
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snap = await getDoc(doc(db, `users/${uid}/flags/main`));
  return snap.exists() ? (snap.data() as any) : {};
}

export async function setUserFlags(flags: Record<string, any>) {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/flags/main`), flags, { merge: true });
}

// ---- Integrations / Connectors (Firestore-backed, previously mock/localStorage) ----

export async function listIntegrationRequests(): Promise<any[]> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/integrationRequests`));
  return snaps.docs.map((d) => d.data());
}

export async function addIntegrationRequest(req: any): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/integrationRequests/${req.id}`), stripUndefined(req));
}

export async function upsertConnector(connector: any): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/connectors/${connector.id}`), stripUndefined(connector), { merge: true });
}

export async function listConnectors(): Promise<any[]> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/connectors`));
  return snaps.docs.map((d) => d.data());
}

export async function getConnectorByRequestId(requestId: string): Promise<any | null> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const q = query(collection(db, `users/${uid}/connectors`), where("requestId", "==", requestId));
  const snaps = await getDocs(q);
  const first = snaps.docs[0];
  return first ? first.data() : null;
}

export async function runMockSync(connectorId: string): Promise<{ inserted: number; updated: number }> {
  await ensureDefaultSetup();
  const uid = requireUid();
  const { db } = getFirebaseClient();

  const SYNC_INTERVAL_MINUTES_DEFAULT = 12 * 60;
  const now = new Date();
  const nowIso = now.toISOString();
  const jitterMinutes = Math.floor(Math.random() * 5); // 0-4 minutes
  const successNextSyncAt = new Date(
    now.getTime() + (SYNC_INTERVAL_MINUTES_DEFAULT + jitterMinutes) * 60_000
  ).toISOString();

  // Generate 1-3 mock entries
  const numEntries = Math.floor(Math.random() * 3) + 1;
  let inserted = 0;
  let updated = 0;

  const airports = ["ENGM", "ENBR", "ENZV", "ENTC", "ENVA", "ENKB"];
  const aircraftRegs = ["LN-ABC", "LN-DEF", "LN-GHI", "LN-JKL"];

  const connectorRef = doc(db, `users/${uid}/connectors/${connectorId}`);

  try {
    const connSnap = await getDoc(connectorRef);
    if (!connSnap.exists()) throw new Error("Connector not found");
    const connector: any = connSnap.data();
    if (connector.status !== "active") throw new Error("Connector is not active");

    for (let i = 0; i < numEntries; i++) {
      const externalKey = `mock-${connectorId}-${i}`;
      const entryId = `e_mock_${connectorId}_${i}`;

      const date = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const departure = airports[Math.floor(Math.random() * airports.length)];
      const arrival = airports[Math.floor(Math.random() * airports.length)];
      const registration = aircraftRegs[Math.floor(Math.random() * aircraftRegs.length)];
      const flightMinutes = Math.floor(Math.random() * 180) + 30;

      // Store as decimal hours (e.g. 1.75) to fit current FIELD_CATALOG (number)
      const totalTime = Math.round((flightMinutes / 60) * 100) / 100;

      const newValues = {
        date,
        departure,
        arrival,
        aircraft: "AW169",
        registration,
        totalTime,
      };

      const entryRef = doc(db, `users/${uid}/entries/${entryId}`);
      const entrySnap = await getDoc(entryRef);

      if (entrySnap.exists()) {
        const existing = entryFromDoc(entrySnap.data());
        const manualOverrides = (existing.manualOverrides || {}) as Record<string, boolean>;

        const mergedValues = { ...(existing.values || {}) } as Record<string, any>;
        for (const [key, value] of Object.entries(newValues)) {
          if (!manualOverrides[key]) mergedValues[key] = value;
        }

        const updatedEntry: LogbookEntry = {
          ...existing,
          id: entryId,
          templateId: existing.templateId || "tmpl_easa_default",
          values: mergedValues,
          updatedAt: nowIso,
        };

        await setDoc(entryRef, entryToDoc(updatedEntry));
        updated++;
      } else {
        const newEntry: LogbookEntry = {
          id: entryId,
          templateId: "tmpl_easa_default",
          values: newValues,
          source: {
            system: "generic_api",
            connectorId,
            externalKey,
          },
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await setDoc(entryRef, entryToDoc(newEntry));
        inserted++;
      }
    }

    const successConnector = stripUndefined({
      ...connector,
      lastSyncAt: nowIso,
      lastSyncAttemptAt: nowIso,
      lastSyncStatus: "ok",
      lastSyncError: null,
      consecutiveFailures: 0,
      autoSyncEnabled: connector.autoSyncEnabled ?? true,
      syncIntervalMinutes: connector.syncIntervalMinutes ?? SYNC_INTERVAL_MINUTES_DEFAULT,
      nextSyncAt: successNextSyncAt,
    });

    await setDoc(connectorRef, successConnector, { merge: true });
  } catch (err) {
    // Record failure on connector so auto-sync can back off.
    try {
      const connSnap = await getDoc(connectorRef);
      if (connSnap.exists()) {
        const connector: any = connSnap.data();
        const failures = Number(connector.consecutiveFailures || 0) + 1;
        const baseMinutes = 5;
        const maxMinutes = 6 * 60;
        const backoffMinutes = Math.min(maxMinutes, baseMinutes * Math.pow(2, Math.min(failures, 8)));

        await setDoc(
          connectorRef,
          stripUndefined({
            lastSyncAttemptAt: nowIso,
            lastSyncStatus: "error",
            lastSyncError: err instanceof Error ? err.message : String(err),
            consecutiveFailures: failures,
            autoSyncEnabled: connector.autoSyncEnabled ?? true,
            syncIntervalMinutes: connector.syncIntervalMinutes ?? SYNC_INTERVAL_MINUTES_DEFAULT,
            nextSyncAt: new Date(now.getTime() + backoffMinutes * 60_000).toISOString(),
          }),
          { merge: true }
        );
      }
    } catch {
      // ignore
    }
    throw err;
  }

  return { inserted, updated };
}

