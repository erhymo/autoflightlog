import type { FlightRecord, GenericJsonConfig } from "@/types/integrations";
import { formatSince } from "@/lib/logbook/dateUtils";
import { getByPath } from "@/lib/sync/flightRecord";
import {
  AdapterError,
  buildAuthHeaders,
  type AdapterContext,
  type FetchFlightsOptions,
  type FlightSourceAdapter,
  type TestConnectionResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_PAGES = 50;

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  if (!path) return b;
  return path.startsWith("/") ? `${b}${path}` : `${b}/${path}`;
}

/**
 * Validates the parts of a generic-JSON config the adapter can't work
 * without. Returns a list of problems (empty = fine) so the UI can show
 * them all at once.
 */
export function validateGenericJsonConfig(config: Partial<GenericJsonConfig> | undefined): string[] {
  const problems: string[] = [];
  if (!config) return ["Missing adapter configuration"];
  if (!config.flightsPath || typeof config.flightsPath !== "string") problems.push("flightsPath is required (e.g. \"/flights\")");
  if (!config.externalKeyPath || typeof config.externalKeyPath !== "string") problems.push("externalKeyPath is required (a stable id per flight)");
  if (!config.fields || typeof config.fields !== "object" || Object.keys(config.fields).length === 0) {
    problems.push("fields must map at least one EASA field to a path in the record");
  } else if (!config.fields.date) {
    problems.push("fields.date is required (the flight date)");
  }
  const p = config.pagination;
  if (p) {
    if (p.type === "page" && !p.pageParam) problems.push("pagination.pageParam is required for page-based pagination");
    if (p.type === "cursor" && (!p.cursorParam || !p.nextCursorPath)) {
      problems.push("pagination.cursorParam and pagination.nextCursorPath are required for cursor pagination");
    }
  }
  return problems;
}

