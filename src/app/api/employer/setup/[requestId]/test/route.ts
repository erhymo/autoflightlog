import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
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
    const { token, apiBaseUrl, authType, secret } = body as {
      token: string;
      apiBaseUrl: string;
      authType: "api_key" | "bearer_token";
      secret: string;
    };

    const { uid, request } = await requireIntegrationRequestByToken(requestId, token);
    const { db } = getFirebaseAdmin();

    const existingSnap = await db
      .collection(`users/${uid}/connectors`)
      .where("requestId", "==", requestId)
      .limit(1)
      .get();
    const existing = existingSnap.empty ? null : existingSnap.docs[0];

    let status: "inactive" | "error" = "inactive";
    let lastError: string | null = null;
    if (typeof apiBaseUrl !== "string" || !apiBaseUrl.startsWith("https://")) {
      status = "error";
      lastError = "Base URL must start with https://";
    } else if (typeof secret !== "string" || secret.length < 8) {
      status = "error";
      lastError = "Token too short";
    }

    const connectorId = existing?.id || "conn_" + Math.random().toString(36).slice(2);
    const connector: Record<string, unknown> = {
      id: connectorId,
      requestId,
      companyName: request.companyName,
      crewId: request.crewId,
      apiBaseUrl,
      authType,
      secret,
      status,
      lastTestAt: new Date().toISOString(),
      lastError: lastError || FieldValue.delete(),
    };

    await db.doc(`users/${uid}/connectors/${connectorId}`).set(connector, { merge: true });

    return NextResponse.json({ connector: { ...connector, lastError: lastError || undefined } });
  } catch (err) {
    return jsonError(err);
  }
}
