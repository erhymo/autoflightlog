import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  type Connector,
  type ConnectorAuthType,
  type ConnectorStatus,
  type GenericJsonConfig,
} from "@/types/integrations";
import { validateGenericJsonConfig } from "@/lib/sync/adapters/genericJson";
import { parseDateToIso } from "@/lib/logbook/dateUtils";

const AUTH_TYPES: ConnectorAuthType[] = ["api_key", "bearer_token", "basic", "none"];
const STATUSES: ConnectorStatus[] = ["inactive", "active", "paused", "error"];
export const MIN_SYNC_INTERVAL_MINUTES = 60;
export const MAX_SYNC_INTERVAL_MINUTES = 7 * 24 * 60;

/**
 * A reasonable starting point for the generic JSON adapter. The path names
 * are guesses at what a crew-system flight export typically calls things;
 * the pilot (or we, once Airlift answers) adjust them to the real API.
 */
export function defaultGenericJsonConfig(): GenericJsonConfig {
  return {
    flightsPath: "/flights",
    recordsPath: "",
    externalKeyPath: "id",
    sinceParam: "from",
    sinceFormat: "date",
    fields: {
      date: "date",
      departure: "departure",
      departureTime: "departureTime",
      arrival: "arrival",
      arrivalTime: "arrivalTime",
      aircraft: "aircraftType",
      registration: "registration",
      pic: "pic",
      totalTime: "blockMinutes",
      picTime: "picMinutes",
      copilotTime: "copilotMinutes",
      nightTime: "nightMinutes",
      ifrTime: "ifrMinutes",
      landingsDay: "landingsDay",
      landingsNight: "landingsNight",
      remarks: "remarks",
    },
    durationFormat: "auto",
    pagination: { type: "none" },
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Upgrades a raw Firestore connector document - including ones written by
 * the earlier employer-setup flow, which stored a plaintext `secret` and
 * had no provider/config - to the current Connector shape. Never returns
 * the secret itself; see src/lib/sync/server/connectorStore.ts for the
 * one-time migration of legacy plaintext secrets into encrypted storage.
 */
export function normalizeConnectorDoc(raw: Record<string, unknown>, nowIso = new Date().toISOString()): Connector {
  const status = STATUSES.includes(raw.status as ConnectorStatus) ? (raw.status as ConnectorStatus) : "inactive";
  const authType = AUTH_TYPES.includes(raw.authType as ConnectorAuthType) ? (raw.authType as ConnectorAuthType) : "api_key";
  const requestId = str(raw.requestId);
  const config = raw.config && typeof raw.config === "object" ? (raw.config as GenericJsonConfig) : defaultGenericJsonConfig();
  const legacySecret = str(raw.secret);
  const created = str(raw.createdAt) ?? str(raw.lastTestAt) ?? nowIso;

  return {
    id: String(raw.id ?? ""),
    provider: "generic_json",
    companyName: str(raw.companyName) ?? "Employer",
    crewId: str(raw.crewId),
    requestId,
    configuredBy: raw.configuredBy === "pilot" || raw.configuredBy === "employer" ? raw.configuredBy : requestId ? "employer" : "pilot",
    apiBaseUrl: str(raw.apiBaseUrl) ?? "",
    authType,
    authHeaderName: str(raw.authHeaderName),
    hasSecret: Boolean(raw.hasSecret) || Boolean(legacySecret),
    config,
    status,
    autoSyncEnabled: typeof raw.autoSyncEnabled === "boolean" ? raw.autoSyncEnabled : status === "active",
    syncIntervalMinutes: typeof raw.syncIntervalMinutes === "number" ? raw.syncIntervalMinutes : DEFAULT_SYNC_INTERVAL_MINUTES,
    syncSince: str(raw.syncSince),
    nextSyncAt: str(raw.nextSyncAt),
    lastTestAt: str(raw.lastTestAt),
    lastTestError: str(raw.lastTestError) ?? str(raw.lastError),
    lastSyncAt: str(raw.lastSyncAt),
    lastSyncAttemptAt: str(raw.lastSyncAttemptAt),
    lastSyncStatus: raw.lastSyncStatus === "ok" || raw.lastSyncStatus === "error" ? raw.lastSyncStatus : undefined,
    lastSyncError: str(raw.lastSyncError),
    lastSyncSummary: raw.lastSyncSummary && typeof raw.lastSyncSummary === "object" ? (raw.lastSyncSummary as Connector["lastSyncSummary"]) : undefined,
    consecutiveFailures: typeof raw.consecutiveFailures === "number" ? raw.consecutiveFailures : 0,
    createdAt: created,
    updatedAt: str(raw.updatedAt) ?? created,
  };
}

export interface ConnectorInput {
  companyName: string;
  crewId?: string;
  apiBaseUrl: string;
  authType: ConnectorAuthType;
  authHeaderName?: string;
  config: GenericJsonConfig;
  syncSince?: string;
  syncIntervalMinutes: number;
  autoSyncEnabled: boolean;
}

export class ConnectorInputError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join("; "));
    this.problems = problems;
  }
}

