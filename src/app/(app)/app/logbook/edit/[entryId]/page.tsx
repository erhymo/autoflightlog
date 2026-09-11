"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { getEntry, upsertEntry, getTemplate, listEntries, listKnownPlaces, upsertKnownPlace } from "@/lib/repo/firestoreRepos";
import { LogbookEntry, Template, KnownPlace } from "@/types/domain";
import { FIELD_CATALOG } from "@/types/fieldCatalog";
import {
  getFieldSuggestions,
  getPrefillValuesForNewEntry,
  getRouteAwareArrivalSuggestions,
  findMostRecentEntryForAircraft,
  getMirroredRoleFieldKeys,
} from "@/lib/suggestions/logbookDefaults";
import { findDuplicateEntry } from "@/lib/duplicateDetection";
import { computeTotalTimeMinutes, formatMinutesToHHMM, parseTimeInput } from "@/lib/logbook/timeUnits";
import { requestCurrentPosition, findNearestPlace, GeoPosition } from "@/lib/geo/geolocation";
import { useToast } from "@/components/ui/ToastProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { Banner } from "@/components/ui/Banner";
import { TriangleAlert, Pencil, MapPin } from "lucide-react";

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

function nowIso() {
  return new Date().toISOString();
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computeValidationWarnings(entry: LogbookEntry): string[] {
  const values = (entry.values as any) ?? {};
  const warnings: string[] = [];

  const total = parseNumber(values.totalTime);
  const pic = parseNumber(values.picTime);
  const copilot = parseNumber(values.copilotTime);
  const multiPilot = parseNumber(values.multiPilotTime);
  const dual = parseNumber(values.dualTime);
  const ifr = parseNumber(values.ifrTime);
  const night = parseNumber(values.nightTime);
  const landingsDay = parseNumber(values.landingsDay);
  const landingsNight = parseNumber(values.landingsNight);

  // All time fields are whole minutes; allow a 1-minute tolerance for
  // incidental rounding rather than comparing for an exact match.
  const ROUNDING_TOLERANCE_MINUTES = 1;

  const sumRoleTimes = pic + copilot + multiPilot + dual;
  if (total > 0 && sumRoleTimes > total + ROUNDING_TOLERANCE_MINUTES) {
    warnings.push(
      "Sum of PIC / Co-pilot / Multi-pilot / Dual time is greater than Total Time of flight."
    );
  }

  if (night > total + ROUNDING_TOLERANCE_MINUTES) {
    warnings.push("Night time is greater than Total Time of flight.");
  }

  if (ifr > total + ROUNDING_TOLERANCE_MINUTES) {
    warnings.push("IFR time is greater than Total Time of flight.");
  }

  if (total > 0 && landingsDay + landingsNight === 0) {
    warnings.push("Total Time is > 0 but day + night landings is 0.");
  }

  return warnings;
}

export default function EditEntryPage() {
	  const router = useRouter();
	  const { showToast } = useToast();
	  const params = useParams();
	  const searchParams = useSearchParams();
	  const entryId = params.entryId as string;
	  const basedOn = searchParams.get("basedOn");

  const [entry, setEntry] = useState<LogbookEntry | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [allEntries, setAllEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [knownPlaces, setKnownPlaces] = useState<KnownPlace[]>([]);
  const [position, setPosition] = useState<GeoPosition | null>(null);

		  useEffect(() => {
	    let cancelled = false;
	    async function load() {
	      try {
	        setLoadError(null);

		        // New entry flow: no document exists yet. We build a draft entry in
		        // memory using sensible defaults, and only persist it if the user
		        // presses Save.
		        if (entryId === "new") {
		          const [templateData, entriesData, knownPlacesData] = await Promise.all([
		            getTemplate("tmpl_easa_default"),
		            listEntries(),
		            listKnownPlaces(),
		          ]);
		          if (cancelled) return;
		          setKnownPlaces(knownPlacesData);

		          // Ask for location once per visit to a "new entry" page - this is
		          // what triggers the browser's permission prompt the first time.
		          // Silently does nothing if denied or unavailable.
		          void requestCurrentPosition().then((pos) => {
		            if (!cancelled) setPosition(pos);
		          });
		
		          let values = getPrefillValuesForNewEntry(entriesData);
		
		          // Optional: when coming from "Add based on last" in the logbook list,
		          // start from the most recent entry and reset time/landing fields while
		          // keeping the new date and other generic defaults.
		          if (basedOn === "last" && entriesData.length > 0) {
		            let mostRecent: LogbookEntry | null = null;
		            let bestTs = "";
		            for (const e of entriesData) {
		              const ts = e.updatedAt || e.createdAt || "";
		              if (!mostRecent || ts > bestTs) {
		                mostRecent = e;
		                bestTs = ts;
		              }
		            }
		
		            if (mostRecent) {
		              const cloned = { ...(mostRecent.values || {}) } as LogbookEntry["values"]; 
		              const resetKeys = [
		                "date",
		                "departureTime",
		                "arrivalTime",
		                "totalTime",
		                "singlePilotSeTime",
		                "singlePilotMeTime",
		                "multiPilotTime",
		                "picTime",
		                "copilotTime",
		                "dualTime",
		                "nightTime",
		                "ifrTime",
		                "landingsDay",
		                "landingsNight",
		              ];
		              for (const key of resetKeys) {
		                delete (cloned as any)[key];
		              }
		
		              // Always prefer the freshly computed default date.
		              (cloned as any).date = (values as any).date;
		
		              values = { ...values, ...cloned };
		            }
		          }
		
		          const now = nowIso();
		          const draftEntry: LogbookEntry = {
		            id: "draft",
		            templateId: "tmpl_easa_default",
		            values,
		            source: { system: "manual" },
		            createdAt: now,
		            updatedAt: now,
		            manualOverrides: {},
		          };
		
		          setEntry(draftEntry);
		          setTemplate(templateData);
		          setAllEntries(entriesData);
		          return;
		        }

	        // Existing entry flow: load from Firestore as before.
	        const entryData = await getEntry(entryId);
	        if (!entryData) {
	          showToast("Entry not found", "error");
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
			    // eslint-disable-next-line react-hooks/exhaustive-deps
			  }, [entryId, router, basedOn]);

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

		    // If the aircraft type changes, and some core routing/crew fields have not
		    // been manually touched on this entry yet, try to prefill them from the
		    // most recent flight with the same aircraft type.
		    if (fieldKey === "aircraft") {
		      const source = findMostRecentEntryForAircraft(allEntries, nextValue);
		      if (source) {
		        const fieldsToCopy = ["registration", "departure", "arrival", "pic"] as const;
		        for (const key of fieldsToCopy) {
		          const hasManualOverride = entry.manualOverrides?.[key] === true;
		          const existing = (entry.values as any)[key];
		          if (hasManualOverride || existing) continue;
		          const src = (source.values as any)[key];
		          if (src !== undefined && src !== null && src !== "") {
		            (nextValues as any)[key] = src;
		          }
		        }
		      }
		    }

		    // When both departure and arrival times are set, calculate "Total Time of
		    // flight" automatically, unless the user has manually overridden that
		    // value.
		    let finalizedTotalTime: number | null = null;
		    if (fieldKey === "departureTime" || fieldKey === "arrivalTime") {
		      const departure =
		        fieldKey === "departureTime" ? nextValue : nextValues["departureTime"] ?? entry.values["departureTime"];
		      const arrival =
		        fieldKey === "arrivalTime" ? nextValue : nextValues["arrivalTime"] ?? entry.values["arrivalTime"];

		      const hasManualTotalOverride =
		        nextManualOverrides.totalTime === true || entry.manualOverrides?.totalTime === true;

		      if (!hasManualTotalOverride) {
		        const minutes = computeTotalTimeMinutes(departure, arrival);
		        if (minutes != null) {
		          (nextValues as any).totalTime = minutes;
		          finalizedTotalTime = minutes;
		        }
		      }
		    }

		    // A fully-parsed Total Time value - either just typed and blurred (see
		    // renderFieldRow's onBlur for duration fields), or auto-calculated above
		    // from departure/arrival times just now.
		    if (fieldKey === "totalTime" && typeof nextValue === "number") {
		      finalizedTotalTime = nextValue;
		    }

		    // Which role-time fields (PIC / Co-pilot / Dual / Instructor /
		    // Multi-pilot / Turbine / Single-pilot SE / ME) should mirror Total
		    // Time is learned from the most recent flight logged with this
		    // aircraft type, rather than hardcoded per type - a pilot's crew
		    // position (e.g. PIC vs co-pilot) can change over time even on the
		    // same aircraft, so each entry defaults to whichever field(s) applied
		    // last time instead of assuming one fixed role forever.
		    if (finalizedTotalTime != null) {
		      const aircraftType = nextValues["aircraft"] ?? entry.values["aircraft"];
		      const mirroredKeys = getMirroredRoleFieldKeys(allEntries, aircraftType);
		      for (const key of mirroredKeys) {
		        const hasManualOverride =
		          nextManualOverrides[key] === true || entry.manualOverrides?.[key] === true;
		        if (hasManualOverride) continue;
		        (nextValues as any)[key] = finalizedTotalTime;
		      }
		    }

		    setEntry({
		      ...entry,
		      values: nextValues,
		      manualOverrides: nextManualOverrides,
		    });
		  }

	  function slugifyPlaceName(name: string): string {
	    return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	  }

	  // Learn the pilot's current position against whichever departure/arrival
	  // place names are set on this entry, so a future flight logged nearby
	  // can suggest them - see the "near you" suggestion in renderFieldRow.
	  async function learnKnownPlaces() {
	    if (!position || !entry) return;
	    const names = [entry.values["departure"], entry.values["arrival"]]
	      .map((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""))
	      .filter((v) => v.length > 0);

	    await Promise.all(
	      Array.from(new Set(names)).map((name) =>
	        upsertKnownPlace({
	          id: slugifyPlaceName(name),
	          name,
	          lat: position.lat,
	          lon: position.lon,
	          updatedAt: nowIso(),
	        }).catch(() => {
	          // Best-effort only - never block saving the flight entry on this.
	        })
	      )
	    );
	  }

	  async function handleSave() {
	    if (!entry) return;

	    setSaving(true);
	    try {
	      const now = nowIso();

	      // If this is a brand new entry, generate a fresh ID and create it.
	      if (entryId === "new") {
	        const newId = "e_" + Math.random().toString(36).slice(2);
	        await upsertEntry({
	          ...entry,
	          id: newId,
	          createdAt: now,
	          updatedAt: now,
	        });
	      } else {
	        // Existing entry: update in-place.
	        await upsertEntry({
	          ...entry,
	          updatedAt: now,
	        });
	      }

	      void learnKnownPlaces();

	      router.push("/app/logbook");
	    } catch (error) {
	      showToast(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
	      setSaving(false);
	    }
	  }

  function handleCancel() {
    router.push("/app/logbook");
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
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

		  const validationWarnings = entry ? computeValidationWarnings(entry) : [];
		  const duplicateEntry = entry
		    ? findDuplicateEntry(allEntries, entry.values, entry.id)
		    : undefined;

		  const coreFieldOrder = [
		    "date",
		    "aircraft",
		    "registration",
		    "departure",
		    "arrival",
		    "departureTime",
		    "arrivalTime",
		    "totalTime",
		    "picTime",
		    "landingsDay",
		    "landingsNight",
		  ];

		  const coreFieldKeys = coreFieldOrder.filter((key) => fieldKeys.includes(key));
		  const remainingFieldKeys = fieldKeys.filter((key) => !coreFieldKeys.includes(key));

		  const groupedFields = Array.from(
		    remainingFieldKeys.reduce((map, key) => {
		      const def = FIELD_CATALOG.find((f) => f.id === key || f.key === key);
		      if (!def) return map;
		      const groupName = def.group || "Other";
		      if (!map.has(groupName)) map.set(groupName, [] as string[]);
		      map.get(groupName)!.push(key);
		      return map;
		    }, new Map<string, string[]>())
		  );

			  const renderFieldRow = (fieldKey: string) => {
		    const fieldDef = FIELD_CATALOG.find((f) => f.id === fieldKey || f.key === fieldKey);
		    if (!fieldDef) return null;
		
			    const value = entry.values[fieldKey] ?? "";
			    const isManuallyEdited = entry.manualOverrides?.[fieldKey] === true;
			
			    let fieldControl;
		
		    if (fieldDef.type === "date") {
		      fieldControl = (
		        <input
		          type="date"
		          value={value}
		          onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
		          className="w-full rounded-lg border border-[var(--border-default)] p-3 text-base transition-colors focus:outline-none focus:border-[var(--aviation-blue)]"
		          style={{ color: "var(--text-primary)" }}
		        />
		      );
		    } else if (fieldDef.type === "number") {
		      const isDurationField = fieldDef.category === "time" || fieldKey === "syntheticTime";

		      if (isDurationField) {
		        // Durations are typed as "H:MM" (e.g. "1:21"), matching how the
		        // paper/EASA logbook writes them - the underlying stored value is
		        // still whole minutes. The field shows the formatted "H:MM" as
		        // long as the stored value is still a clean number (i.e. nothing
		        // has been typed into it yet this session); once the pilot starts
		        // typing, the raw text is shown until it's parsed on blur.
		        const rawStored = entry.values[fieldKey];
		        const displayValue =
		          typeof rawStored === "number" ? formatMinutesToHHMM(rawStored) : value;
		        fieldControl = (
		          <input
		            type="text"
		            inputMode="numeric"
		            placeholder="t:mm"
		            value={displayValue}
		            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
		            onBlur={(e) => {
		              if (e.target.value === "") return;
		              handleFieldChange(fieldKey, parseTimeInput(e.target.value));
		            }}
		            className="w-full rounded-lg border border-[var(--border-default)] p-3 text-base transition-colors focus:outline-none focus:border-[var(--aviation-blue)]"
		            style={{ color: "var(--text-primary)" }}
		          />
		        );
		      } else {
		        fieldControl = (
		          <input
		            type="number"
		            step={1}
		            min={0}
		            value={value}
		            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
		            className="w-full rounded-lg border border-[var(--border-default)] p-3 text-base transition-colors focus:outline-none focus:border-[var(--aviation-blue)]"
		            style={{ color: "var(--text-primary)" }}
		          />
		        );
		      }
		    } else if (fieldDef.type === "time") {
		      fieldControl = (
		        <input
		          type="time"
		          value={value}
		          onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
		          className="w-full rounded-lg border border-[var(--border-default)] p-3 text-base transition-colors focus:outline-none focus:border-[var(--aviation-blue)]"
		          style={{ color: "var(--text-primary)" }}
		        />
		      );
		    } else if (fieldKey === "remarks") {
		      // Free text field: no suggestions, just a plain input.
		      fieldControl = (
		        <input
		          type="text"
		          value={value}
		          onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
		          className="w-full rounded-lg border border-[var(--border-default)] p-3 text-base transition-colors focus:outline-none focus:border-[var(--aviation-blue)]"
		          style={{ color: "var(--text-primary)" }}
		        />
		      );
		    } else {
		      const rawSuggestions =
		        fieldKey === "arrival"
		          ? getRouteAwareArrivalSuggestions(allEntries, String(entry.values["departure"] ?? ""), 8)
		          : getFieldSuggestions(allEntries, fieldKey, 8);
		      const inputLower = String(value ?? "").trim().toLowerCase();
		      const suggestions = [...rawSuggestions].sort((a, b) => {
		        const aLower = a.toLowerCase();
		        const bLower = b.toLowerCase();
		        const aPrefix = inputLower && aLower.startsWith(inputLower);
		        const bPrefix = inputLower && bLower.startsWith(inputLower);
		        if (aPrefix && !bPrefix) return -1;
		        if (!aPrefix && bPrefix) return 1;
		        return aLower.localeCompare(bLower);
		      });

		      // "Near you" suggestion: only for place fields, and only when
		      // geolocation is available and points to somewhere the pilot
		      // has logged a flight from/to before (see learnKnownPlaces).
		      const isPlaceField = fieldKey === "departure" || fieldKey === "arrival";
		      const nearestPlace = isPlaceField && position ? findNearestPlace(position, knownPlaces) : null;
		      const showNearestPlace = !!nearestPlace && nearestPlace.name !== inputLower.toUpperCase();

		      fieldControl = (
		        <div className="space-y-2">
		          {showNearestPlace && nearestPlace && (
		            <button
		              type="button"
		              onClick={() => handleFieldChange(fieldKey, nearestPlace.name)}
		              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm border"
		              style={{
		                borderColor: "var(--aviation-blue)",
		                backgroundColor: "var(--selected-tint)",
		                color: "var(--aviation-blue)",
		              }}
		            >
		              <MapPin size={13} strokeWidth={2.5} />
		              Near you: {nearestPlace.name} ({nearestPlace.distanceKm.toFixed(1)} km) - tap to fill
		            </button>
		          )}

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
		            className="w-full rounded-lg border border-[var(--border-default)] p-3 text-base transition-colors focus:outline-none focus:border-[var(--aviation-blue)]"
		            style={{ color: "var(--text-primary)" }}
		          />
		        </div>
		      );
		    }
		
		    return (
		      <div
		        key={fieldKey}
		        className="rounded-xl border p-4"
		        style={{
		          backgroundColor: "var(--bg-card)",
		          borderColor: "var(--border-default)",
		        }}
		      >
		        <label
		          className="block text-sm font-medium mb-2"
		          style={{ color: "var(--text-primary)" }}
		        >
		          {fieldDef.name}
		        </label>
		
		        {fieldControl}
		
		        {isManuallyEdited ? (
		          <p
		            className="text-xs mt-2 flex items-center gap-1.5"
		            style={{ color: "var(--status-info)" }}
		          >
		            <Pencil size={12} strokeWidth={2} />
		            <span>Manually edited - protected from sync</span>
		          </p>
		        ) : value !== "" ? (
		          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
		            Auto-filled from CSV/import or previous flights
		          </p>
		        ) : null}
		      </div>
		    );
		  };
		
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
	          {duplicateEntry && (
	            <Banner severity="warning" size="compact" className="mt-3">
	              <p className="font-medium flex items-center gap-1.5">
	                <TriangleAlert size={14} strokeWidth={2.5} />
	                Possible duplicate: an entry with the same date, departure, and arrival already exists.
	              </p>
	            </Banner>
	          )}
	          {validationWarnings.length > 0 && (
	            <Banner severity="warning" size="compact" className="mt-3">
	              <p className="font-medium mb-1">Consistency checks</p>
	              <ul className="list-disc ml-4 space-y-1">
	                {validationWarnings.map((w, idx) => (
	                  <li key={idx}>{w}</li>
	                ))}
	              </ul>
	            </Banner>
	          )}
	        </div>
	
	        {/* Fields */}
	        <div className="space-y-6">
	          {/* Core section */}
	          {coreFieldKeys.length > 0 && (
	            <div className="space-y-3">
	              <h2
	                className="text-sm font-semibold tracking-wide uppercase"
	                style={{ color: "var(--text-secondary)" }}
	              >
	                Core fields
	              </h2>
	              {coreFieldKeys.map(renderFieldRow)}
	            </div>
	          )}
	
	          {/* Advanced groups */}
	          {groupedFields.map(([groupName, keys]) => (
	            <div key={groupName} className="space-y-3">
	              <h2
	                className="text-sm font-semibold tracking-wide uppercase"
	                style={{ color: "var(--text-secondary)" }}
	              >
	                {groupName}
	              </h2>
	              {keys.map(renderFieldRow)}
	            </div>
	          ))}
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
          className="w-full rounded-lg px-6 py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: "var(--aviation-blue)" }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="w-full rounded-lg px-6 py-2.5 text-base font-medium bg-[var(--bg-hover)] transition-colors disabled:opacity-50 hover:bg-[var(--border-default)]"
          style={{ color: "var(--text-primary)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

