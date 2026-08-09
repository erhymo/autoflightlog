import { describe, expect, it } from "vitest";
import { mapCSVColumns, mapRowsToEntries, parseCSV } from "./csvImport";

describe("parseCSV", () => {
  it("parses a simple CSV with headers and rows", () => {
    const csv = "date,departure,arrival\n2026-08-01,ENOS,ENBR\n2026-08-02,ENBR,ENOS";
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["date", "departure", "arrival"]);
    expect(rows).toEqual([
      { date: "2026-08-01", departure: "ENOS", arrival: "ENBR" },
      { date: "2026-08-02", departure: "ENBR", arrival: "ENOS" },
    ]);
  });

  it("handles a quoted field containing a newline", () => {
    const csv = 'date,remarks\n2026-08-01,"line one\nline two"\n2026-08-02,ok';
    const { rows } = parseCSV(csv);
    expect(rows).toEqual([
      { date: "2026-08-01", remarks: "line one\nline two" },
      { date: "2026-08-02", remarks: "ok" },
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    const csv = 'date,remarks\n2026-08-01,"stop, then go"';
    const { rows } = parseCSV(csv);
    expect(rows[0].remarks).toBe("stop, then go");
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const csv = 'date,remarks\n2026-08-01,"say ""hi"""';
    const { rows } = parseCSV(csv);
    expect(rows[0].remarks).toBe('say "hi"');
  });

  it("handles CRLF line endings", () => {
    const csv = "date,departure\r\n2026-08-01,ENOS\r\n2026-08-02,ENBR";
    const { rows } = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: "2026-08-01", departure: "ENOS" });
  });

  it("returns empty headers/rows for empty content", () => {
    expect(parseCSV("")).toEqual({ headers: [], rows: [] });
  });
});

describe("mapCSVColumns", () => {
  it("maps exact field names with full confidence", () => {
    const mappings = mapCSVColumns(["Date", "Total Time"]);
    expect(mappings.find(m => m.csvColumn === "Date")).toMatchObject({
      fieldId: "date",
      confidence: 1,
    });
  });

  it("maps common aliases like 'reg' to registration", () => {
    const mappings = mapCSVColumns(["reg"]);
    expect(mappings[0].fieldId).toBe("registration");
  });

  it("leaves unrecognized columns unmapped", () => {
    const mappings = mapCSVColumns(["zzz_no_match_xyz"]);
    expect(mappings[0].fieldId).toBeNull();
  });
});

describe("mapRowsToEntries", () => {
  it("converts values according to field type and flags invalid numbers", () => {
    const rows = [{ Date: "2026-08-01", "Total Time (min)": "not-a-number" }];
    const mappings = mapCSVColumns(["Date", "Total Time (min)"]);
    const [entry] = mapRowsToEntries(rows, mappings);
    expect(entry.values.date).toBe("2026-08-01");
    expect(entry.values.totalTime).toBeUndefined();
    expect(entry.warnings).toEqual(["Invalid Total Time (min): not-a-number"]);
  });

  it("treats a whole-number Total Time as already being minutes", () => {
    const rows = [{ "Total Time (min)": "65" }];
    const mappings = mapCSVColumns(["Total Time (min)"]);
    const [entry] = mapRowsToEntries(rows, mappings);
    expect(entry.values.totalTime).toBe(65);
  });

  it("detects a decimal-hours Total Time and converts it to minutes", () => {
    const rows = [{ "Total Time (min)": "1.5" }];
    const mappings = mapCSVColumns(["Total Time (min)"]);
    const [entry] = mapRowsToEntries(rows, mappings);
    expect(entry.values.totalTime).toBe(90);
  });

  it("does not apply minute normalization to non-duration number fields", () => {
    const rows = [{ "Landings Day": "1.5" }];
    const mappings = mapCSVColumns(["Landings Day"]);
    const [entry] = mapRowsToEntries(rows, mappings);
    expect(entry.values.landingsDay).toBe(1.5);
  });
});
