import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
    const { uid } = await ctx.params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { auth, db } = getFirebaseAdmin();

    const updates: any = {};
    if (typeof body.disabled === "boolean") {
      updates.disabled = body.disabled;
      await auth.updateUser(uid, { disabled: body.disabled });
    }

    if (typeof body.hidden === "boolean") {
      updates.hidden = body.hidden;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .doc(`users/${uid}/meta/admin`)
        .set(
          {
            ...updates,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
