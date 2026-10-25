import type { Connector, FlightRecord } from "@/types/integrations";

export interface AdapterContext {
  connector: Connector;
  /** The decrypted API key/token; empty string for authType "none". */
  secret: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. */
  timeoutMs?: number;
}

export interface FetchFlightsOptions {
  /** ISO date; adapters that support incremental fetches only return flights on/after it. */
  since?: string;
}

export interface TestConnectionResult {
  ok: true;
  /** How many records the probe request returned - handy feedback in the UI. */
  sampleCount: number;
  /** First record, so the pilot can check that the field mapping lines up. */
  sample?: FlightRecord;
}

/**
 * One adapter per source-system API. The sync engine only ever talks to
 * this interface, so supporting a new crew system (or Airlift's specific
 * API once we know its shape) means adding an adapter, not touching the
 * engine or the Firestore layer.
 */
export interface FlightSourceAdapter {
  readonly id: Connector["provider"];
  /** Throws an AdapterError with a human-readable message on failure. */
  testConnection(ctx: AdapterContext): Promise<TestConnectionResult>;
  fetchFlights(ctx: AdapterContext, options?: FetchFlightsOptions): Promise<FlightRecord[]>;
}

export class AdapterError extends Error {
  /** HTTP status from the remote API, when the failure was an HTTP response. */
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AdapterError";
    this.status = status;
  }
}

/** Builds the auth header(s) for a request, based on the connector's auth type. */
export function buildAuthHeaders(connector: Connector, secret: string): Record<string, string> {
  switch (connector.authType) {
    case "none":
      return {};
    case "bearer_token":
      return { Authorization: `Bearer ${secret}` };
    case "basic": {
      // Secret is "username:password".
      const encoded = typeof btoa === "function" ? btoa(secret) : Buffer.from(secret, "utf8").toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "api_key":
    default:
      return { [connector.authHeaderName?.trim() || "X-API-Key"]: secret };
  }
}
