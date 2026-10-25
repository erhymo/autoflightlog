import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/serverAuth";
import { toConnectorView } from "@/lib/sync/connectorModel";
import { testConnector } from "@/lib/sync/server/runSync";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Makes a real request to the configured API and reports what came back. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ connectorId: string }> }) {
  try {
    const { uid } = await requireUser(req);
    const { connectorId } = await ctx.params;
    const result = await testConnector(uid, connectorId);
    return NextResponse.json({ ...result, connector: toConnectorView(result.connector) }, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return jsonError(err);
  }
}
