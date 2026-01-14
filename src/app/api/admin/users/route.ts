import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { AdminHttpError, requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

function jsonError(err: unknown) {
  if (err instanceof AdminHttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { auth, db } = getFirebaseAdmin();

    const maxRaw = req.nextUrl.searchParams.get("max") ?? "200";
    const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
    const max = Math.max(1, Math.min(500, Number(maxRaw) || 200));

    const res = await auth.listUsers(max, pageToken);

    // Merge in admin metadata stored under `users/{uid}/meta/admin` (e.g. hidden flag)
    const hiddenByUid = new Map<string, boolean>();
    if (res.users.length > 0) {
      const refs = res.users.map((u) => db.doc(`users/${u.uid}/meta/admin`));
      const snaps = await db.getAll(...refs);
      res.users.forEach((u, i) => {
        const data = snaps[i]?.data() as any;
        hiddenByUid.set(u.uid, Boolean(data?.hidden));
      });
    }

    return NextResponse.json({
      users: res.users.map((u) => ({
        uid: u.uid,
        email: u.email ?? null,
        disabled: Boolean(u.disabled),
        hidden: hiddenByUid.get(u.uid) ?? false,
        displayName: u.displayName ?? null,
        photoURL: u.photoURL ?? null,
        providerIds: (u.providerData || []).map((p) => p.providerId),
        creationTime: u.metadata?.creationTime ?? null,
        lastSignInTime: u.metadata?.lastSignInTime ?? null,
      })),
      nextPageToken: res.pageToken ?? null,
    });
  } catch (err) {
    return jsonError(err);
  }
}
