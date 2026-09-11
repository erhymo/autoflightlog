import { describe, expect, it } from "vitest";
import { getMirroredRoleFieldKeys } from "./logbookDefaults";
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
