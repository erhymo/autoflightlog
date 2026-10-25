import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationRequestByToken } from "@/lib/admin/employerSetup";
import { jsonError } from "@/lib/auth/serverAuth";
import { toConnectorView } from "@/lib/sync/connectorModel";
import { findConnectorByRequestId } from "@/lib/sync/server/connectorStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params;
    const token = req.nextUrl.searchParams.get("token");
    const { uid, request } = await requireIntegrationRequestByToken(requestId, token);

    const connector = await findConnectorByRequestId(uid, requestId);

    return NextResponse.json({
      request: {
        companyName: request.companyName,
        crewId: request.crewId,
        contactEmail: request.contactEmail,
        setupTokenExpiresAt: request.setupTokenExpiresAt ?? null,
      },
      // The secret is never returned - the employer sees `hasSecret` and
      // can paste a new one to replace it.
      connector: connector ? toConnectorView(connector) : null,
    });
  } catch (err) {
    return jsonError(err);
  }
}
