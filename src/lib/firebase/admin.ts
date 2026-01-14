import "server-only";

import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore } from "firebase-admin/firestore";

export type FirebaseAdminClient = {
  app: App;
  auth: Auth;
  db: Firestore;
};

function parseServiceAccountFromEnv(): {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
} {
  // Option A (recommended): FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON contains the full JSON (or base64 JSON)
  const rawJson =
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (rawJson) {
    try {
      const jsonString = rawJson.trim().startsWith("{")
        ? rawJson
        : Buffer.from(rawJson, "base64").toString("utf8");
      const parsed = JSON.parse(jsonString);
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      };
    } catch {
      // Fall through to field-based parsing.
    }
  }

  // Option B: split fields
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  return { projectId, clientEmail, privateKey };
}

function getOrInitAdminApp(): App {
  if (getApps().length) return getApp();

  const { projectId, clientEmail, privateKey } = parseServiceAccountFromEnv();

  // If we have a service account, use it.
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  // Otherwise fall back to Application Default Credentials (ADC).
  // This works in environments where GOOGLE_APPLICATION_CREDENTIALS is set.
  return initializeApp();
}

/**
 * Firebase Admin SDK for server-side usage (API routes).
 *
 * This function is safe to import from route handlers because it does not throw
 * at module import time (only when called).
 */
export function getFirebaseAdmin(): FirebaseAdminClient {
  const app = getOrInitAdminApp();
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
