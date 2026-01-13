import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

export type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

/**
 * NOTE: This file is used from client components.
 * In Next.js, `process.env.NEXT_PUBLIC_*` values are inlined at build time.
 * Dynamic access like `process.env[name]` will NOT be inlined and will be
 * undefined in the browser.
 */
function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Add it to .env.local (dev) and Vercel Environment Variables (prod).`
    );
  }
  return value;
}

function getFirebaseConfig() {
  return {
    apiKey: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, "NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnv(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
    ),
    appId: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, "NEXT_PUBLIC_FIREBASE_APP_ID"),
    // measurementId is optional; we intentionally don't initialize Analytics here.
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  } as const;
}

function getOrInitApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp(getFirebaseConfig());
}

/**
 * Firebase Web SDK for client-side usage.
 *
 * IMPORTANT:
 * - Call from client components/hooks only ("use client").
 * - This function does not run at import-time, so it won't break SSR builds.
 */
export function getFirebaseClient(): FirebaseClient {
  const app = getOrInitApp();
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

