import { NextRequest, NextResponse } from "next/server";
import { EmployerSetupError, requireIntegrationRequestByToken } from "@/lib/admin/employerSetup";
import { jsonError } from "@/lib/auth/serverAuth";
import { defaultGenericJsonConfig, toConnectorView } from "@/lib/sync/connectorModel";
import { validateGenericJsonConfig } from "@/lib/sync/adapters";
import { findConnectorByRequestId, saveConnector, storeSecret } from "@/lib/sync/server/connectorStore";
import { testConnector } from "@/lib/sync/server/runSync";
import { DEFAULT_SYNC_INTERVAL_MINUTES, type Connector, type ConnectorAuthType, type GenericJsonConfig } from "@/types/integrations";

export const runtime = "nodejs";
export const maxDuration = 30;

const AUTH_TYPES: ConnectorAuthType[] = ["api_key", "bearer_token", "basic", "none"];

/**
 * Saves the employer's API details for this request and immediately makes
 * a real request against the API to verify them. The secret goes straight
 * into encrypted storage and is never echoed back.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : null;
    const { uid, request, ref } = await requireIntegrationRequestByToken(requestId, token);

    const apiBaseUrl = typeof body.apiBaseUrl === "string" ? body.apiBaseUrl.trim().replace(/\/+$/, "") : "";
    if (!/^https:\/\/[^\s/]+/i.test(apiBaseUrl)) throw new EmployerSetupError("Base URL must start with https://", 400);

    const authType = AUTH_TYPES.includes(body.authType as ConnectorAuthType) ? (body.authType as ConnectorAuthType) : "api_key";
    const authHeaderName =
      typeof body.authHeaderName === "string" && /^[A-Za-z0-9-]+$/.test(body.authHeaderName.trim()) ? body.authHeaderName.trim() : undefined;
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";

    const existing = await findConnectorByRequestId(uid, requestId);
    if (authType !== "none" && !secret && !existing?.hasSecret) {
      throw new EmployerSetupError("An API key/token is required", 400);
    }

    let config: GenericJsonConfig = existing?.config ?? defaultGenericJsonConfig();
    if (body.config && typeof body.config === "object") {
      const problems = validateGenericJsonConfig(body.config as GenericJsonConfig);
      if (problems.length) throw new EmployerSetupError(problems.join("; "), 400);
      config = body.config as GenericJsonConfig;
    }

    const nowIso = new Date().toISOString();
    const connector: Connector = {
      id: existing?.id ?? "conn_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      provider: "generic_json",
      companyName: request.companyName,
      crewId: request.crewId,
      requestId,
      configuredBy: "employer",
      apiBaseUrl,
      authType,
      authHeaderName,
      hasSecret: existing?.hasSecret ?? false,
      config,
      status: existing?.status === "active" ? "active" : "inactive",
      autoSyncEnabled: existing?.autoSyncEnabled ?? false,
      syncIntervalMinutes: existing?.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
      syncSince: existing?.syncSince,
      nextSyncAt: existing?.nextSyncAt,
      lastSyncAt: existing?.lastSyncAt,
      lastSyncStatus: existing?.lastSyncStatus,
      lastSyncSummary: existing?.lastSyncSummary,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    await saveConnector(uid, connector);
    if (secret) await storeSecret(uid, connector.id, secret);
    if (request.status === "draft" || request.status === "sent") {
      await ref.set({ status: "configured" }, { merge: true });
    }

    const result = await testConnector(uid, connector.id);
    return NextResponse.json({ ...result, connector: toConnectorView(result.connector) }, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return jsonError(err);
  }
}
