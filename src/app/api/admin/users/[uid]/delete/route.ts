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

export async function POST(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
    const { uid } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as any;
    if (!body?.confirmUid || body.confirmUid !== uid) {
      throw new AdminHttpError(400, "Missing or invalid confirmUid. Must equal the uid being deleted.");
    }

    const { auth, db } = getFirebaseAdmin();

    // 1) Delete Firestore user subtree (templates/views/entries/etc)
    const userRoot = db.doc(`users/${uid}`);
    const recursiveDelete = (db as any).recursiveDelete as undefined | ((ref: any) => Promise<unknown>);
    if (!recursiveDelete) {
      throw new AdminHttpError(
        500,
        "Firestore recursiveDelete is not available in this runtime. Upgrade firebase-admin or implement manual delete."
      );
    }
    await recursiveDelete(userRoot);

    // 2) Delete Firebase Auth user
    await auth.deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
