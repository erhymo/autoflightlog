"use client";

import { getFirebaseClient } from "@/lib/firebase/client";

export class ApiError extends Error {
  status: number;
  problems?: string[];
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    const problems = (body as { problems?: unknown } | undefined)?.problems;
    if (Array.isArray(problems)) this.problems = problems.map(String);
  }
}

/**
 * Calls one of this app's own API routes as the signed-in pilot, attaching
 * the Firebase ID token the server verifies with requireUser(). Throws
 * ApiError (with the server's message) on any non-2xx response.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { auth } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, "Not signed in");
  const idToken = await user.getIdToken();

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}
