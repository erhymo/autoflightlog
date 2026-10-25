import { describe, expect, it } from "vitest";
import { getFieldSuggestions, getMirroredRoleFieldKeys, getPrefillValuesForNewEntry } from "./logbookDefaults";
import type { LogbookEntry } from "@/types/domain";

function makeEntry(id: string, updatedAt: string, values: Record<string, any>): LogbookEntry {
  return {
    id,
    templateId: "tmpl_easa_default",
    values,
    source: { system: "manual" },
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("getMirroredRoleFieldKeys", () => {
  it("defaults to PIC when there is no prior flight on this aircraft type", () => {
    expect(getMirroredRoleFieldKeys([], "AW169")).toEqual(["picTime"]);
  });

  it("learns PIC from the most recent flight on this aircraft type", () => {
    const entries = [
      makeEntry("e1", "2026-08-01T00:00:00.000Z", { aircraft: "AW169", totalTime: 60, picTime: 60 }),
    ];
    expect(getMirroredRoleFieldKeys(entries, "AW169")).toEqual(["picTime"]);
  });

  it("learns co-pilot once the pilot's role switches on that aircraft type", () => {
    const entries = [
      makeEntry("e1", "2026-08-01T00:00:00.000Z", { aircraft: "AW169", totalTime: 60, picTime: 60 }),
      makeEntry("e2", "2026-09-01T00:00:00.000Z", { aircraft: "AW169", totalTime: 90, copilotTime: 90 }),
    ];
    expect(getMirroredRoleFieldKeys(entries, "AW169")).toEqual(["copilotTime"]);
  });

  it("keeps role learning scoped per aircraft type", () => {
    const entries = [
      makeEntry("e1", "2026-09-01T00:00:00.000Z", { aircraft: "AW169", totalTime: 90, copilotTime: 90 }),
      makeEntry("e2", "2026-08-01T00:00:00.000Z", { aircraft: "AS350", totalTime: 40, picTime: 40 }),
    ];
    expect(getMirroredRoleFieldKeys(entries, "AS350")).toEqual(["picTime"]);
    expect(getMirroredRoleFieldKeys(entries, "AW169")).toEqual(["copilotTime"]);
  });

  it("can learn multiple mirrored fields at once (e.g. multi-pilot + dual)", () => {
    const entries = [
      makeEntry("e1", "2026-08-01T00:00:00.000Z", {
        aircraft: "AW169",
        totalTime: 120,
        multiPilotTime: 120,
        dualTime: 120,
      }),
    ];
    expect(getMirroredRoleFieldKeys(entries, "AW169").sort()).toEqual(["dualTime", "multiPilotTime"].sort());
  });
});

describe("getPrefillValuesForNewEntry", () => {
  it("uses the pilot's configured defaults when there is no history", () => {
    const values = getPrefillValuesForNewEntry([], { defaultAircraft: "aw169", defaultDeparture: "enos", defaultArrival: "ENBR" });
    expect(values).toMatchObject({ aircraft: "AW169", departure: "ENOS", arrival: "ENBR" });
    expect(values.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prefers the most recent flight over the configured defaults", () => {
    const entries = [makeEntry("e1", "2026-08-01T00:00:00.000Z", { aircraft: "AS350", registration: "LN-OSM", departure: "ENBR", arrival: "ENSO" })];
    const values = getPrefillValuesForNewEntry(entries, { defaultAircraft: "AW169", defaultDeparture: "ENOS" });
    expect(values).toMatchObject({ aircraft: "AS350", registration: "LN-OSM", departure: "ENBR", arrival: "ENSO" });
  });

  it("leaves fields out entirely when neither history nor defaults exist", () => {
    const values = getPrefillValuesForNewEntry([]);
    expect(Object.keys(values)).toEqual(["date"]);
  });
});

describe("getFieldSuggestions", () => {
  it("prepends the seed only when history does not already include it", () => {
    const entries = [makeEntry("e1", "2026-08-01T00:00:00.000Z", { aircraft: "AS350" })];
    expect(getFieldSuggestions(entries, "aircraft", 8, "AW169")).toEqual(["AW169", "AS350"]);
    expect(getFieldSuggestions(entries, "aircraft", 8, "as350")).toEqual(["AS350"]);
    expect(getFieldSuggestions(entries, "aircraft", 8)).toEqual(["AS350"]);
  });
});
