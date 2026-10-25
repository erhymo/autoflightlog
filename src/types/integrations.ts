/**
 * Types for employer/crew-system integrations and the flight sync engine.
 *
 * Data layout in Firestore (all under users/{uid}/):
 * - integrationRequests/{requestId}  - a pilot's request to an employer, with
 *                                      the tokenized setup link (owner-readable)
 * - connectors/{connectorId}         - connection config + sync state. Owner-
 *                                      readable, but NEVER holds the secret.
 * - connectorSecrets/{connectorId}   - the API key/token, encrypted at rest
 *                                      (src/lib/crypto/secretBox.ts). Server-
 *                                      only: denied to the client SDK in
 *                                      firestore.rules.
 * - syncIgnored/{entryId}            - tombstones for synced entries the pilot
 *                                      deleted, so a later sync doesn't
 *                                      resurrect them.
 */

export type ConnectorAuthType = "api_key" | "bearer_token" | "basic" | "none";

/**
 * - inactive: configured but not yet activated (employer flow: waiting for
 *   a successful test + "Activate")
 * - active:   sync runs on schedule / on demand
 * - paused:   pilot switched auto-sync off; manual "Sync now" still works
 * - error:    last test or sync failed; see lastTestError / lastSyncError
 */
export type ConnectorStatus = "inactive" | "active" | "paused" | "error";

/** Which adapter in src/lib/sync/adapters understands this connector's API. */
export type ConnectorProvider = "generic_json";

export type ConnectorConfiguredBy = "pilot" | "employer";

export type SyncStatus = "ok" | "error";

export interface SyncSummary {
  fetched: number;
  created: number;
  /** Existing manual entries matched by date/route and adopted into sync. */
  linked: number;
  updated: number;
  unchanged: number;
  /** Records skipped because the pilot deleted that synced entry earlier. */
  ignored: number;
  /** Records dropped because they had no usable externalKey or date. */
  invalid: number;
}

export type DurationFormat = "auto" | "minutes" | "hours_decimal" | "hhmm";

export interface GenericJsonPagination {
  type: "none" | "page" | "cursor";
  /** Query param carrying the page number (type "page"). */
  pageParam?: string;
  /** First page number, default 1 (type "page"). */
  startPage?: number;
  /** Optional query param for page size, with the value to send. */
  pageSizeParam?: string;
  pageSize?: number;
  /** Query param carrying the cursor (type "cursor"). */
  cursorParam?: string;
  /** Dot-path in the response body to the next cursor (type "cursor"). */
  nextCursorPath?: string;
  /** Safety cap on pages fetched per sync. Default 50. */
  maxPages?: number;
}

/**
 * Configuration for the generic JSON adapter: enough to describe most
 * "GET a list of flights" REST endpoints without writing code. Paths are
 * dot-separated with optional [index] segments, e.g. "data.flights" or
 * "legs[0].dep.icao".
 */
export interface GenericJsonConfig {
  /** Appended to the connector's apiBaseUrl, e.g. "/v1/flights". */
  flightsPath: string;
  /** Static query params always sent. */
  queryParams?: Record<string, string>;
  /** Query param that should carry the pilot's crew ID, if the API needs it. */
  crewIdParam?: string;
  /** Query param for incremental fetches ("only flights after this date"). */
  sinceParam?: string;
  sinceFormat?: "date" | "datetime";
  /** Dot-path to the array of flight records in the response. Empty = root. */
  recordsPath?: string;
  /** Dot-path (within a record) to a stable unique id for the flight. */
  externalKeyPath: string;
  /** EASA field id (src/types/fieldCatalog.ts) -> dot-path within a record. */
  fields: Record<string, string>;
  durationFormat?: DurationFormat;
  pagination?: GenericJsonPagination;
}

export interface Connector {
  id: string;
  provider: ConnectorProvider;
  companyName: string;
  crewId?: string;
  /** Set when created through the employer setup link. */
  requestId?: string;
  configuredBy: ConnectorConfiguredBy;

  apiBaseUrl: string;
  authType: ConnectorAuthType;
  /** Header name for authType "api_key". Default "X-API-Key". */
  authHeaderName?: string;
  /** True once a secret is stored in connectorSecrets/{id}. */
  hasSecret: boolean;
  config: GenericJsonConfig;

  status: ConnectorStatus;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  /** ISO date: never import flights before this date. */
  syncSince?: string;
  nextSyncAt?: string;

  lastTestAt?: string;
  lastTestError?: string;
  lastSyncAt?: string;
  lastSyncAttemptAt?: string;
  lastSyncStatus?: SyncStatus;
  lastSyncError?: string;
  lastSyncSummary?: SyncSummary;
  consecutiveFailures: number;

  createdAt: string;
  updatedAt: string;
}

export interface ConnectorSecretDoc {
  connectorId: string;
  /** Output of src/lib/crypto/secretBox.ts encrypt(). */
  ciphertext: string;
  updatedAt: string;
}

export type IntegrationRequestStatus = "draft" | "sent" | "configured" | "active";

export interface IntegrationRequest {
  id: string;
  companyName: string;
  contactEmail: string;
  crewId: string;
  createdAt: string;
  status: IntegrationRequestStatus;
  setupToken: string;
  /** ISO timestamp after which the setup link stops working. */
  setupTokenExpiresAt?: string;
}

/**
 * One flight as returned by an adapter, already translated to EASA field ids
 * but not yet type-normalized (see src/lib/sync/flightRecord.ts).
 */
export interface FlightRecord {
  /** Stable id for this flight in the source system. */
  externalKey: string;
  values: Record<string, unknown>;
}

/** The client-facing view of a connector: never includes the secret. */
export type ConnectorView = Connector;

export const DEFAULT_SYNC_INTERVAL_MINUTES = 12 * 60;
export const SETUP_TOKEN_TTL_DAYS = 30;
