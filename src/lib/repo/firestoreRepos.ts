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
