import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/serverAuth";
import { toConnectorView } from "@/lib/sync/connectorModel";
import { runConnectorSync } from "@/lib/sync/server/runSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** "Sync now": runs a sync for one of the pilot's connectors immediately. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ connectorId: string }> }) {
  try {
    const { uid } = await requireUser(req);
    const { connectorId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { full?: boolean };
    const result = await runConnectorSync(uid, connectorId, { trigger: "manual", full: body.full === true });
    return NextResponse.json({ ...result, connector: toConnectorView(result.connector) }, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return jsonError(err);
  }
}
