"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCSV, mapCSVColumns, mapRowsToEntries, ColumnMapping, MappedEntry } from "@/lib/csvImport";
import { listEntries, upsertEntry } from "@/lib/repo/firestoreRepos";
import { LogbookEntry } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";

function nowIso() {
  return new Date().toISOString();
}

type Step = "upload" | "mapping" | "review" | "complete";

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCSVHeaders] = useState<string[]>([]);
  const [csvRows, setCSVRows] = useState<any[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [mappedEntries, setMappedEntries] = useState<MappedEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    const parsed = parseCSV(content);
    
    setCSVHeaders(parsed.headers);
    setCSVRows(parsed.rows);
    
    const autoMappings = mapCSVColumns(parsed.headers);
    setMappings(autoMappings);
    
    setStep("mapping");
  }

  function handleMappingChange(csvColumn: string, fieldId: string | null) {
    setMappings(prev => prev.map(m => 
      m.csvColumn === csvColumn ? { ...m, fieldId, confidence: fieldId ? 1.0 : 0 } : m
    ));
  }

  async function proceedToReview() {
    const entries = mapRowsToEntries(csvRows, mappings);
    
    // Check for duplicates
    const existingEntries = await listEntries();
    const entriesWithDuplicateCheck = entries.map(entry => {
      const duplicate = existingEntries.find(existing => 
        existing.values.date === entry.values.date &&
        existing.values.departure === entry.values.departure &&
        existing.values.arrival === entry.values.arrival
      );
      
      return {
        ...entry,
        isDuplicate: !!duplicate,
        duplicateOf: duplicate?.id,
      };
    });

    setMappedEntries(entriesWithDuplicateCheck);
    setSelectedEntries(new Set(entriesWithDuplicateCheck.map((_, i) => i).filter(i => !entriesWithDuplicateCheck[i].isDuplicate)));
    setStep("review");
  }

  function toggleEntry(index: number) {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function handleImport() {
    setImporting(true);
    
    for (const index of selectedEntries) {
      const entry = mappedEntries[index];
      const logbookEntry: LogbookEntry = {
        id: "e_" + Math.random().toString(36).slice(2),
        templateId: "tmpl_easa_default",
        values: entry.values,
        source: { system: "csv_import" },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      
      await upsertEntry(logbookEntry);
    }
    
    setImporting(false);
    setStep("complete");
  }

  if (step === "upload") {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <button
            onClick={() => router.push("/app/me")}
            className="text-sm mb-4 flex items-center gap-2 transition-colors"
            style={{ color: "var(--aviation-blue)" }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.7"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            ← Back to Settings
          </button>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Import Logbook
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Upload a CSV file to import your flight records
          </p>
        </div>

        <div
          className="rounded-xl border-2 border-dashed p-12 text-center"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)"
          }}
        >
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              style={{ color: "var(--text-muted)" }}
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <label className="cursor-pointer">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--aviation-blue)" }}
            >
              Click to upload
            </span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {" "}or drag and drop
            </span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            CSV files only
          </p>
        </div>
      </div>
    );
  }

  if (step === "mapping") {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Map Columns
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Review and adjust the automatic column mapping
          </p>
        </div>

        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)"
          }}
        >
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--bg-primary)" }}>
              <tr className="border-b" style={{ borderColor: "var(--border-default)" }}>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                  CSV Column
                </th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Maps To
                </th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, idx) => (
                <tr key={idx} className="border-t" style={{ borderColor: "var(--border-light)" }}>
                  <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                    {mapping.csvColumn}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapping.fieldId || ""}
                      onChange={(e) => handleMappingChange(mapping.csvColumn, e.target.value || null)}
                      className="rounded-lg border px-3 py-2 text-sm w-full"
                      style={{
                        borderColor: "var(--border-default)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)"
                      }}
                    >
                      <option value="">-- Skip --</option>
                      {FIELD_CATALOG.map(field => (
                        <option key={field.id} value={field.key || field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: mapping.confidence > 0.8 ? "var(--status-active)" :
                                       mapping.confidence > 0.5 ? "var(--status-pending)" : "var(--status-error)",
                        color: "white"
                      }}
                    >
                      {Math.round(mapping.confidence * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("upload")}
            className="px-6 py-2.5 rounded-lg border font-medium transition-colors"
            style={{
              borderColor: "var(--border-default)",
              color: "var(--text-primary)"
            }}
          >
            Back
          </button>
          <button
            onClick={proceedToReview}
            className="px-6 py-2.5 rounded-lg font-medium text-white transition-opacity"
            style={{ backgroundColor: "var(--aviation-blue)" }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            Continue to Review
          </button>
        </div>
      </div>
    );
  }

  if (step === "review") {
    const validEntries = mappedEntries.filter((_, i) => selectedEntries.has(i));

    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Review Import
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {validEntries.length} of {mappedEntries.length} entries selected for import
          </p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {mappedEntries.map((entry, idx) => (
            <div
              key={idx}
              className="rounded-xl border p-4"
              style={{
                backgroundColor: entry.isDuplicate ? "#FEF3C7" : "var(--bg-card)",
                borderColor: entry.isDuplicate ? "var(--status-pending)" : "var(--border-default)",
                opacity: selectedEntries.has(idx) ? 1 : 0.5
              }}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedEntries.has(idx)}
                  onChange={() => toggleEntry(idx)}
                  className="mt-1 w-4 h-4"
                  style={{ accentColor: "var(--aviation-blue)" }}
                />
                <div className="flex-1">
                  <div className="flex gap-4 flex-wrap text-sm">
                    {Object.entries(entry.values).map(([key, value]) => {
                      const field = FIELD_CATALOG.find(f => f.key === key || f.id === key);
                      return (
                        <div key={key}>
                          <span style={{ color: "var(--text-secondary)" }}>{field?.name}: </span>
                          <span style={{ color: "var(--text-primary)" }} className="font-medium">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                  {entry.warnings.length > 0 && (
                    <div className="mt-2 text-xs" style={{ color: "var(--status-error)" }}>
                      {entry.warnings.join(", ")}
                    </div>
                  )}
                  {entry.isDuplicate && (
                    <div className="mt-2 text-xs font-medium" style={{ color: "#92400E" }}>
                      ⚠ Possible duplicate entry
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("mapping")}
            className="px-6 py-2.5 rounded-lg border font-medium transition-colors"
            style={{
              borderColor: "var(--border-default)",
              color: "var(--text-primary)"
            }}
          >
            Back
          </button>
          <button
            onClick={handleImport}
            disabled={importing || validEntries.length === 0}
            className="px-6 py-2.5 rounded-lg font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--aviation-blue)" }}
          >
            {importing ? "Importing..." : `Import ${validEntries.length} Entries`}
          </button>
        </div>
      </div>
    );
  }

  if (step === "complete") {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div
          className="rounded-xl border p-8 text-center"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)"
          }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: "var(--status-active)" }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--aviation-blue)" }}>
            Import Complete
          </h2>
          <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
            Successfully imported {selectedEntries.size} entries to your logbook
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push("/app/logbook")}
              className="px-6 py-2.5 rounded-lg font-medium text-white transition-opacity"
              style={{ backgroundColor: "var(--aviation-blue)" }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
              onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            >
              View Logbook
            </button>
            <button
              onClick={() => router.push("/app/me")}
              className="px-6 py-2.5 rounded-lg border font-medium transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)"
              }}
            >
              Back to Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

