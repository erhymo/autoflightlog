import { NextRequest, NextResponse } from "next/server";
import { EmployerSetupError, requireIntegrationRequestByToken } from "@/lib/admin/employerSetup";
import { jsonError } from "@/lib/auth/serverAuth";
import { toConnectorView } from "@/lib/sync/connectorModel";
import { findConnectorByRequestId, requireConnector, updateConnector } from "@/lib/sync/server/connectorStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const { uid, ref } = await requireIntegrationRequestByToken(requestId, body.token ?? null);

    const connector = await findConnectorByRequestId(uid, requestId);
    if (!connector || !connector.lastTestAt || connector.lastTestError) {
      throw new EmployerSetupError("Test the connection successfully before activating", 400);
    }

    await updateConnector(uid, connector.id, {
      status: "active",
      autoSyncEnabled: true,
      consecutiveFailures: 0,
      nextSyncAt: new Date().toISOString(),
    });
    await ref.set({ status: "active" }, { merge: true });

    return NextResponse.json({ connector: toConnectorView(await requireConnector(uid, connector.id)) });
  } catch (err) {
    return jsonError(err);
  }
}
