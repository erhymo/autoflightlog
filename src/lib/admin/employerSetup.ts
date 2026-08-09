import "server-only";

import { getFirebaseAdmin } from "@/lib/firebase/admin";

export class EmployerSetupError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.status = status;
  }
}

/**
 * Looks up an integration request by its document id across all pilots
 * (via a Firestore collection-group query) and verifies the caller-supplied
 * setup token against the one stored on the request. This lets an
 * unauthenticated employer IT contact configure a connector for a specific
 * pilot without ever needing that pilot's own Firebase credentials — the
 * random token in the setup link is the credential.
 */
export async function requireIntegrationRequestByToken(requestId: string, token: string | null) {
  if (!token) throw new EmployerSetupError("Missing setup token", 400);

  const { db } = getFirebaseAdmin();
  // Look up by the token itself (the actual credential in the setup link),
  // then double-check the document id matches the requestId in the URL.
  const snap = await db.collectionGroup("integrationRequests").where("setupToken", "==", token).limit(1).get();
  if (snap.empty) throw new EmployerSetupError("Invalid setup token", 403);

  const doc = snap.docs[0];
  if (doc.id !== requestId) throw new EmployerSetupError("Request not found", 404);

  // Parent path is users/{uid}/integrationRequests/{requestId}.
  const uid = doc.ref.parent.parent?.id;
  if (!uid) throw new EmployerSetupError("Request not found", 404);

  return { uid, request: doc.data() };
}
