"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getEntry, upsertEntry, getTemplate, listEntries } from "@/lib/repo/firestoreRepos";
import { LogbookEntry, Template } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import { getFieldSuggestions } from "@/lib/suggestions/logbookDefaults";

function findMostRecentAircraftForRegistration(
  entries: LogbookEntry[],
  registration: string
): string | null {
  const target = registration.trim().toUpperCase();
  if (!target) return null;

  let bestAircraft: string | null = null;
  let bestTimestamp = "";

  for (const entry of entries) {
    const reg = String((entry.values as any)?.registration ?? "").trim().toUpperCase();
    const ac = String((entry.values as any)?.aircraft ?? "").trim();

    if (!reg || !ac) continue;
    if (reg !== target) continue;

    const ts = entry.updatedAt || entry.createdAt || "";
    if (!bestAircraft || ts > bestTimestamp) {
      bestAircraft = ac;
      bestTimestamp = ts;
    }
  }

  return bestAircraft;
}

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams();
  const entryId = params.entryId as string;

  const [entry, setEntry] = useState<LogbookEntry | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [allEntries, setAllEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				setLoadError(null);
				const entryData = await getEntry(entryId);
				if (!entryData) {
					alert("Entry not found");
					router.push("/app/logbook");
					return;
				}

				const [templateData, entriesData] = await Promise.all([
					getTemplate(entryData.templateId),
					listEntries(),
				]);
				if (cancelled) return;
				setEntry(entryData);
				setTemplate(templateData);
				setAllEntries(entriesData);
			} catch (err) {
				console.error("Edit entry load failed", err);
				if (cancelled) return;
				const code = typeof (err as any)?.code === "string" ? (err as any).code : null;
				const message = err instanceof Error ? err.message : String(err);
				setLoadError(code ? `${code}: ${message}` : message);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
  }, [entryId, router]);

		  function handleFieldChange(fieldKey: string, value: any) {
		    if (!entry) return;

		    // Finn feltdefinisjon slik at vi kan behandle tekstfelter spesielt
		    const fieldDef = FIELD_CATALOG.find(
		      (f) => f.id === fieldKey || f.key === fieldKey
		    );

		    // Normaliser verdi før vi lagrer den i state
		    let nextValue = value;
		    // For tekstfelter vil vi vise og lagre alt som STORE BOKSTAVER,
		    // men vi lar "remarks" være uendret slik at fritekst fortsatt kan
		    // skrives med vanlig typografi.
		    if (
		      fieldDef?.type === "text" &&
		      typeof nextValue === "string" &&
		      fieldKey !== "remarks"
		    ) {
		      nextValue = nextValue.toUpperCase();
		    }

		    const nextValues: LogbookEntry["values"] = {
		      ...entry.values,
		      [fieldKey]: nextValue,
		    };
		
		    const nextManualOverrides: LogbookEntry["manualOverrides"] = {
		      ...(entry.manualOverrides || {}),
		      [fieldKey]: true,
		    };
		
		    // If the registration changes, and the user has not manually overridden
		    // the aircraft type on this entry, try to auto-fill the aircraft based
		    // on the most recent matching registration in the user's logbook.
		    if (fieldKey === "registration") {
		      const hasManualAircraftOverride = entry.manualOverrides?.aircraft === true;
		      const regValue =
		        typeof nextValue === "string" ? nextValue : String(nextValue ?? "");
		
		      if (!hasManualAircraftOverride) {
		        const suggestedAircraft = findMostRecentAircraftForRegistration(
		          allEntries,
		          regValue
		        );
		        if (suggestedAircraft) {
		          (nextValues as any).aircraft = suggestedAircraft;
		        }
		      }
		    }
		
		    setEntry({
		      ...entry,
		      values: nextValues,
		      manualOverrides: nextManualOverrides,
		    });
		  }

  async function handleSave() {
    if (!entry) return;

    setSaving(true);
    try {
      await upsertEntry({
        ...entry,
        updatedAt: new Date().toISOString(),
      });
      router.push("/app/logbook");
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
      setSaving(false);
    }
  }

  function handleCancel() {
    router.push("/app/logbook");
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

	if (loadError) {
		return (
			<div className="p-6">
				<p className="text-red-600">Failed to load entry: {loadError}</p>
			</div>
		);
	}

	  if (!entry || !template) {
    return (
      <div className="p-6">
        <p className="text-red-600">Entry or template not found</p>
      </div>
    );
  }

	  // Get fields in form order, but always include all known catalog fields so that
	  // new EASA columns added later automatically appear in the form.
	  const templateOrder = (template.formOrder && template.formOrder.length > 0)
	    ? template.formOrder
	    : template.fields.map((f) => f.id);
	
	  const catalogOrder = FIELD_CATALOG.map((f) => f.key || f.id);
	
	  const fieldKeys = Array.from(
	    new Set<string>([...templateOrder, ...catalogOrder])
	  );

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--aviation-blue)" }}>
            Edit Entry
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Make changes to your logbook entry
          </p>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {fieldKeys.map((fieldKey) => {
            const fieldDef = FIELD_CATALOG.find((f) => f.id === fieldKey || f.key === fieldKey);
            if (!fieldDef) return null;

            const value = entry.values[fieldKey] ?? "";
            const isManuallyEdited = entry.manualOverrides?.[fieldKey] === true;

            return (
              <div
                key={fieldKey}
                className="rounded-xl border p-4"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-default)"
                }}
              >
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {fieldDef.name}
                </label>

                {fieldDef.type === "date" ? (
                  <input
                    type="date"
                    value={value}
                    onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                    className="w-full rounded-lg border p-3 text-base transition-colors"
                    style={{
                      borderColor: "var(--border-default)",
                      color: "var(--text-primary)"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
                    onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
                  />
                ) : fieldDef.type === "number" ? (
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                    className="w-full rounded-lg border p-3 text-base transition-colors"
                    style={{
                      borderColor: "var(--border-default)",
                      color: "var(--text-primary)"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
                    onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
                  />
                ) : fieldDef.type === "time" ? (
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                    className="w-full rounded-lg border p-3 text-base transition-colors"
                    style={{
                      borderColor: "var(--border-default)",
                      color: "var(--text-primary)"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "var(--aviation-blue)"}
                    onBlur={(e) => e.target.style.borderColor = "var(--border-default)"}
                  />
                ) : (
	              (() => {
	                const suggestions = getFieldSuggestions(allEntries, fieldKey, 4);

	                return (
	                  <div className="space-y-2">
	                    {suggestions.length > 0 && (
	                      <div className="flex flex-wrap gap-2">
	                        {suggestions.map((s) => (
	                          <button
	                            key={s}
	                            type="button"
	                            className="px-3 py-1 rounded-full text-xs md:text-sm border"
	                            style={{
	                              borderColor: "var(--border-default)",
	                              backgroundColor: "var(--bg-card)",
	                              color: "var(--text-secondary)",
	                            }}
	                            onClick={() => handleFieldChange(fieldKey, s)}
	                          >
	                            {s}
	                          </button>
	                        ))}
	                      </div>
	                    )}

	                    <input
	                      type="text"
	                      value={value}
	                      onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
	                      className="w-full rounded-lg border p-3 text-base transition-colors"
	                      style={{
	                        borderColor: "var(--border-default)",
	                        color: "var(--text-primary)",
	                      }}
	                      onFocus={(e) => (e.target.style.borderColor = "var(--aviation-blue)")}
	                      onBlur={(e) => (e.target.style.borderColor = "var(--border-default)")}
	                    />
	                  </div>
	                );
                  })()
                )}

                {isManuallyEdited && (
                  <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--status-info)" }}>
                    <span>✏️</span>
                    <span>Manually edited - protected from sync</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky bottom buttons */}
      <div
        className="fixed bottom-0 left-0 right-0 md:left-64 border-t p-4 space-y-2 shadow-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)"
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg px-6 py-3.5 text-base font-medium text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: "var(--aviation-blue)" }}
          onMouseEnter={(e) => !saving && (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => !saving && (e.currentTarget.style.opacity = "1")}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="w-full rounded-lg px-6 py-2.5 text-base font-medium transition-all disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-primary)"
          }}
          onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = "var(--border-default)")}
          onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

