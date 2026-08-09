import { describe, expect, it } from "vitest";
import { calculateCurrencySummary } from "./currency";
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
});
