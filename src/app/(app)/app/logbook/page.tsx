"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listEntries, upsertEntry, getView, deleteEntry } from "@/lib/repo/firestoreRepos";
import { LogbookEntry, ViewDefinition } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { getPrefillValuesForNewEntry } from "@/lib/suggestions/logbookDefaults";
import { EASA_LOGBOOK_LAYOUT } from "@/lib/layouts/easaLogbookLayout";

function nowIso() {
  return new Date().toISOString();
}

export default function LogbookPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [view, setView] = useState<ViewDefinition | null>(null);
  const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function refresh() {
		try {
			setLoadError(null);
			const [entriesData, viewData] = await Promise.all([
				listEntries(),
				getView("view_default"),
			]);
			setEntries(entriesData);
			setView(viewData);
		} catch (err) {
			console.error("Logbook load failed", err);
			const code = typeof (err as any)?.code === "string" ? (err as any).code : null;
			const message = err instanceof Error ? err.message : String(err);
			setLoadError(code ? `${code}: ${message}` : message);
		} finally {
			setLoading(false);
		}
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addEntry() {
    const id = "e_" + Math.random().toString(36).slice(2);

    const prefill = getPrefillValuesForNewEntry(entries);
    const e: LogbookEntry = {
      id,
      templateId: "tmpl_easa_default",
      values: prefill,
      source: { system: "manual" },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await upsertEntry(e);
    router.push(`/app/logbook/edit/${id}`);
  }

  async function handleDelete(entryId: string) {
    await deleteEntry(entryId);
    setDeleteConfirm(null);
    await refresh();
  }

	  // Determine which fields are currently active/visible according to the view
	  const activeFieldIds = useMemo(() => {
	    const ids = new Set<string>();
	    if (view?.columns && view.columns.length > 0) {
	      for (const col of view.columns) ids.add(col.fieldId);
	    } else if (view?.visibleFields && view.visibleFields.length > 0) {
	      for (const id of view.visibleFields) ids.add(id);
	    }
	    // Fallback: if nothing is configured, fall back to all known fields
	    if (ids.size === 0) {
	      for (const f of FIELD_CATALOG) ids.add(f.id);
	    }
	    return ids;
	  }, [view]);

	  // Build EASA-style layout filtered by the active fields
	  const displayedGroups = useMemo(() => {
	    return EASA_LOGBOOK_LAYOUT
	      .map((group) => {
	        const cols = group.columns.filter((col) => activeFieldIds.has(col.fieldId));
	        if (cols.length === 0) return null;
	        return { ...group, columns: cols };
	      })
	      .filter(Boolean) as typeof EASA_LOGBOOK_LAYOUT;
	  }, [activeFieldIds]);

	  const flatColumns = useMemo(
	    () => displayedGroups.flatMap((g) => g.columns),
	    [displayedGroups]
	  );

	  if (loading) {
	    return (
	      <div className="p-6">
	        <p className="text-gray-600">Loading...</p>
	      </div>
	    );
	  }

	  if (loadError) {
	    return (
	      <div className="p-6 md:p-8">
	        <h1 className="text-2xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
	          Logbook
	        </h1>
	        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
	          <p className="text-sm font-medium text-red-900">Kunne ikke laste loggbok.</p>
	          <p className="text-sm text-red-700 mt-1">{loadError}</p>
	        </div>
	      </div>
	    );
	  }

	  if (displayedGroups.length === 0) {
	    return (
	      <div className="p-6 md:p-8">
	        <h1 className="text-2xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
	          Logbook
	        </h1>
	        <div
	          className="rounded-xl border p-6"
	          style={{
	            backgroundColor: "#FEF3C7",
	            borderColor: "var(--status-pending)",
	          }}
	        >
	          <p className="font-medium" style={{ color: "#92400E" }}>
	            No fields are selected for your logbook view. Go to{" "}
	            <a
	              href="/app/me"
	              className="underline font-semibold hover:no-underline"
	              style={{ color: "#92400E" }}
	            >
	              Settings
	            </a>{" "}
	            to choose which fields to show.
	          </p>
	        </div>
	      </div>
	    );
	  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Logbook
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <button
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--aviation-blue)" }}
          onClick={addEntry}
        >
          Add Entry
        </button>
      </div>

	      {/* Table */}
	      <div
	        className="rounded-xl border overflow-hidden shadow-sm"
	        style={{
	          backgroundColor: "var(--bg-card)",
	          borderColor: "var(--border-default)",
	        }}
	      >
	        <div className="overflow-x-auto">
	          <table className="w-full text-sm">
	            <thead style={{ backgroundColor: "var(--bg-primary)" }}>
	              {/* Top header row: group labels */}
	              <tr className="border-b" style={{ borderColor: "var(--border-default)" }}>
	                <th
	                  className="text-left px-3 py-3 font-semibold text-xs uppercase tracking-wide"
	                  style={{ color: "var(--text-secondary)", width: 40 }}
	                  rowSpan={2}
	                >
	                  #
	                </th>
	                {displayedGroups.map((group) => (
	                  <th
	                    key={group.id}
	                    colSpan={group.columns.length}
	                    rowSpan={group.columns.length > 1 ? 1 : 2}
	                    className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
	                    style={{ color: "var(--text-secondary)" }}
	                  >
	                    {group.label}
	                  </th>
	                ))}
	                <th
	                  className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
	                  style={{ color: "var(--text-secondary)", width: 60 }}
	                  rowSpan={2}
	                >
	                  
	                </th>
	              </tr>
	              {/* Second header row: sub-labels for grouped columns */}
	              <tr className="border-b" style={{ borderColor: "var(--border-default)" }}>
	                {displayedGroups.flatMap((group) =>
	                  group.columns.length > 1
	                    ? group.columns.map((col) => (
	                        <th
	                          key={`${group.id}-${col.fieldId}`}
	                          className="text-left px-4 py-2 font-medium text-[11px] uppercase tracking-wide"
	                          style={{ color: "var(--text-secondary)" }}
	                        >
	                          {col.subLabel ?? ""}
	                        </th>
	                      ))
	                    : []
	                )}
	              </tr>
	            </thead>
	            <tbody>
	              {entries.map((entry, rowIndex) => (
	                <tr
	                  key={entry.id}
	                  className="border-t transition-colors"
	                  style={{ borderColor: "var(--border-light)" }}
	                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
	                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
	                >
	                  <td
	                    className="px-3 py-3 text-xs text-right select-none"
	                    style={{ color: "var(--text-secondary)", width: 40 }}
	                  >
	                    {rowIndex + 1}
	                  </td>
	                  {flatColumns.map((col) => (
	                    <td
	                      key={col.fieldId}
	                      className="px-4 py-3 cursor-pointer whitespace-nowrap"
	                      style={{ color: "var(--text-primary)" }}
	                      onClick={() => router.push(`/app/logbook/edit/${entry.id}`)}
	                    >
	                      {entry.values[col.fieldId] ?? "-"}
	                    </td>
	                  ))}
	                  <td className="px-4 py-3">
	                    <button
	                      onClick={(e) => {
	                        e.stopPropagation();
	                        setDeleteConfirm(entry.id);
	                      }}
	                      className="text-red-600 hover:text-red-700 transition-colors p-1 rounded hover:bg-red-50"
	                      title="Delete entry"
	                    >
	                      <svg
	                        xmlns="http://www.w3.org/2000/svg"
	                        className="h-5 w-5"
	                        viewBox="0 0 20 20"
	                        fill="currentColor"
	                      >
	                        <path
	                          fillRule="evenodd"
	                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
	                          clipRule="evenodd"
	                        />
	                      </svg>
	                    </button>
	                  </td>
	                </tr>
	              ))}
	              {entries.length === 0 && (
	                <tr>
	                  <td
	                    className="px-4 py-8 text-center"
	                    colSpan={flatColumns.length + 2}
	                    style={{ color: "var(--text-secondary)" }}
	                  >
	                    No entries yet. Click "Add Entry" to get started.
	                  </td>
	                </tr>
	              )}
	            </tbody>
	          </table>
	        </div>
	      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="rounded-xl border p-6 max-w-md w-full mx-4 shadow-xl"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-default)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-xl font-semibold mb-3"
              style={{ color: "var(--aviation-blue)" }}
            >
              Delete Entry
            </h2>
            <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
              Are you sure you want to delete this logbook entry? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border font-medium transition-colors"
                style={{
                  borderColor: "var(--border-default)",
                  color: "var(--text-primary)",
                  backgroundColor: "var(--bg-card)"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--bg-card)"}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--status-error)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

