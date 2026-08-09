import { describe, expect, it } from "vitest";
import { exportToCSV } from "./csvExport";
import type { LogbookEntry } from "@/types/domain";

function makeEntry(values: Record<string, any>): LogbookEntry {
  return {
    id: "e1",
    templateId: "tmpl_easa_default",
    values,
    source: { system: "manual" },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("exportToCSV", () => {
  it("exports only the selected fields, in catalog order", () => {
    const csv = exportToCSV([makeEntry({ date: "2026-08-01", registration: "LN-OSA", aircraft: "AW169" })], {
      includeAllFields: false,
      selectedFields: ["aircraft", "date"],
    });
    const [header] = csv.split("\n");
    expect(header).toBe("Date,Aircraft type");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = exportToCSV([makeEntry({ remarks: 'stop, then go "fast"\nnext line' })], {
      includeAllFields: false,
      selectedFields: ["remarks"],
    });
    expect(csv).toBe('Remarks\n"stop, then go ""fast""\nnext line"');
  });

  it("renders missing values as an empty cell", () => {
    const csv = exportToCSV([makeEntry({})], {
      includeAllFields: false,
      selectedFields: ["date"],
    });
    const [, dataRow] = csv.split("\n");
    expect(dataRow).toBe("");
  });
});
