import { buildDefaultEasaTemplate } from "@/lib/defaults/easaTemplate";
import { buildDefaultView } from "@/lib/defaults/defaultView";
import { getFirebaseClient } from "@/lib/firebase/client";
import { migrateLegacyDurationFields } from "@/lib/logbook/timeUnits";
import { entryFromDoc, entryToDoc } from "@/lib/logbook/entryDoc";
import { normalizeConnectorDoc } from "@/lib/sync/connectorModel";
import { isSyncedEntry } from "@/lib/sync/planSync";
import type { Certificate, KnownPlace, LogbookEntry, Template, UserFlags, ViewDefinition } from "@/types/domain";
import type { Connector, IntegrationRequest } from "@/types/integrations";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
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

/**
 * Repairs an entry's duration fields if they still hold a pre-fix
 * decimal-hours value, and best-effort persists the repair so future
 * loads don't need to migrate it again. Never blocks the read on the
 * write, and never touches createdAt/updatedAt so this silent repair
 * doesn't make an old entry look freshly edited to other features
 * (e.g. "most recent flight" prefill logic).
 */
function withMigratedDurations(entry: LogbookEntry): LogbookEntry {
  const { entry: migrated, changed } = migrateLegacyDurationFields(entry);
  if (changed) {
    void upsertEntry(migrated).catch(() => {
      // Best-effort only - the corrected values are still returned to the
      // caller for this load even if the repair write fails.
    });
  }
  return migrated;
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
  return snaps.docs.map((d) => withMigratedDurations(entryFromDoc(d.data())));
}

export async function getEntry(entryId: string): Promise<LogbookEntry | null> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snap = await getDoc(doc(db, `users/${uid}/entries/${entryId}`));
  return snap.exists() ? withMigratedDurations(entryFromDoc(snap.data())) : null;
}

export async function upsertEntry(e: LogbookEntry) {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/entries/${e.id}`), entryToDoc(e));
}

/**
 * Deletes one entry. If it came from an API sync, a tombstone is written to
 * users/{uid}/syncIgnored first so the next sync run respects the deletion
 * instead of recreating the flight (see src/lib/sync/planSync.ts).
 */
export async function deleteEntry(entryId: string): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const ref = doc(db, `users/${uid}/entries/${entryId}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const entry = entryFromDoc(snap.data() as Record<string, unknown>);
    if (isSyncedEntry(entry)) {
      await setDoc(doc(db, `users/${uid}/syncIgnored/${entryId}`), {
        entryId,
        connectorId: entry.source.connectorId ?? null,
        externalKey: entry.source.externalKey,
        createdAt: new Date().toISOString(),
      });
    }
  }
  await deleteDoc(ref);
}

/**
 * Permanently deletes every logbook entry for the current user (e.g. to
 * start over from a re-imported source). Irreversible - callers must get
 * explicit, typed confirmation before calling this.
 *
 * Uses batched writes (Firestore's own batch mechanism, capped well under
 * its 500-writes-per-batch limit) committed one batch at a time, rather
 * than firing one deleteDoc() per document in parallel - with a few
 * hundred entries (e.g. after several import attempts), that many
 * simultaneous individual requests can overwhelm the connection and make
 * the operation appear to hang indefinitely instead of completing.
 */
export async function deleteAllEntries(): Promise<number> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/entries`));
  const docs = snaps.docs;

  const BATCH_SIZE = 400;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }

  return docs.length;
}

export async function getUserFlags(): Promise<UserFlags> {
  await ensureDefaultSetup();
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snap = await getDoc(doc(db, `users/${uid}/flags/main`));
  return snap.exists() ? (snap.data() as UserFlags) : {};
}

export async function setUserFlags(flags: Partial<UserFlags>) {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/flags/main`), stripUndefined(flags), { merge: true });
}

// ---- Integrations / Connectors ----
// Connector *configuration and sync state* is owner-readable so the UI can
// show it straight from Firestore (and offline). Everything that changes a
// connector, and anything involving the secret, goes through the API routes
// in src/app/api/connectors via src/lib/api/client.ts.

export async function listIntegrationRequests(): Promise<IntegrationRequest[]> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/integrationRequests`));
  return snaps.docs.map((d) => ({ ...(d.data() as IntegrationRequest), id: d.id }));
}

export async function addIntegrationRequest(req: IntegrationRequest): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/integrationRequests/${req.id}`), stripUndefined(req));
}

export async function updateIntegrationRequest(requestId: string, updates: Partial<IntegrationRequest>): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/integrationRequests/${requestId}`), stripUndefined(updates), { merge: true });
}

export async function deleteIntegrationRequest(requestId: string): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await deleteDoc(doc(db, `users/${uid}/integrationRequests/${requestId}`));
}

export async function listConnectors(): Promise<Connector[]> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/connectors`));
  return snaps.docs.map((d) => normalizeConnectorDoc({ ...(d.data() as Record<string, unknown>), id: d.id }));
}

export async function getConnectorByRequestId(requestId: string): Promise<Connector | null> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const q = query(collection(db, `users/${uid}/connectors`), where("requestId", "==", requestId));
  const snaps = await getDocs(q);
  const first = snaps.docs[0];
  return first ? normalizeConnectorDoc({ ...(first.data() as Record<string, unknown>), id: first.id }) : null;
}

// ---- Certificates (medical, license, ratings, etc. with an expiry date) ----

export async function listCertificates(): Promise<Certificate[]> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/certificates`));
  return snaps.docs.map((d) => d.data() as Certificate);
}

export async function upsertCertificate(certificate: Certificate): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/certificates/${certificate.id}`), stripUndefined(certificate));
}

export async function deleteCertificate(certificateId: string): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await deleteDoc(doc(db, `users/${uid}/certificates/${certificateId}`));
}

// ---- Known places (geo-tagged departure/arrival names, for location-based suggestions) ----

export async function listKnownPlaces(): Promise<KnownPlace[]> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  const snaps = await getDocs(collection(db, `users/${uid}/knownPlaces`));
  return snaps.docs.map((d) => d.data() as KnownPlace);
}

export async function upsertKnownPlace(place: KnownPlace): Promise<void> {
  const uid = requireUid();
  const { db } = getFirebaseClient();
  await setDoc(doc(db, `users/${uid}/knownPlaces/${place.id}`), stripUndefined(place));
}
