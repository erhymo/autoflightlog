"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { buildDefaultEasaTemplate } from "@/lib/defaults/easaTemplate";
import { buildDefaultView } from "@/lib/defaults/defaultView";
import { upsertTemplate, upsertView, getUserFlags, setUserFlags } from "@/lib/repo/mockRepos";
import { FieldType } from "@/types/domain";

function nowIso() {
  return new Date().toISOString();
}

export default function MyPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const catalog = useMemo(() => FIELD_CATALOG, []);

  useEffect(() => {
    (async () => {
      const flags = await getUserFlags();
      if (!flags.setupComplete) {
        const tmpl = buildDefaultEasaTemplate(nowIso());
        setSelected(tmpl.formOrder || []);
      } else {
        const tmpl = buildDefaultEasaTemplate(nowIso());
        setSelected(tmpl.formOrder || []);
      }
    })();
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

    const view = buildDefaultView(iso, tmpl.id);
    view.columns = selected.map((k, idx) => ({ fieldId: k, width: 150, order: idx + 1 }));

    await upsertTemplate(tmpl);
    await upsertView(view);
    await setUserFlags({ setupComplete: true });

    router.push("/app/logbook");
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
            onClick={() => router.push("/app/me/import")}
            className="rounded-lg px-4 py-2.5 text-sm font-medium border transition-colors"
            style={{
              borderColor: "var(--aviation-blue)",
              color: "var(--aviation-blue)",
              backgroundColor: "transparent"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--aviation-blue)";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--aviation-blue)";
            }}
          >
            Import CSV
          </button>
          <button
            onClick={() => router.push("/app/me/export")}
            className="rounded-lg px-4 py-2.5 text-sm font-medium border transition-colors"
            style={{
              borderColor: "var(--aviation-blue)",
              color: "var(--aviation-blue)",
              backgroundColor: "transparent"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--aviation-blue)";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--aviation-blue)";
            }}
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
                    className="flex items-center gap-2.5 text-sm cursor-pointer p-2 rounded-lg transition-colors"
                    style={{
                      backgroundColor: isSelected ? "var(--bg-hover)" : "transparent",
                      color: "var(--text-primary)"
                    }}
                    onMouseEnter={(e) => !isSelected && (e.currentTarget.style.backgroundColor = "var(--bg-primary)")}
                    onMouseLeave={(e) => !isSelected && (e.currentTarget.style.backgroundColor = "transparent")}
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

      {/* Save Button */}
      <div
        className="sticky bottom-0 pt-4 pb-2 -mx-6 px-6 md:-mx-8 md:px-8"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <button
          className="w-full md:w-auto rounded-lg px-8 py-3 disabled:opacity-50 font-medium text-white transition-all"
          style={{ backgroundColor: "var(--aviation-blue)" }}
          onClick={save}
          disabled={selected.length < 3}
          onMouseEnter={(e) => selected.length >= 3 && (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
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
