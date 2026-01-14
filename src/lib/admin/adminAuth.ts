import "server-only";

import type { NextRequest } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { emailInAllowlist, parseAllowlist } from "@/lib/admin/allowlist";

export class AdminHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireAdmin(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) throw new AdminHttpError(401, "Missing Authorization: Bearer <idToken>");

  const { auth } = getFirebaseAdmin();
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch {
    throw new AdminHttpError(401, "Invalid or expired ID token");
  }

  const email = (decoded?.email as string | undefined) ?? undefined;
  const allowlistRaw = process.env.ADMIN_EMAIL_ALLOWLIST || process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST;
  const allowlist = parseAllowlist(allowlistRaw);
  if (allowlist.length === 0) {
    throw new AdminHttpError(
      403,
      "Admin allowlist not configured. Set ADMIN_EMAIL_ALLOWLIST (comma-separated emails)."
    );
  }
  if (!emailInAllowlist(email, allowlist)) {
    throw new AdminHttpError(403, "Not authorized for admin endpoints");
  }

  return { decoded, email, uid: decoded.uid as string };
}
