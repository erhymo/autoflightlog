import "server-only";

import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { HttpError } from "@/lib/auth/serverAuth";
import type { IntegrationRequest } from "@/types/integrations";

export class EmployerSetupError extends HttpError {
  constructor(message: string, status = 404) {
    super(status, message);
  }
}

/**
 * Looks up an integration request by its setup token across all pilots
 * (via a Firestore collection-group query) and checks it against the
 * request id in the URL and the token's expiry. This lets an
 * unauthenticated employer IT contact configure a connector for a specific
 * pilot without ever needing that pilot's own Firebase credentials - the
 * random token in the setup link is the credential, which is why it is
 * time-limited (SETUP_TOKEN_TTL_DAYS) rather than valid forever.
 */
export async function requireIntegrationRequestByToken(
  requestId: string,
  token: string | null
): Promise<{ uid: string; request: IntegrationRequest; ref: FirebaseFirestore.DocumentReference }> {
  if (!token || token.length < 16) throw new EmployerSetupError("Missing setup token", 400);

  const { db } = getFirebaseAdmin();
  const snap = await db.collectionGroup("integrationRequests").where("setupToken", "==", token).limit(1).get();
  if (snap.empty) throw new EmployerSetupError("Invalid setup token", 403);

  const doc = snap.docs[0];
  if (doc.id !== requestId) throw new EmployerSetupError("Request not found", 404);

  const uid = doc.ref.parent.parent?.id;
  if (!uid) throw new EmployerSetupError("Request not found", 404);

  const request = { ...(doc.data() as IntegrationRequest), id: doc.id };
  if (request.setupTokenExpiresAt && new Date(request.setupTokenExpiresAt).getTime() < Date.now()) {
    throw new EmployerSetupError("This setup link has expired. Ask the pilot to create a new request.", 410);
  }

  return { uid, request, ref: doc.ref };
}
