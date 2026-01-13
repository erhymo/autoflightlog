"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listEntries, upsertEntry, getView, deleteEntry } from "@/lib/repo/firestoreRepos";
import { LogbookEntry, ViewDefinition } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { getPrefillValuesForNewEntry } from "@/lib/suggestions/logbookDefaults";

function nowIso() {
  return new Date().toISOString();
}

export default function LogbookPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [view, setView] = useState<ViewDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function refresh() {
    const [entriesData, viewData] = await Promise.all([
      listEntries(),
      getView("view_default"),
    ]);
    setEntries(entriesData);
    setView(viewData);
    setLoading(false);
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

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!view || !view.columns || view.columns.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-semibold mb-4" style={{ color: "var(--aviation-blue)" }}>
          Logbook
        </h1>
        <div
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "#FEF3C7",
            borderColor: "var(--status-pending)"
          }}
        >
          <p className="font-medium" style={{ color: "#92400E" }}>
            Configure your logbook first. Go to{" "}
            <a
              href="/app/me"
              className="underline font-semibold hover:no-underline"
              style={{ color: "#92400E" }}
            >
              Settings
            </a>{" "}
            to select fields.
          </p>
        </div>
      </div>
    );
  }

  // Sort columns by order
  const sortedColumns = [...view.columns].sort((a, b) => a.order - b.order);

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
          borderColor: "var(--border-default)"
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "var(--bg-primary)" }}>
              <tr className="border-b" style={{ borderColor: "var(--border-default)" }}>
                {sortedColumns.map((col) => {
                  const field = FIELD_CATALOG.find((f) => f.id === col.fieldId || f.key === col.fieldId);
                  return (
                    <th
                      key={col.fieldId}
                      className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
                      style={{
                        width: col.width,
                        color: "var(--text-secondary)"
                      }}
                    >
                      {field?.name || col.fieldId}
                    </th>
                  );
                })}
                <th
                  className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
                  style={{
                    width: 60,
                    color: "var(--text-secondary)"
                  }}
                >

                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t transition-colors"
                  style={{ borderColor: "var(--border-light)" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  {sortedColumns.map((col) => (
                    <td
                      key={col.fieldId}
                      className="px-4 py-3 cursor-pointer"
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
                    colSpan={sortedColumns.length + 1}
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

