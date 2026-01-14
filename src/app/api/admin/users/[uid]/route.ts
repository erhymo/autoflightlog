import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { AdminHttpError, requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

function toIsoStringMaybe(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.toISOString() : null;
  }
  return null;
}

function jsonError(err: unknown) {
  if (err instanceof AdminHttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(_req);
    const { uid } = await ctx.params;

    const { auth, db } = getFirebaseAdmin();

    const user = await auth.getUser(uid);

    const metaRef = db.doc(`users/${uid}/meta/admin`);
    const flagsRef = db.doc(`users/${uid}/flags/main`);
    const connectorsRef = db.collection(`users/${uid}/connectors`);
    const requestsRef = db.collection(`users/${uid}/integrationRequests`);

    const [metaSnap, flagsSnap, connectorsSnap, requestsSnap] = await Promise.all([
      metaRef.get(),
      flagsRef.get(),
      connectorsRef.get(),
      requestsRef.get(),
    ]);

    const metaData: any = metaSnap.exists ? metaSnap.data() : null;
    const flagsData: any = flagsSnap.exists ? flagsSnap.data() : null;

    return NextResponse.json({
      user: {
        uid: user.uid,
        email: user.email ?? null,
        disabled: Boolean(user.disabled),
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        providerIds: (user.providerData || []).map((p) => p.providerId),
        creationTime: user.metadata?.creationTime ?? null,
        lastSignInTime: user.metadata?.lastSignInTime ?? null,
      },
      meta: metaData
        ? {
            hidden: Boolean(metaData.hidden),
            updatedAt: toIsoStringMaybe(metaData.updatedAt),
          }
        : null,
      flags: flagsData
        ? {
            setupComplete: Boolean(flagsData.setupComplete),
          }
        : null,
      connectors: connectorsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      integrationRequests: requestsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    });
  } catch (err) {
    return jsonError(err);
  }
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
