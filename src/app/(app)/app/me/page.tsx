"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { buildDefaultEasaTemplate } from "@/lib/defaults/easaTemplate";
import { buildDefaultView } from "@/lib/defaults/defaultView";
import { upsertTemplate, upsertView, getUserFlags, setUserFlags, getView, deleteAllEntries } from "@/lib/repo/firestoreRepos";
import { FieldType } from "@/types/domain";
import { EASA_FIELD_ORDER } from "@/lib/layouts/easaLogbookLayout";
import { TypedConfirmModal } from "@/components/ui/TypedConfirmModal";
import { useToast } from "@/components/ui/ToastProvider";

function nowIso() {
  return new Date().toISOString();
}

const DELETE_ALL_CONFIRM_TEXT = "DELETE ALL ENTRIES";

export default function MyPage() {
	  const router = useRouter();
	  const { showToast } = useToast();
	  const [selected, setSelected] = useState<string[]>([]);
	  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
	  const [deletingAll, setDeletingAll] = useState(false);
	  const catalog = useMemo(() => {
	    // Sort catalog so it follows the same left-to-right order as the
	    // EASA logbook layout, which makes Settings mirror the table.
	    const orderIndex = new Map<string, number>();
	    EASA_FIELD_ORDER.forEach((id, idx) => orderIndex.set(id, idx));
	    return [...FIELD_CATALOG].sort((a, b) => {
	      const ai = orderIndex.get(a.id) ?? 999;
	      const bi = orderIndex.get(b.id) ?? 999;
	      return ai - bi;
	    });
	  }, []);

	  useEffect(() => {
	    let cancelled = false;
	    (async () => {
	      const flags = await getUserFlags();
	      // If first-time setup, start from the full default EASA layout.
	      if (!flags.setupComplete) {
	        const tmpl = buildDefaultEasaTemplate(nowIso());
	        if (!cancelled) setSelected(tmpl.formOrder || []);
	        return;
	      }

	      // Otherwise, load the current saved view so the checkboxes reflect
	      // what the logbook actually shows.
	      const view = await getView("view_default");
	      if (cancelled) return;

	      if (view?.columns && view.columns.length > 0) {
	        setSelected(view.columns.map((c) => c.fieldId));
	      } else if (view?.visibleFields && view.visibleFields.length > 0) {
	        setSelected([...view.visibleFields]);
	      } else {
	        // Fallback: default EASA order
	        const tmpl = buildDefaultEasaTemplate(nowIso());
	        setSelected(tmpl.formOrder || []);
	      }
	    })();
	    return () => {
	      cancelled = true;
	    };
	  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof catalog>();
    for (const f of catalog) {
      const g = f.group ?? "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    return Array.from(map.entries());
  }, [catalog]);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    const iso = nowIso();
    const baseTemplate = buildDefaultEasaTemplate(iso);
    const fields = FIELD_CATALOG.filter((f) => f.key && selected.includes(f.key)).map((f, idx) => ({
      id: f.id,
      name: f.name,
      type: f.type as FieldType,
      required: false,
      order: idx,
    }));
	    const tmpl = { ...baseTemplate, fields, formOrder: selected, updatedAt: new Date(iso) };
	
	    // Build a view that matches exactly the fields the user has selected,
	    // so the logbook table only shows those columns.
	    const baseView = buildDefaultView(iso, tmpl.id);
	    const visibleFields = selected.length > 0 ? selected : baseView.visibleFields;
	    const columns = visibleFields.map((fieldId, idx) => ({
	      fieldId,
	      width: 140,
	      order: idx + 1,
	    }));
	
	    const view = {
	      ...baseView,
	      visibleFields,
	      columns,
	      updatedAt: new Date(iso),
	    };
	
	    await upsertTemplate(tmpl);
	    await upsertView(view);
    await setUserFlags({ setupComplete: true });

    router.push("/app/logbook");
  }

  async function handleDeleteAllEntries() {
    setDeletingAll(true);
    try {
      const count = await deleteAllEntries();
      showToast(`Deleted ${count} ${count === 1 ? "entry" : "entries"}.`, "success");
      setShowDeleteAllConfirm(false);
      router.push("/app/me/import");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Logbook Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Select which fields you want to track in your logbook
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            {selected.length} fields selected
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/app/me/certificates")}
            className="rounded-lg px-4 py-2.5 text-sm font-medium border bg-transparent text-[var(--aviation-blue)] transition-colors hover:bg-[var(--aviation-blue)] hover:text-white"
            style={{ borderColor: "var(--aviation-blue)" }}
          >
            Certificates
          </button>
          <button
            onClick={() => router.push("/app/me/import")}
            className="rounded-lg px-4 py-2.5 text-sm font-medium border bg-transparent text-[var(--aviation-blue)] transition-colors hover:bg-[var(--aviation-blue)] hover:text-white"
            style={{ borderColor: "var(--aviation-blue)" }}
          >
            Import CSV
          </button>
          <button
            onClick={() => router.push("/app/me/export")}
            className="rounded-lg px-4 py-2.5 text-sm font-medium border bg-transparent text-[var(--aviation-blue)] transition-colors hover:bg-[var(--aviation-blue)] hover:text-white"
            style={{ borderColor: "var(--aviation-blue)" }}
          >
            Export
          </button>
        </div>
      </div>

      {/* Field Groups */}
      <div className="grid gap-4">
        {grouped.map(([group, fields]) => (
          <div
            key={group}
            className="rounded-xl border p-5"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-default)"
            }}
          >
            <div className="font-semibold mb-3" style={{ color: "var(--aviation-blue)" }}>
              {group}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {fields.map((f) => {
                const key = f.key || f.id;
                const isSelected = selected.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 text-sm cursor-pointer p-2 rounded-lg transition-colors ${isSelected ? "" : "hover:bg-[var(--bg-primary)]"}`}
                    style={{
                      backgroundColor: isSelected ? "var(--bg-hover)" : undefined,
                      color: "var(--text-primary)"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(key)}
                      className="w-4 h-4 rounded"
                      style={{
                        accentColor: "var(--aviation-blue)"
                      }}
                    />
                    <span>{f.label || f.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Danger Zone */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--status-error)", backgroundColor: "var(--bg-card)" }}
      >
        <div className="font-semibold mb-1" style={{ color: "var(--status-error)" }}>
          Danger Zone
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
          Permanently delete every logbook entry. Use this only if you are about to re-import your
          logbook from another source (e.g. CSV) and want to start clean. This cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteAllConfirm(true)}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--status-error)" }}
        >
          Delete all logbook entries
        </button>
      </div>

      {showDeleteAllConfirm && (
        <TypedConfirmModal
          title="Delete all logbook entries"
          steps={[
            {
              prompt: `This permanently deletes every entry in your logbook. This cannot be undone.\n\nType "${DELETE_ALL_CONFIRM_TEXT}" to confirm:`,
              requiredText: DELETE_ALL_CONFIRM_TEXT,
            },
          ]}
          confirmLabel={deletingAll ? "Deleting..." : "Delete everything"}
          onCancel={() => setShowDeleteAllConfirm(false)}
          onConfirm={handleDeleteAllEntries}
        />
      )}

      {/* Save Button */}
      <div
        className="sticky bottom-0 pt-4 pb-2 -mx-6 px-6 md:-mx-8 md:px-8"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <button
          className="w-full md:w-auto rounded-lg px-8 py-3 disabled:opacity-50 font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--aviation-blue)" }}
          onClick={save}
          disabled={selected.length < 3}
        >
          Save & Go to Logbook
        </button>
        {selected.length < 3 && (
          <p className="text-xs mt-2" style={{ color: "var(--status-error)" }}>
            Please select at least 3 fields
          </p>
        )}
      </div>
    </div>
  );
}
