import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

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

let cachedDb: Firestore | null = null;

/**
 * Firestore with persistent local (IndexedDB) cache enabled, so entries
 * created while offline (e.g. right after landing somewhere with no
 * signal) are queued locally and synced automatically once back online.
 * Must be initialized once per app instance, before any other Firestore
 * call, which is why it's memoized here rather than using getFirestore().
 */
function getOrInitFirestore(app: FirebaseApp): Firestore {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    // Falls back to an in-memory-only Firestore in environments where the
    // persistent cache can't be set up (e.g. private browsing without
    // IndexedDB, or a second initialization after HMR in dev).
    console.warn("Firestore persistent cache unavailable, falling back to in-memory cache.", err);
    cachedDb = getFirestore(app);
  }
  return cachedDb;
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
    db: getOrInitFirestore(app),
  };
}

