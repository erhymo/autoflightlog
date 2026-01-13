"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listEntries, getView } from "@/lib/repo/firestoreRepos";
import { LogbookEntry, ViewDefinition } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { exportToCSV, downloadCSV, generateExportFilename } from "@/lib/csvExport";
import { exportToPDF, downloadPDF, getPDFBase64, estimateEntriesPerPage } from "@/lib/pdfExport";

type ExportFormat = "csv" | "pdf";
type EntrySelection = "all" | "last5" | "last15" | "last30" | "dateRange";

export default function ExportPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [view, setView] = useState<ViewDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [includeAllFields, setIncludeAllFields] = useState(false);
  const [entrySelection, setEntrySelection] = useState<EntrySelection>("all");
  const [emailAddresses, setEmailAddresses] = useState("");
  const [emailSubject, setEmailSubject] = useState("Flight Logbook Export");
  const [showEmailSection, setShowEmailSection] = useState(false);

  useEffect(() => {
    (async () => {
      const [entriesData, viewData] = await Promise.all([
        listEntries(),
        getView("view_default"),
      ]);
      setEntries(entriesData.sort((a, b) => 
        new Date(b.values.date || b.createdAt).getTime() - 
        new Date(a.values.date || a.createdAt).getTime()
      ));
      setView(viewData);
      setLoading(false);
    })();
  }, []);

  function getSelectedEntries(): LogbookEntry[] {
    switch (entrySelection) {
      case "last5":
        return entries.slice(0, 5);
      case "last15":
        return entries.slice(0, 15);
      case "last30":
        return entries.slice(0, 30);
      case "all":
      default:
        return entries;
    }
  }

  function handleExport() {
    const selectedEntries = getSelectedEntries();
    const selectedFields = view?.columns?.map(c => c.fieldId) || [];

    if (format === "csv") {
      const csvContent = exportToCSV(selectedEntries, {
        includeAllFields,
        selectedFields,
      });
      downloadCSV(csvContent, generateExportFilename("csv"));
    } else {
      const pdf = exportToPDF({
        entries: selectedEntries,
        includeAllFields,
        selectedFields,
	        title: "AutoFlightLog Flight Logbook",
      });
      downloadPDF(pdf, generateExportFilename("pdf"));
    }
  }

  function handleEmailExport() {
    const selectedEntries = getSelectedEntries();
    const selectedFields = view?.columns?.map(c => c.fieldId) || [];

    const pdf = exportToPDF({
      entries: selectedEntries,
      includeAllFields,
      selectedFields,
	  	  title: "AutoFlightLog Flight Logbook",
    });

    const pdfBase64 = getPDFBase64(pdf);
    
    // Create mailto link with PDF attachment
    // Note: Most email clients don't support attachments via mailto
    // So we'll open email with instructions
    const body = encodeURIComponent(
      `Please find attached my flight logbook export.\n\n` +
      `Total entries: ${selectedEntries.length}\n\n` +
      `Note: Due to email client limitations, please download the PDF separately and attach it manually.`
    );
    
    const mailtoLink = `mailto:${emailAddresses}?subject=${encodeURIComponent(emailSubject)}&body=${body}`;
    
    // Download PDF first
    downloadPDF(pdf, generateExportFilename("pdf"));
    
    // Then open email client
    window.location.href = mailtoLink;
  }

  if (loading) {
    return (
      <div className="p-6">
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  const selectedEntries = getSelectedEntries();
  const estimatedPages = format === "pdf" 
    ? Math.ceil(selectedEntries.length / estimateEntriesPerPage(includeAllFields ? FIELD_CATALOG.length : (view?.columns?.length || 5)))
    : 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
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
          Export Logbook
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Export your flight records as CSV or PDF
        </p>
      </div>

      {/* Export Options */}
      <div
        className="rounded-xl border p-6 space-y-6"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)"
        }}
      >
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Export Format
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setFormat("csv")}
              className="flex-1 rounded-lg border p-4 transition-all"
              style={{
                borderColor: format === "csv" ? "var(--aviation-blue)" : "var(--border-default)",
                backgroundColor: format === "csv" ? "rgba(15, 42, 68, 0.05)" : "transparent",
                color: format === "csv" ? "var(--aviation-blue)" : "var(--text-primary)"
              }}
            >
              <div className="font-medium">CSV</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Spreadsheet format
              </div>
            </button>
            <button
              onClick={() => setFormat("pdf")}
              className="flex-1 rounded-lg border p-4 transition-all"
              style={{
                borderColor: format === "pdf" ? "var(--aviation-blue)" : "var(--border-default)",
                backgroundColor: format === "pdf" ? "rgba(15, 42, 68, 0.05)" : "transparent",
                color: format === "pdf" ? "var(--aviation-blue)" : "var(--text-primary)"
              }}
            >
              <div className="font-medium">PDF</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Printable document
              </div>
            </button>
          </div>
        </div>

        {/* Entry Selection */}
        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Entries to Export
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { value: "all", label: "All Entries", count: entries.length },
              { value: "last5", label: "Last 5", count: Math.min(5, entries.length) },
              { value: "last15", label: "Last 15", count: Math.min(15, entries.length) },
              { value: "last30", label: "Last 30", count: Math.min(30, entries.length) },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setEntrySelection(option.value as EntrySelection)}
                className="rounded-lg border p-3 transition-all text-left"
                style={{
                  borderColor: entrySelection === option.value ? "var(--aviation-blue)" : "var(--border-default)",
                  backgroundColor: entrySelection === option.value ? "rgba(15, 42, 68, 0.05)" : "transparent",
                  color: entrySelection === option.value ? "var(--aviation-blue)" : "var(--text-primary)"
                }}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  {option.count} entries
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Field Selection */}
        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Fields to Include
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!includeAllFields}
                onChange={() => setIncludeAllFields(false)}
                className="w-4 h-4"
                style={{ accentColor: "var(--aviation-blue)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                Selected fields only ({view?.columns?.length || 0} fields)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={includeAllFields}
                onChange={() => setIncludeAllFields(true)}
                className="w-4 h-4"
                style={{ accentColor: "var(--aviation-blue)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                All available fields ({FIELD_CATALOG.length} fields)
              </span>
            </label>
          </div>
        </div>

        {/* Summary */}
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-light)"
          }}
        >
          <div className="text-sm space-y-1">
            <div style={{ color: "var(--text-secondary)" }}>
              Export summary: <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {selectedEntries.length} entries
              </span>
              {format === "pdf" && (
                <span style={{ color: "var(--text-secondary)" }}>
                  {" "}• Estimated {estimatedPages} page{estimatedPages !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Export Button */}
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={selectedEntries.length === 0}
            className="flex-1 rounded-lg px-6 py-3 font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--aviation-blue)" }}
            onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            Download {format.toUpperCase()}
          </button>
          <button
            onClick={() => setShowEmailSection(!showEmailSection)}
            className="rounded-lg px-6 py-3 font-medium border transition-colors"
            style={{
              borderColor: "var(--aviation-blue)",
              color: "var(--aviation-blue)",
              backgroundColor: showEmailSection ? "rgba(15, 42, 68, 0.05)" : "transparent"
            }}
          >
            {showEmailSection ? "Hide" : "Send via"} Email
          </button>
        </div>
      </div>

      {/* Email Section */}
      {showEmailSection && (
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)"
          }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Send via Email
          </h2>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Email Address(es)
            </label>
            <input
              type="text"
              value={emailAddresses}
              onChange={(e) => setEmailAddresses(e.target.value)}
              placeholder="email@example.com, another@example.com"
              className="w-full rounded-lg border px-4 py-2.5 text-sm"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-card)",
                color: "var(--text-primary)"
              }}
            />
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Separate multiple addresses with commas
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Subject
            </label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full rounded-lg border px-4 py-2.5 text-sm"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-card)",
                color: "var(--text-primary)"
              }}
            />
          </div>

          <div
            className="rounded-lg border p-3 text-xs"
            style={{
              backgroundColor: "#FEF3C7",
              borderColor: "var(--status-pending)",
              color: "#92400E"
            }}
          >
            <strong>Note:</strong> This will download the PDF and open your email client.
            You'll need to manually attach the downloaded PDF to the email.
          </div>

          <button
            onClick={handleEmailExport}
            disabled={!emailAddresses.trim() || selectedEntries.length === 0}
            className="w-full rounded-lg px-6 py-3 font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--aviation-blue)" }}
            onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
          >
            Prepare Email with PDF
          </button>
        </div>
      )}
    </div>
  );
}

