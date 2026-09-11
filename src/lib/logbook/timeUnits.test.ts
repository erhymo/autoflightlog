import { describe, expect, it } from "vitest";
import {
  computeTotalTimeMinutes,
  formatMinutesToHHMM,
  migrateLegacyDurationFields,
  normalizeDurationMinutes,
  parseClockTimeToMinutes,
  parseTimeInput,
} from "./timeUnits";
import type { LogbookEntry } from "@/types/domain";

function makeEntry(values: Record<string, any>): LogbookEntry {
  return {
    id: "e1",
    templateId: "tmpl_easa_default",
    values,
    source: { system: "manual" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("parseClockTimeToMinutes", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseClockTimeToMinutes("09:15")).toBe(555);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseClockTimeToMinutes("")).toBeNull();
    expect(parseClockTimeToMinutes(undefined)).toBeNull();
    expect(parseClockTimeToMinutes("not-a-time")).toBeNull();
  });
});

describe("computeTotalTimeMinutes", () => {
  it("computes a same-day flight duration in minutes", () => {
    expect(computeTotalTimeMinutes("09:00", "09:42")).toBe(42);
  });

  it("handles a flight that crosses midnight", () => {
    expect(computeTotalTimeMinutes("23:30", "00:15")).toBe(45);
  });

  it("returns null when either time is missing", () => {
    expect(computeTotalTimeMinutes("09:00", "")).toBeNull();
    expect(computeTotalTimeMinutes("", "09:00")).toBeNull();
  });
});

describe("normalizeDurationMinutes", () => {
  it("treats a whole number as already being minutes", () => {
    expect(normalizeDurationMinutes("65")).toBe(65);
    expect(normalizeDurationMinutes(90)).toBe(90);
  });

  it("detects a decimal-hours value and converts it to minutes", () => {
    expect(normalizeDurationMinutes("1.5")).toBe(90);
    expect(normalizeDurationMinutes("0.7")).toBe(42);
  });

  it("treats a Norwegian decimal comma as decimal hours too", () => {
    expect(normalizeDurationMinutes("1,5")).toBe(90);
  });

  it("returns 0 for empty or non-numeric input", () => {
    expect(normalizeDurationMinutes("")).toBe(0);
    expect(normalizeDurationMinutes(null)).toBe(0);
    expect(normalizeDurationMinutes("abc")).toBe(0);
  });
});

describe("parseTimeInput", () => {
  it("parses H:MM as hours and minutes", () => {
    expect(parseTimeInput("1:21")).toBe(81);
    expect(parseTimeInput("0:46")).toBe(46);
    expect(parseTimeInput("12:05")).toBe(725);
  });

  it("falls back to decimal-hours / plain-minutes for input with no colon", () => {
    expect(parseTimeInput("1.5")).toBe(90);
    expect(parseTimeInput("90")).toBe(90);
  });

  it("returns 0 for empty input", () => {
    expect(parseTimeInput("")).toBe(0);
    expect(parseTimeInput(null)).toBe(0);
  });
});

describe("formatMinutesToHHMM", () => {
  it("formats whole minutes as HH:MM", () => {
    expect(formatMinutesToHHMM(515)).toBe("08:35");
    expect(formatMinutesToHHMM(0)).toBe("00:00");
  });

  it("rounds away stray float noise instead of leaking decimals", () => {
    expect(formatMinutesToHHMM(515.7)).toBe("08:36");
    expect(formatMinutesToHHMM(35.699999999999996)).toBe("00:36");
  });

  it("clamps negative input to zero", () => {
    expect(formatMinutesToHHMM(-5)).toBe("00:00");
  });
});

describe("migrateLegacyDurationFields", () => {
  it("converts a pre-fix decimal-hours value to minutes", () => {
    const entry = makeEntry({ totalTime: 0.7, picTime: 0.7, landingsDay: 1 });
    const { entry: migrated, changed } = migrateLegacyDurationFields(entry);
    expect(changed).toBe(true);
    expect(migrated.values.totalTime).toBe(42);
    expect(migrated.values.picTime).toBe(42);
    // Non-duration fields are left untouched.
    expect(migrated.values.landingsDay).toBe(1);
  });

  it("leaves already-correct whole-minute values untouched", () => {
    const entry = makeEntry({ totalTime: 515, picTime: "515", nightTime: 0 });
    const { entry: migrated, changed } = migrateLegacyDurationFields(entry);
    expect(changed).toBe(false);
    expect(migrated).toBe(entry);
  });

  it("ignores empty duration fields", () => {
    const entry = makeEntry({ totalTime: "" });
    const { changed } = migrateLegacyDurationFields(entry);
    expect(changed).toBe(false);
  });
});
