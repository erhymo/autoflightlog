import { describe, expect, it } from "vitest";
import type { LogbookEntry } from "@/types/domain";
import type { Connector } from "@/types/integrations";
import { planSync, syncedEntryId } from "./planSync";

const NOW = "2026-10-25T10:00:00.000Z";

const connector: Connector = {
  id: "conn_1",
  provider: "generic_json",
  companyName: "Airlift",
  configuredBy: "pilot",
  apiBaseUrl: "https://api.example.com",
  authType: "api_key",
  hasSecret: true,
  config: { flightsPath: "/flights", externalKeyPath: "id", fields: { date: "date" } },
  status: "active",
  autoSyncEnabled: true,
  syncIntervalMinutes: 720,
  consecutiveFailures: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

function manualEntry(id: string, values: Record<string, unknown>, overrides?: Record<string, boolean>): LogbookEntry {
  return {
    id,
    templateId: "tmpl_easa_default",
    values,
    source: { system: "manual" },
    manualOverrides: overrides,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function syncedEntry(externalKey: string, values: Record<string, unknown>, overrides?: Record<string, boolean>): LogbookEntry {
  return {
    id: syncedEntryId(connector.id, externalKey),
    templateId: "tmpl_easa_default",
    values,
    source: { system: "api_sync", connectorId: connector.id, externalKey },
    manualOverrides: overrides,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("syncedEntryId", () => {
  it("is deterministic and keeps simple keys readable", () => {
    expect(syncedEntryId("c", "F123")).toBe("sync_c_F123");
    expect(syncedEntryId("c", "F123")).toBe(syncedEntryId("c", "F123"));
  });

  it("hashes keys that are not safe Firestore ids", () => {
    const id = syncedEntryId("c", "2024-01-15/ENOS-ENBR 07:05");
    expect(id).toMatch(/^sync_c_h[0-9a-f]{8}_/);
    expect(id).not.toContain("/");
    expect(id).not.toContain(" ");
  });
});

describe("planSync", () => {
  it("creates new entries with the connector as source", () => {
    const result = planSync({
      connector,
      records: [{ externalKey: "F1", values: { date: "2026-10-01", departure: "enos", arrival: "enbr", totalTime: "1:00" } }],
      existingEntries: [],
      ignoredExternalKeys: new Set(),
      nowIso: NOW,
    });
    expect(result.summary).toMatchObject({ fetched: 1, created: 1, updated: 0, linked: 0 });
    expect(result.writes).toHaveLength(1);
    expect(result.writes[0]).toMatchObject({
      id: "sync_conn_1_F1",
      values: { date: "2026-10-01", departure: "ENOS", arrival: "ENBR", totalTime: 60 },
      source: { system: "api_sync", connectorId: "conn_1", externalKey: "F1" },
      createdAt: NOW,
    });
  });

  it("updates an existing synced entry but never a manually overridden field", () => {
    const existing = syncedEntry("F1", { date: "2026-10-01", totalTime: 60, remarks: "my note" }, { remarks: true });
    const result = planSync({
      connector,
      records: [{ externalKey: "F1", values: { date: "2026-10-01", totalTime: 65, remarks: "from api" } }],
      existingEntries: [existing],
      ignoredExternalKeys: new Set(),
      nowIso: NOW,
    });
    expect(result.summary.updated).toBe(1);
    expect(result.writes[0].values).toEqual({ date: "2026-10-01", totalTime: 65, remarks: "my note" });
    expect(result.writes[0].updatedAt).toBe(NOW);
  });

  it("writes nothing when the synced entry already matches", () => {
    const existing = syncedEntry("F1", { date: "2026-10-01", totalTime: 60 });
    const result = planSync({
      connector,
      records: [{ externalKey: "F1", values: { date: "2026-10-01", totalTime: "60" } }],
      existingEntries: [existing],
      ignoredExternalKeys: new Set(),
      nowIso: NOW,
    });
    expect(result.summary.unchanged).toBe(1);
    expect(result.writes).toHaveLength(0);
  });

  it("adopts a manual entry for the same flight instead of duplicating it, keeping the pilot's values", () => {
    const manual = manualEntry("e_abc", { date: "2026-10-01", departure: "ENOS", arrival: "ENBR", totalTime: 62, picTime: 62 });
    const result = planSync({
      connector,
      records: [{ externalKey: "F1", values: { date: "2026-10-01", departure: "ENOS", arrival: "ENBR", totalTime: 60, registration: "LN-OXI" } }],
      existingEntries: [manual],
      ignoredExternalKeys: new Set(),
      nowIso: NOW,
    });
    expect(result.summary).toMatchObject({ linked: 1, created: 0 });
    const w = result.writes[0];
    expect(w.id).toBe("e_abc");
    expect(w.values).toMatchObject({ totalTime: 62, picTime: 62, registration: "LN-OXI" });
    expect(w.source).toEqual({ system: "api_sync", connectorId: "conn_1", externalKey: "F1" });
    expect(w.manualOverrides).toMatchObject({ totalTime: true, picTime: true, departure: true });
    expect(w.manualOverrides?.registration).toBeUndefined();
  });

  it("finds an adopted entry by external key on the next sync", () => {
    const adopted: LogbookEntry = {
      ...manualEntry("e_abc", { date: "2026-10-01", departure: "ENOS", arrival: "ENBR", totalTime: 62 }, { totalTime: true }),
      source: { system: "api_sync", connectorId: "conn_1", externalKey: "F1" },
    };
    const result = planSync({
      connector,
      records: [{ externalKey: "F1", values: { date: "2026-10-01", departure: "ENOS", arrival: "ENBR", totalTime: 60, landingsDay: 1 } }],
      existingEntries: [adopted],
      ignoredExternalKeys: new Set(),
      nowIso: NOW,
    });
    expect(result.summary).toMatchObject({ updated: 1, created: 0, linked: 0 });
    expect(result.writes[0].id).toBe("e_abc");
    expect(result.writes[0].values).toMatchObject({ totalTime: 62, landingsDay: 1 });
  });

  it("adopts each manual entry at most once", () => {
    const manual = manualEntry("e_abc", { date: "2026-10-01", departure: "ENOS", arrival: "ENBR" });
    const result = planSync({
      connector,
      records: [
        { externalKey: "F1", values: { date: "2026-10-01", departure: "ENOS", arrival: "ENBR" } },
        { externalKey: "F2", values: { date: "2026-10-01", departure: "ENOS", arrival: "ENBR" } },
      ],
      existingEntries: [manual],
      ignoredExternalKeys: new Set(),
      nowIso: NOW,
    });
    expect(result.summary).toMatchObject({ linked: 1, created: 1 });
  });

  it("skips ignored keys, invalid records, duplicates, and flights before syncSince", () => {
    const result = planSync({
      connector: { ...connector, syncSince: "2026-06-01" },
      records: [
        { externalKey: "F-del", values: { date: "2026-10-01" } },
        { externalKey: "", values: { date: "2026-10-01" } },
        { externalKey: "F-nodate", values: { departure: "ENOS" } },
        { externalKey: "F-old", values: { date: "2026-01-01" } },
        { externalKey: "F-new", values: { date: "2026-10-02" } },
        { externalKey: "F-new", values: { date: "2026-10-02" } },
      ],
      existingEntries: [],
      ignoredExternalKeys: new Set(["F-del"]),
      nowIso: NOW,
    });
    expect(result.summary).toMatchObject({ ignored: 1, invalid: 2, created: 1, fetched: 5 });
    expect(result.writes.map((w) => w.id)).toEqual(["sync_conn_1_F-new"]);
  });
});
