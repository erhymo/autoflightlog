import { describe, expect, it } from "vitest";
import { parseClockTime, parseDateToIso, shiftIsoDate } from "./dateUtils";

describe("parseDateToIso", () => {
  it("accepts ISO dates and ISO datetimes without shifting the day", () => {
    expect(parseDateToIso("2024-01-15")).toBe("2024-01-15");
    expect(parseDateToIso("2024-01-15T23:30:00Z")).toBe("2024-01-15");
    expect(parseDateToIso("2024-01-15 23:30")).toBe("2024-01-15");
  });

  it("reads Norwegian dotted dates as day.month.year", () => {
    expect(parseDateToIso("15.01.2024")).toBe("2024-01-15");
    expect(parseDateToIso("5.1.2024")).toBe("2024-01-05");
  });

  it("reads slashed dates as day/month/year unless that is impossible", () => {
    expect(parseDateToIso("15/01/2024")).toBe("2024-01-15");
    expect(parseDateToIso("01/15/2024")).toBe("2024-01-15");
    expect(parseDateToIso("03/04/2024")).toBe("2024-04-03");
    expect(parseDateToIso("2024/01/15")).toBe("2024-01-15");
  });

  it("handles compact, epoch and textual formats", () => {
    expect(parseDateToIso("20240115")).toBe("2024-01-15");
    expect(parseDateToIso(Date.UTC(2024, 0, 15, 12))).toBe("2024-01-15");
    expect(parseDateToIso("15 Jan 2024")).toBe("2024-01-15");
    expect(parseDateToIso(new Date(2024, 0, 15))).toBe("2024-01-15");
  });

  it("rejects garbage and impossible dates", () => {
    expect(parseDateToIso("not-a-date")).toBeNull();
    expect(parseDateToIso("2024-02-30")).toBeNull();
    expect(parseDateToIso("")).toBeNull();
    expect(parseDateToIso(null)).toBeNull();
  });
});

describe("parseClockTime", () => {
  it("normalizes the common clock formats to HH:MM", () => {
    expect(parseClockTime("7:05")).toBe("07:05");
    expect(parseClockTime("07:05:30")).toBe("07:05");
    expect(parseClockTime("0705")).toBe("07:05");
    expect(parseClockTime("2024-01-15T13:45:00Z")).toBe("13:45");
  });

  it("rejects out-of-range or malformed times", () => {
    expect(parseClockTime("25:00")).toBeNull();
    expect(parseClockTime("abc")).toBeNull();
    expect(parseClockTime("")).toBeNull();
  });
});

describe("shiftIsoDate", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftIsoDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftIsoDate("2024-01-01", -7)).toBe("2023-12-25");
  });
});
