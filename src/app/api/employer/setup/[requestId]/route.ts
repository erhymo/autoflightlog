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

export async function GET(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params;
    const token = req.nextUrl.searchParams.get("token");
    const { uid, request } = await requireIntegrationRequestByToken(requestId, token);

    const { db } = getFirebaseAdmin();
    const connectorSnap = await db
      .collection(`users/${uid}/connectors`)
      .where("requestId", "==", requestId)
      .limit(1)
      .get();
    const connector = connectorSnap.empty ? null : connectorSnap.docs[0].data();

    return NextResponse.json({
      request: {
        companyName: request.companyName,
        crewId: request.crewId,
        contactEmail: request.contactEmail,
      },
      connector,
    });
  } catch (err) {
    return jsonError(err);
  }
}
