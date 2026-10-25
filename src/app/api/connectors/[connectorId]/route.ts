import { NextRequest, NextResponse } from "next/server";
import { HttpError, jsonError, requireUser } from "@/lib/auth/serverAuth";
import { ConnectorInputError, parseConnectorInput, toConnectorView } from "@/lib/sync/connectorModel";
import { deleteConnector, requireConnector, saveConnector, storeSecret, updateConnector } from "@/lib/sync/server/connectorStore";
import { parseDateToIso } from "@/lib/logbook/dateUtils";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ connectorId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await requireUser(req);
    const { connectorId } = await ctx.params;
    const connector = await requireConnector(uid, connectorId);
    return NextResponse.json({ connector: toConnectorView(connector) });
  } catch (err) {
    return jsonError(err);
  }
}

/** Full edit of a connector's configuration. An empty `secret` keeps the stored one. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await requireUser(req);
    const { connectorId } = await ctx.params;
    const existing = await requireConnector(uid, connectorId);
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
    if (input.authType !== "none" && !secret && !existing.hasSecret) {
      throw new HttpError(400, "An API key/token is required for this auth type");
    }

    const nowIso = new Date().toISOString();
    const configChanged = JSON.stringify(existing.config) !== JSON.stringify(input.config);
    const next = {
      ...existing,
      companyName: input.companyName,
      crewId: input.crewId,
      apiBaseUrl: input.apiBaseUrl,
      authType: input.authType,
      authHeaderName: input.authHeaderName,
      config: input.config,
      syncSince: input.syncSince,
      syncIntervalMinutes: input.syncIntervalMinutes,
      autoSyncEnabled: input.autoSyncEnabled,
      status: input.autoSyncEnabled ? (existing.status === "paused" ? "active" : existing.status) : "paused",
      // A changed mapping or window should take effect on the next run, and
      // a full refetch is the only way to be sure the merge sees everything.
      ...(configChanged || input.syncSince !== existing.syncSince ? { lastSyncAt: undefined, lastSyncStatus: undefined } : {}),
      nextSyncAt: nowIso,
      updatedAt: nowIso,
    } as typeof existing;

    await saveConnector(uid, next);
    if (secret) await storeSecret(uid, connectorId, secret);

    return NextResponse.json({ connector: toConnectorView(await requireConnector(uid, connectorId)) });
  } catch (err) {
    return jsonError(err);
  }
}

/** Small toggles: pause/resume auto-sync, change the sync-since floor. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await requireUser(req);
    const { connectorId } = await ctx.params;
    const existing = await requireConnector(uid, connectorId);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (typeof body.autoSyncEnabled === "boolean") {
      updates.autoSyncEnabled = body.autoSyncEnabled;
      if (body.autoSyncEnabled) {
        updates.status = existing.status === "paused" ? "active" : existing.status;
        updates.nextSyncAt = new Date().toISOString();
      } else {
        updates.status = "paused";
      }
    }
    if (body.syncSince !== undefined) {
      if (body.syncSince === null || body.syncSince === "") {
        updates.syncSince = null;
      } else {
        const iso = parseDateToIso(body.syncSince);
        if (!iso) throw new HttpError(400, "syncSince must be a date (YYYY-MM-DD)");
        updates.syncSince = iso;
      }
    }
    if (Object.keys(updates).length === 0) throw new HttpError(400, "Nothing to update");

    await updateConnector(uid, connectorId, updates);
    return NextResponse.json({ connector: toConnectorView(await requireConnector(uid, connectorId)) });
  } catch (err) {
    return jsonError(err);
  }
}

/** Removes the connector and its stored secret. Synced entries stay in the logbook. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { uid } = await requireUser(req);
    const { connectorId } = await ctx.params;
    await requireConnector(uid, connectorId);
    await deleteConnector(uid, connectorId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
