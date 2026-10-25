import { NextRequest, NextResponse } from "next/server";
import { HttpError, jsonError, requireUser } from "@/lib/auth/serverAuth";
import { ConnectorInputError, parseConnectorInput, toConnectorView } from "@/lib/sync/connectorModel";
import { listConnectors, saveConnector, storeSecret } from "@/lib/sync/server/connectorStore";
import type { Connector } from "@/types/integrations";

export const runtime = "nodejs";

/** Lists the signed-in pilot's connectors (never including secrets). */
export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireUser(req);
    const connectors = await listConnectors(uid);
    return NextResponse.json({ connectors: connectors.map(toConnectorView) });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Creates a connector the pilot configures themselves - the path to use
 * when the employer hands the pilot a personal API key rather than going
 * through the employer setup link.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    let input;
    try {
      input = parseConnectorInput(body);
    } catch (err) {
      if (err instanceof ConnectorInputError) {
        return NextResponse.json({ error: err.message, problems: err.problems }, { status: 400 });
      }
      throw err;
    }

    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    if (input.authType !== "none" && !secret) {
      throw new HttpError(400, "An API key/token is required for this auth type");
    }

    const nowIso = new Date().toISOString();
    const connector: Connector = {
      id: "conn_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      provider: "generic_json",
      companyName: input.companyName,
      crewId: input.crewId,
      configuredBy: "pilot",
      apiBaseUrl: input.apiBaseUrl,
      authType: input.authType,
      authHeaderName: input.authHeaderName,
      hasSecret: false,
      config: input.config,
      status: input.autoSyncEnabled ? "active" : "paused",
      autoSyncEnabled: input.autoSyncEnabled,
      syncIntervalMinutes: input.syncIntervalMinutes,
      syncSince: input.syncSince,
      nextSyncAt: nowIso,
      consecutiveFailures: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await saveConnector(uid, connector);
    if (secret) await storeSecret(uid, connector.id, secret);

    return NextResponse.json({ connector: toConnectorView({ ...connector, hasSecret: !!secret }) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