async function fetchJson(ctx: AdapterContext, url: URL): Promise<unknown> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoFlightLog-sync/1.0",
        ...buildAuthHeaders(ctx.connector, ctx.secret),
      },
      signal: controller.signal,
      redirect: "manual",
    });
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "Request timed out" : err instanceof Error ? err.message : String(err);
    throw new AdapterError(`Could not reach ${url.host}: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AdapterError(`Authentication rejected by ${url.host} (HTTP ${response.status}) - check the API key/token`, response.status);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new AdapterError(`Unexpected redirect (HTTP ${response.status}) from ${url.host} - check the base URL`, response.status);
  }
  if (!response.ok) {
    throw new AdapterError(`HTTP ${response.status} from ${url.host}${url.pathname}`, response.status);
  }

  const text = await response.text();
  try {
    return text.length ? JSON.parse(text) : null;
  } catch {
    throw new AdapterError(`Response from ${url.host} was not valid JSON`);
  }
}

function extractRecords(body: unknown, config: GenericJsonConfig, url: URL): unknown[] {
  const list = getByPath(body, config.recordsPath ?? "");
  if (list === undefined || list === null) {
    throw new AdapterError(
      config.recordsPath
        ? `No data found at recordsPath "${config.recordsPath}" in the response from ${url.pathname}`
        : `Empty response from ${url.pathname}`
    );
  }
  if (!Array.isArray(list)) {
    throw new AdapterError(
      `Expected a list of flights at ${config.recordsPath ? `"${config.recordsPath}"` : "the response root"}, got ${typeof list}`
    );
  }
  return list;
}

function toFlightRecord(raw: unknown, config: GenericJsonConfig): FlightRecord {
  const key = getByPath(raw, config.externalKeyPath);
  const values: Record<string, unknown> = {};
  for (const [fieldId, path] of Object.entries(config.fields)) {
    if (!path) continue;
    const v = getByPath(raw, path);
    if (v !== undefined) values[fieldId] = v;
  }
  return { externalKey: key === undefined || key === null ? "" : String(key), values };
}

function buildUrl(ctx: AdapterContext, options: FetchFlightsOptions, extraParams: Record<string, string>): URL {
  const { connector } = ctx;
  const config = connector.config;
  const url = new URL(joinUrl(connector.apiBaseUrl, config.flightsPath));
  for (const [k, v] of Object.entries(config.queryParams ?? {})) url.searchParams.set(k, v);
  if (config.crewIdParam && connector.crewId) url.searchParams.set(config.crewIdParam, connector.crewId);
  if (config.sinceParam && options.since) url.searchParams.set(config.sinceParam, formatSince(options.since, config.sinceFormat));
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  return url;
}

/**
 * Adapter for any REST endpoint that returns flights as a JSON list,
 * described declaratively by GenericJsonConfig. Handles page- and
 * cursor-based pagination and an optional "since" filter for incremental
 * syncs.
 */
export const genericJsonAdapter: FlightSourceAdapter = {
  id: "generic_json",

  async testConnection(ctx): Promise<TestConnectionResult> {
    const problems = validateGenericJsonConfig(ctx.connector.config);
    if (problems.length) throw new AdapterError(problems.join("; "));

    const config = ctx.connector.config;
    const extra: Record<string, string> = {};
    const p = config.pagination;
    if (p?.type === "page" && p.pageParam) extra[p.pageParam] = String(p.startPage ?? 1);
    if (p?.pageSizeParam) extra[p.pageSizeParam] = String(Math.min(p.pageSize ?? 1, 5));

    const url = buildUrl(ctx, {}, extra);
    const body = await fetchJson(ctx, url);
    const records = extractRecords(body, config, url);
    const sample = records.length ? toFlightRecord(records[0], config) : undefined;
    if (sample && !sample.externalKey) {
      throw new AdapterError(`externalKeyPath "${config.externalKeyPath}" did not resolve on the first record`);
    }
    return { ok: true, sampleCount: records.length, sample };
  },

  async fetchFlights(ctx, options = {}): Promise<FlightRecord[]> {
    const problems = validateGenericJsonConfig(ctx.connector.config);
    if (problems.length) throw new AdapterError(problems.join("; "));

    const config = ctx.connector.config;
    const pagination = config.pagination ?? { type: "none" as const };
    const maxPages = pagination.maxPages ?? DEFAULT_MAX_PAGES;
    const out: FlightRecord[] = [];
    const seenKeys = new Set<string>();

    let page = pagination.startPage ?? 1;
    let cursor: string | null = null;

    for (let i = 0; i < maxPages; i++) {
      const extra: Record<string, string> = {};
      if (pagination.pageSizeParam && pagination.pageSize) extra[pagination.pageSizeParam] = String(pagination.pageSize);
      if (pagination.type === "page" && pagination.pageParam) extra[pagination.pageParam] = String(page);
      if (pagination.type === "cursor" && pagination.cursorParam && cursor) extra[pagination.cursorParam] = cursor;

      const url = buildUrl(ctx, options, extra);
      const body = await fetchJson(ctx, url);
      const records = extractRecords(body, config, url);

      let newOnThisPage = 0;
      for (const raw of records) {
        const rec = toFlightRecord(raw, config);
        // Guard against APIs that ignore the page param and return the same
        // page forever.
        if (rec.externalKey && seenKeys.has(rec.externalKey)) continue;
        if (rec.externalKey) seenKeys.add(rec.externalKey);
        out.push(rec);
        newOnThisPage++;
      }

      if (pagination.type === "none") break;
      if (records.length === 0 || newOnThisPage === 0) break;
      if (pagination.type === "page") {
        if (pagination.pageSize && records.length < pagination.pageSize) break;
        page++;
      } else if (pagination.type === "cursor") {
        const next = getByPath(body, pagination.nextCursorPath ?? "");
        if (next === undefined || next === null || next === "") break;
        cursor = String(next);
      }
    }

    return out;
  },
};
