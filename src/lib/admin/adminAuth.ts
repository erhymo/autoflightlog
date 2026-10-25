import "server-only";

import type { NextRequest } from "next/server";
import { emailInAllowlist, parseAllowlist } from "@/lib/admin/allowlist";
import { HttpError, requireUser } from "@/lib/auth/serverAuth";

/** Kept as a distinct name for the admin routes; behaves exactly like HttpError. */
export class AdminHttpError extends HttpError {}

export async function requireAdmin(req: NextRequest) {
  let user: { uid: string; email?: string };
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof HttpError) throw new AdminHttpError(err.status, err.message);
    throw err;
  }

  const allowlistRaw = process.env.ADMIN_EMAIL_ALLOWLIST || process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST;
  const allowlist = parseAllowlist(allowlistRaw);
  if (allowlist.length === 0) {
    throw new AdminHttpError(
      403,
      "Admin allowlist not configured. Set ADMIN_EMAIL_ALLOWLIST (comma-separated emails)."
    );
  }
  if (!emailInAllowlist(user.email, allowlist)) {
    throw new AdminHttpError(403, "Not authorized for admin endpoints");
  }

  return { email: user.email, uid: user.uid };
}
