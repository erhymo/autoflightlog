import { describe, expect, it } from "vitest";
import { computeTotalTimeMinutes, normalizeDurationMinutes, parseClockTimeToMinutes } from "./timeUnits";

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
