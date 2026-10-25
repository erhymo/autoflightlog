import { describe, expect, it } from "vitest";
import { calculateCurrencySummary, listAircraftTypes } from "./currency";
import type { LogbookEntry } from "@/types/domain";

function makeEntry(id: string, date: string, values: Record<string, any> = {}): LogbookEntry {
  return {
    id,
    templateId: "tmpl_easa_default",
    values: { date, ...values },
    source: { system: "manual" },
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

const NOW = new Date("2026-08-09T12:00:00.000Z");

describe("calculateCurrencySummary", () => {
  it("requires 3 landings in 90 days for passenger currency", () => {
    const entries = [
      makeEntry("e1", "2026-07-01", { landingsDay: 1 }),
      makeEntry("e2", "2026-07-15", { landingsDay: 1 }),
    ];
    const summary = calculateCurrencySummary(entries, NOW);
    expect(summary.passengerLandings90.actualCount).toBe(2);
    expect(summary.passengerLandings90.missingCount).toBe(1);
    expect(summary.passengerLandings90.isMet).toBe(false);
  });

  it("is current once 3 landings exist within the 90-day window", () => {
    const entries = [
      makeEntry("e1", "2026-07-01", { landingsDay: 2 }),
      makeEntry("e2", "2026-07-15", { landingsDay: 1 }),
    ];
    const summary = calculateCurrencySummary(entries, NOW);
    expect(summary.passengerLandings90.actualCount).toBe(3);
    expect(summary.passengerLandings90.isMet).toBe(true);
    expect(summary.passengerLandings90.expiresAt).not.toBeNull();
  });

  it("excludes landings older than the 90-day window", () => {
    const entries = [
      // 2026-08-09 minus 90 days is 2026-05-11, so this landing is just outside the window.
      makeEntry("old", "2026-05-01", { landingsDay: 3 }),
    ];
    const summary = calculateCurrencySummary(entries, NOW);
    expect(summary.passengerLandings90.actualCount).toBe(0);
    expect(summary.passengerLandings90.isMet).toBe(false);
  });

  it("counts night landings toward both passenger and night currency", () => {
    const entries = [makeEntry("e1", "2026-08-01", { landingsNight: 1 })];
    const summary = calculateCurrencySummary(entries, NOW);
    expect(summary.passengerLandings90.actualCount).toBe(1);
    expect(summary.nightPassengerLandings90.actualCount).toBe(1);
    expect(summary.nightPassengerLandings90.isMet).toBe(true);
  });

  it("sums IFR and night minutes only within the 90-day window", () => {
    const entries = [
      makeEntry("recent", "2026-08-01", { ifrTime: 30, nightTime: 20 }),
      makeEntry("old", "2026-01-01", { ifrTime: 999, nightTime: 999 }),
    ];
    const summary = calculateCurrencySummary(entries, NOW);
    expect(summary.ifrMinutes90).toBe(30);
    expect(summary.nightMinutes90).toBe(20);
  });

  it("ignores entries with an unparseable date", () => {
    const entries = [makeEntry("bad", "not-a-date", { landingsDay: 5 })];
    const summary = calculateCurrencySummary(entries, NOW);
    expect(summary.passengerLandings90.actualCount).toBe(0);
  });

  it("filters to one aircraft type when asked, matching case-insensitively", () => {
    const entries = [
      makeEntry("h1", "2026-08-01", { aircraft: "AW169", landingsDay: 2 }),
      makeEntry("h2", "2026-08-02", { aircraft: "aw169", landingsDay: 1 }),
      makeEntry("a1", "2026-08-03", { aircraft: "AS350", landingsDay: 3 }),
    ];
    const all = calculateCurrencySummary(entries, NOW);
    expect(all.passengerLandings90.actualCount).toBe(6);
    expect(all.aircraftType).toBeNull();

    const aw169 = calculateCurrencySummary(entries, NOW, { aircraftType: "AW169" });
    expect(aw169.passengerLandings90.actualCount).toBe(3);
    expect(aw169.passengerLandings90.isMet).toBe(true);
    expect(aw169.aircraftType).toBe("AW169");

    const as350 = calculateCurrencySummary(entries, NOW, { aircraftType: "AS350" });
    expect(as350.passengerLandings90.actualCount).toBe(3);
  });
});

describe("listAircraftTypes", () => {
  it("returns distinct types, most recently flown first", () => {
    const entries = [
      makeEntry("1", "2026-01-01", { aircraft: "AS350" }),
      makeEntry("2", "2026-08-01", { aircraft: "aw169" }),
      makeEntry("3", "2026-05-01", { aircraft: "AS350" }),
      makeEntry("4", "2026-06-01", {}),
    ];
    expect(listAircraftTypes(entries)).toEqual(["AW169", "AS350"]);
  });
});
