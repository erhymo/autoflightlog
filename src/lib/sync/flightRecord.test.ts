import { describe, expect, it } from "vitest";
import { getByPath, normalizeFlightRecord } from "./flightRecord";

describe("normalizeFlightRecord", () => {
  it("coerces each field to the app's canonical shape", () => {
    const result = normalizeFlightRecord({
      externalKey: " F-123 ",
      values: {
        date: "15.01.2024",
        departure: "enos",
        departureTime: "2024-01-15T07:05:00Z",
        arrival: "enbr",
        arrivalTime: "0810",
        aircraft: "aw169",
        registration: "ln-oxi",
        totalTime: "1:05",
        picTime: 65,
        landingsDay: "1",
        remarks: "Keep my Case",
      },
    });
    expect(result.externalKey).toBe("F-123");
    expect(result.values).toEqual({
      date: "2024-01-15",
      departure: "ENOS",
      departureTime: "07:05",
      arrival: "ENBR",
      arrivalTime: "08:10",
      aircraft: "AW169",
      registration: "LN-OXI",
      totalTime: 65,
      picTime: 65,
      landingsDay: 1,
      remarks: "Keep my Case",
    });
    expect(result.warnings).toEqual([]);
  });

  it("honours an explicit duration format", () => {
    expect(normalizeFlightRecord({ externalKey: "a", values: { totalTime: "1.5" } }, { durationFormat: "hours_decimal" }).values.totalTime).toBe(90);
    expect(normalizeFlightRecord({ externalKey: "a", values: { totalTime: 90 } }, { durationFormat: "minutes" }).values.totalTime).toBe(90);
    expect(normalizeFlightRecord({ externalKey: "a", values: { totalTime: "90" } }, { durationFormat: "minutes" }).values.totalTime).toBe(90);
    expect(normalizeFlightRecord({ externalKey: "a", values: { totalTime: "1,5" } }).values.totalTime).toBe(90);
    expect(normalizeFlightRecord({ externalKey: "a", values: { totalTime: 1.5 } }).values.totalTime).toBe(90);
  });

  it("drops unparseable values with a warning instead of failing the flight", () => {
    const result = normalizeFlightRecord({
      externalKey: "a",
      values: { date: "yesterday", totalTime: "lots", landingsDay: 2, bogusField: 1 },
    });
    expect(result.values).toEqual({ landingsDay: 2 });
    expect(result.warnings).toHaveLength(3);
  });

  it("skips empty values silently", () => {
    const result = normalizeFlightRecord({ externalKey: "a", values: { remarks: "", pic: null, ifrTime: undefined } });
    expect(result.values).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});

describe("getByPath", () => {
  const doc = { data: { flights: [{ dep: { icao: "ENOS" } }, { dep: { icao: "ENBR" } }] }, n: 0 };

  it("follows dot and index segments", () => {
    expect(getByPath(doc, "data.flights[1].dep.icao")).toBe("ENBR");
    expect(getByPath(doc, "data.flights.0.dep.icao")).toBe("ENOS");
    expect(getByPath(doc, "n")).toBe(0);
  });

  it("returns the root for an empty path and undefined for missing segments", () => {
    expect(getByPath(doc, "")).toBe(doc);
    expect(getByPath(doc, "data.nope.x")).toBeUndefined();
    expect(getByPath(doc, "data.flights[9].dep")).toBeUndefined();
    expect(getByPath(doc, "n.x")).toBeUndefined();
  });
});