/**
 * Validates and normalizes what a pilot submits when creating or editing
 * their own connector. Throws ConnectorInputError listing every problem.
 * The secret is handled separately (it's optional on edit: an empty field
 * means "keep the one I already stored").
 */
export function parseConnectorInput(body: unknown): ConnectorInput {
  const problems: string[] = [];
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const companyName = str(b.companyName);
  if (!companyName) problems.push("Company name is required");

  const apiBaseUrl = str(b.apiBaseUrl);
  if (!apiBaseUrl) problems.push("API base URL is required");
  else if (!/^https:\/\/[^\s/]+/i.test(apiBaseUrl)) problems.push("API base URL must start with https://");

  const authType = AUTH_TYPES.includes(b.authType as ConnectorAuthType) ? (b.authType as ConnectorAuthType) : null;
  if (!authType) problems.push(`Auth type must be one of ${AUTH_TYPES.join(", ")}`);

  const authHeaderName = str(b.authHeaderName);
  if (authHeaderName && !/^[A-Za-z0-9-]+$/.test(authHeaderName)) problems.push("Auth header name may only contain letters, digits and dashes");

  let config: GenericJsonConfig | null = null;
  if (b.config && typeof b.config === "object") {
    config = b.config as GenericJsonConfig;
    problems.push(...validateGenericJsonConfig(config));
  } else {
    problems.push("Adapter configuration is required");
  }

  let syncSince: string | undefined;
  if (b.syncSince !== undefined && b.syncSince !== null && b.syncSince !== "") {
    const iso = parseDateToIso(b.syncSince);
    if (!iso) problems.push("Sync-since must be a date (YYYY-MM-DD)");
    else syncSince = iso;
  }

  let syncIntervalMinutes = DEFAULT_SYNC_INTERVAL_MINUTES;
  if (b.syncIntervalMinutes !== undefined) {
    const n = Number(b.syncIntervalMinutes);
    if (!Number.isFinite(n) || n < MIN_SYNC_INTERVAL_MINUTES || n > MAX_SYNC_INTERVAL_MINUTES) {
      problems.push(`Sync interval must be between ${MIN_SYNC_INTERVAL_MINUTES} and ${MAX_SYNC_INTERVAL_MINUTES} minutes`);
    } else {
      syncIntervalMinutes = Math.round(n);
    }
  }

  if (problems.length) throw new ConnectorInputError(problems);

  return {
    companyName: companyName!,
    crewId: str(b.crewId),
    apiBaseUrl: apiBaseUrl!.replace(/\/+$/, ""),
    authType: authType!,
    authHeaderName,
    config: config!,
    syncSince,
    syncIntervalMinutes,
    autoSyncEnabled: b.autoSyncEnabled !== false,
  };
}

/** Strips any field that must never reach the browser (defensive; the secret lives in another doc anyway). */
export function toConnectorView(connector: Connector): Connector {
  const copy = { ...connector } as Connector & { secret?: unknown };
  delete copy.secret;
  return copy;
}
