import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase/admin";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Authenticates an API route call made by the signed-in pilot: the client
 * sends its Firebase ID token as `Authorization: Bearer <idToken>` (see
 * src/lib/api/client.ts). Returns the verified uid and email.
 */
export async function requireUser(req: NextRequest): Promise<{ uid: string; email?: string }> {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, "Missing Authorization: Bearer <idToken>");

  const { auth } = getFirebaseAdmin();
  try {
    const decoded = await auth.verifyIdToken(token, true);
    return { uid: decoded.uid, email: decoded.email ?? undefined };
  } catch {
    throw new HttpError(401, "Invalid or expired ID token");
  }
}

/** Uniform JSON error response for API routes. */
export function jsonError(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("API route error:", err);
  return NextResponse.json({ error: message }, { status: 500 });
}
