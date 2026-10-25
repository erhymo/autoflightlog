import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";
import { normalizeConnectorDoc } from "@/lib/sync/connectorModel";
import type { Connector, ConnectorSecretDoc } from "@/types/integrations";
import { HttpError } from "@/lib/auth/serverAuth";

/**
 * Server-side (Admin SDK) access to connectors and their secrets. Secrets
 * are stored encrypted in users/{uid}/connectorSecrets/{connectorId}, a
 * collection the client SDK is denied in firestore.rules, so the only
 * place a plaintext credential ever exists is inside a running sync.
 */

function connectorsRef(uid: string) {
  return getFirebaseAdmin().db.collection(`users/${uid}/connectors`);
}

function secretRef(uid: string, connectorId: string) {
  return getFirebaseAdmin().db.doc(`users/${uid}/connectorSecrets/${connectorId}`);
}

/** Removes undefined values (Firestore rejects them) without touching FieldValue sentinels. */
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export async function getConnector(uid: string, connectorId: string): Promise<Connector | null> {
  const snap = await connectorsRef(uid).doc(connectorId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const connector = normalizeConnectorDoc({ ...data, id: snap.id });
  await migrateLegacySecret(uid, snap.id, data);
  return connector;
}

export async function requireConnector(uid: string, connectorId: string): Promise<Connector> {
  const connector = await getConnector(uid, connectorId);
  if (!connector) throw new HttpError(404, "Connector not found");
  return connector;
}

export async function listConnectors(uid: string): Promise<Connector[]> {
  const snaps = await connectorsRef(uid).get();
  const out: Connector[] = [];
  for (const d of snaps.docs) {
    const data = d.data() as Record<string, unknown>;
    out.push(normalizeConnectorDoc({ ...data, id: d.id }));
    await migrateLegacySecret(uid, d.id, data);
  }
  return out;
}

export async function findConnectorByRequestId(uid: string, requestId: string): Promise<Connector | null> {
  const snap = await connectorsRef(uid).where("requestId", "==", requestId).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data() as Record<string, unknown>;
  await migrateLegacySecret(uid, d.id, data);
  return normalizeConnectorDoc({ ...data, id: d.id });
}

/**
 * Writes a full connector document. Always strips any `secret` field so a
 * credential can never be (re)introduced into the client-readable doc.
 */
export async function saveConnector(uid: string, connector: Connector): Promise<void> {
  const { ...doc } = connector as Connector & { secret?: unknown };
  delete doc.secret;
  await connectorsRef(uid).doc(connector.id).set(compact(doc as unknown as Record<string, unknown>));
}

/** Merges partial updates; pass `null` for a field to delete it. */
export async function updateConnector(
  uid: string,
  connectorId: string,
  updates: Partial<Record<keyof Connector, unknown>>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    payload[k] = v === null ? FieldValue.delete() : v;
  }
  delete payload.secret;
  payload.updatedAt = new Date().toISOString();
  await connectorsRef(uid).doc(connectorId).set(payload, { merge: true });
}

export async function deleteConnector(uid: string, connectorId: string): Promise<void> {
  await Promise.all([connectorsRef(uid).doc(connectorId).delete(), secretRef(uid, connectorId).delete()]);
}

export async function storeSecret(uid: string, connectorId: string, plaintext: string): Promise<void> {
  const doc: ConnectorSecretDoc = {
    connectorId,
    ciphertext: encryptSecret(plaintext),
    updatedAt: new Date().toISOString(),
  };
  await secretRef(uid, connectorId).set(doc);
  await connectorsRef(uid).doc(connectorId).set({ hasSecret: true, secret: FieldValue.delete() }, { merge: true });
}

/** Returns the decrypted secret, or "" for connectors that don't need one. */
export async function readSecret(uid: string, connector: Connector): Promise<string> {
  if (connector.authType === "none") return "";
  const snap = await secretRef(uid, connector.id).get();
  if (!snap.exists) {
    throw new HttpError(400, "No API key/token is stored for this connector yet");
  }
  const data = snap.data() as ConnectorSecretDoc;
  return decryptSecret(data.ciphertext);
}

/**
 * One-time migration for connectors written by the earlier employer flow,
 * which stored the secret in plaintext on the connector doc. Moves it into
 * encrypted storage and removes the plaintext field. Best-effort: if the
 * encryption key isn't configured yet, the plaintext is left in place so
 * nothing is lost, and the migration retries on the next read.
 */
async function migrateLegacySecret(uid: string, connectorId: string, data: Record<string, unknown>): Promise<void> {
  const legacy = typeof data.secret === "string" ? data.secret : null;
  if (!legacy) return;
  try {
    await storeSecret(uid, connectorId, legacy);
  } catch (err) {
    console.warn(`Could not migrate legacy secret for connector ${connectorId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Connectors across all users whose next scheduled sync is due. Uses a
 * collection-group query on nextSyncAt (see firestore.indexes.json) and
 * filters the rest in code, so no composite index is needed.
 */
export async function listDueConnectors(nowIso: string, limit = 100): Promise<Array<{ uid: string; connector: Connector }>> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collectionGroup("connectors")
    .where("nextSyncAt", "<=", nowIso)
    .orderBy("nextSyncAt", "asc")
    .limit(limit)
    .get();

  const out: Array<{ uid: string; connector: Connector }> = [];
  for (const d of snap.docs) {
    const uid = d.ref.parent.parent?.id;
    if (!uid) continue;
    const connector = normalizeConnectorDoc({ ...(d.data() as Record<string, unknown>), id: d.id });
    if (!connector.autoSyncEnabled) continue;
    if (connector.status !== "active" && connector.status !== "error") continue;
    out.push({ uid, connector });
  }
  return out;
}
