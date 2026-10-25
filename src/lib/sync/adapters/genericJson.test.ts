import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@/types/integrations";
import { genericJsonAdapter, validateGenericJsonConfig } from "./genericJson";
import { AdapterError } from "./types";

const base: Connector = {
  id: "c1",
  provider: "generic_json",
  companyName: "Test",
  crewId: "P123",
  configuredBy: "pilot",
  apiBaseUrl: "https://api.example.com/v1/",
  authType: "api_key",
  authHeaderName: "X-Api-Key",
  hasSecret: true,
  config: {
    flightsPath: "/flights",
    crewIdParam: "crew",
    sinceParam: "from",
    recordsPath: "data.items",
    externalKeyPath: "id",
    fields: { date: "legDate", departure: "dep.icao", arrival: "arr.icao", totalTime: "block" },
  },
  status: "active",
  autoSyncEnabled: true,
  syncIntervalMinutes: 720,
  consecutiveFailures: 0,
  createdAt: "",
  updatedAt: "",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("validateGenericJsonConfig", () => {
  it("lists every missing required part", () => {
    expect(validateGenericJsonConfig(undefined)).toEqual(["Missing adapter configuration"]);
    const problems = validateGenericJsonConfig({ fields: { departure: "x" } });
    expect(problems.join(" ")).toContain("flightsPath");
    expect(problems.join(" ")).toContain("externalKeyPath");
    expect(problems.join(" ")).toContain("fields.date");
  });

  it("accepts a complete config", () => {
    expect(validateGenericJsonConfig(base.config)).toEqual([]);
  });
});

describe("genericJsonAdapter.fetchFlights", () => {
  it("builds the URL with auth header, crew id and since filter, and maps fields", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.example.com/v1/flights?crew=P123&from=2026-01-01");
      expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe("s3cret");
      return jsonResponse({ data: { items: [{ id: 7, legDate: "2026-01-02", dep: { icao: "ENOS" }, arr: { icao: "ENBR" }, block: 65 }] } });
    });

    const flights = await genericJsonAdapter.fetchFlights({ connector: base, secret: "s3cret", fetchImpl: fetchImpl as unknown as typeof fetch }, { since: "2026-01-01" });
    expect(flights).toEqual([{ externalKey: "7", values: { date: "2026-01-02", departure: "ENOS", arrival: "ENBR", totalTime: 65 } }]);
  });

  it("walks page-based pagination until a short page", async () => {
    const pages: Record<string, unknown[]> = {
      "1": [{ id: "a", legDate: "2026-01-01" }, { id: "b", legDate: "2026-01-02" }],
      "2": [{ id: "c", legDate: "2026-01-03" }],
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const page = new URL(String(url)).searchParams.get("page") ?? "?";
      return jsonResponse({ data: { items: pages[page] ?? [] } });
    });
    const connector: Connector = {
      ...base,
      config: { ...base.config, pagination: { type: "page", pageParam: "page", pageSizeParam: "limit", pageSize: 2 } },
    };
    const flights = await genericJsonAdapter.fetchFlights({ connector, secret: "x", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(flights.map((f) => f.externalKey)).toEqual(["a", "b", "c"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("follows cursors and stops when the API repeats itself", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const cursor = new URL(String(url)).searchParams.get("cursor");
      if (!cursor) return jsonResponse({ data: { items: [{ id: "a", legDate: "2026-01-01" }] }, next: "c2" });
      // Buggy API: returns the same record and the same cursor forever.
      return jsonResponse({ data: { items: [{ id: "a", legDate: "2026-01-01" }] }, next: "c2" });
    });
    const connector: Connector = {
      ...base,
      config: { ...base.config, pagination: { type: "cursor", cursorParam: "cursor", nextCursorPath: "next" } },
    };
    const flights = await genericJsonAdapter.fetchFlights({ connector, secret: "x", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(flights).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("turns HTTP and shape problems into readable AdapterErrors", async () => {
    const unauthorized = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    await expect(genericJsonAdapter.fetchFlights({ connector: base, secret: "x", fetchImpl: unauthorized as unknown as typeof fetch })).rejects.toThrow(/Authentication rejected/);

    const wrongShape = vi.fn(async () => jsonResponse({ data: { items: { not: "a list" } } }));
    await expect(genericJsonAdapter.fetchFlights({ connector: base, secret: "x", fetchImpl: wrongShape as unknown as typeof fetch })).rejects.toThrow(/Expected a list/);

    const notJson = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(genericJsonAdapter.fetchFlights({ connector: base, secret: "x", fetchImpl: notJson as unknown as typeof fetch })).rejects.toBeInstanceOf(AdapterError);
  });
});

describe("genericJsonAdapter.testConnection", () => {
  it("returns a sample record on success", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { items: [{ id: 1, legDate: "2026-01-02" }] } }));
    const result = await genericJsonAdapter.testConnection({ connector: base, secret: "x", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(true);
    expect(result.sampleCount).toBe(1);
    expect(result.sample?.externalKey).toBe("1");
  });

  it("fails when the external key path does not resolve", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { items: [{ flightId: 1 }] } }));
    await expect(genericJsonAdapter.testConnection({ connector: base, secret: "x", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/externalKeyPath/);
  });

  it("uses a bearer header when configured", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      return jsonResponse({ data: { items: [] } });
    });
    const connector: Connector = { ...base, authType: "bearer_token" };
    await genericJsonAdapter.testConnection({ connector, secret: "tok", fetchImpl: fetchImpl as unknown as typeof fetch });
  });
});
