import { describe, expect, it } from "vitest";
import { ConnectorInputError, normalizeConnectorDoc, parseConnectorInput, defaultGenericJsonConfig } from "./connectorModel";

describe("normalizeConnectorDoc", () => {
  it("upgrades a legacy employer-flow document", () => {
    const c = normalizeConnectorDoc(
      {
        id: "conn_old",
        requestId: "req_1",
        companyName: "Acme",
        crewId: "P1",
        apiBaseUrl: "https://api.acme.com",
        authType: "bearer_token",
        secret: "plaintext",
        status: "active",
        lastTestAt: "2026-01-01T00:00:00.000Z",
        lastError: "boom",
      },
      "2026-10-25T00:00:00.000Z"
    );
    expect(c.configuredBy).toBe("employer");
    expect(c.hasSecret).toBe(true);
    expect((c as unknown as Record<string, unknown>).secret).toBeUndefined();
    expect(c.provider).toBe("generic_json");
    expect(c.config.flightsPath).toBe("/flights");
    expect(c.lastTestError).toBe("boom");
    expect(c.autoSyncEnabled).toBe(true);
    expect(c.syncIntervalMinutes).toBe(720);
    expect(c.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("defaults unknown status/auth values safely", () => {
    const c = normalizeConnectorDoc({ id: "x", status: "weird", authType: "magic" });
    expect(c.status).toBe("inactive");
    expect(c.authType).toBe("api_key");
    expect(c.autoSyncEnabled).toBe(false);
    expect(c.configuredBy).toBe("pilot");
  });
});

describe("parseConnectorInput", () => {
  const valid = {
    companyName: "Airlift",
    apiBaseUrl: "https://api.airlift.no/v1/",
    authType: "api_key",
    config: defaultGenericJsonConfig(),
    syncSince: "01.06.2026",
    syncIntervalMinutes: 360,
  };

  it("accepts and normalizes a valid payload", () => {
    const input = parseConnectorInput(valid);
    expect(input.apiBaseUrl).toBe("https://api.airlift.no/v1");
    expect(input.syncSince).toBe("2026-06-01");
    expect(input.syncIntervalMinutes).toBe(360);
    expect(input.autoSyncEnabled).toBe(true);
  });

  it("collects every problem at once", () => {
    try {
      parseConnectorInput({ apiBaseUrl: "http://insecure", authType: "nope", config: { fields: {} }, syncIntervalMinutes: 5, syncSince: "soon" });
      throw new Error("expected failure");
    } catch (err) {
      expect(err).toBeInstanceOf(ConnectorInputError);
      const problems = (err as ConnectorInputError).problems.join("\n");
      expect(problems).toContain("Company name");
      expect(problems).toContain("https://");
      expect(problems).toContain("Auth type");
      expect(problems).toContain("flightsPath");
      expect(problems).toContain("Sync interval");
      expect(problems).toContain("Sync-since");
    }
  });
});
