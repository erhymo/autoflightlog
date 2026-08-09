import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { EmployerSetupError, requireIntegrationRequestByToken } from "@/lib/admin/employerSetup";

export const runtime = "nodejs";

function jsonError(err: unknown) {
  if (err instanceof EmployerSetupError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params;
    const body = await req.json();
    const { token } = body as { token: string };

    const { uid } = await requireIntegrationRequestByToken(requestId, token);
    const { db } = getFirebaseAdmin();

    const existingSnap = await db
      .collection(`users/${uid}/connectors`)
      .where("requestId", "==", requestId)
      .limit(1)
      .get();
    if (existingSnap.empty) {
      throw new EmployerSetupError("Test the connection successfully before activating", 400);
    }
    const existing = existingSnap.docs[0];
    const existingData = existing.data();
    if (existingData.lastError) {
      throw new EmployerSetupError("Test the connection successfully before activating", 400);
    }

    const updates = {
      status: "active",
      autoSyncEnabled: true,
      syncIntervalMinutes: existingData.syncIntervalMinutes ?? 12 * 60,
      nextSyncAt: new Date().toISOString(),
    };
    await existing.ref.set(updates, { merge: true });

    return NextResponse.json({ connector: { ...existingData, ...updates } });
  } catch (err) {
    return jsonError(err);
  }
}
