import { Template, ViewDefinition, LogbookEntry } from "@/types/domain";
import { loadDb, updateDb } from "@/lib/mock/storage";
import { buildDefaultEasaTemplate } from "@/lib/defaults/easaTemplate";
import { buildDefaultView } from "@/lib/defaults/defaultView";

export function ensureDefaultSetup() {
  // All mock storage lives in localStorage; no-op on the server.
  if (typeof window === "undefined") return;

  const nowIso = new Date().toISOString();

  updateDb((db) => {
    const hasTemplate = Boolean(db.templates?.["tmpl_easa_default"]);
    if (!hasTemplate) {
      db.templates["tmpl_easa_default"] = buildDefaultEasaTemplate(nowIso);
    }

    const existingView = db.views?.["view_default"] as ViewDefinition | undefined;
    if (!existingView) {
      db.views["view_default"] = buildDefaultView(nowIso, "tmpl_easa_default");
    } else if (!existingView.columns || existingView.columns.length === 0) {
      // Backfill columns for older DBs.
      const rebuilt = buildDefaultView(nowIso, existingView.templateId || "tmpl_easa_default");
      db.views["view_default"] = { ...existingView, columns: rebuilt.columns };
    }

    db.user = { ...(db.user || {}), setupComplete: true };
  });
}

export async function getTemplate(templateId: string): Promise<Template | null> {
  if (templateId === "tmpl_easa_default") ensureDefaultSetup();
  const db = loadDb();
  return (db.templates[templateId] as Template) ?? null;
}
export async function upsertTemplate(t: Template) {
  updateDb((db) => {
    db.templates[t.id] = t;
  });
}

export async function getView(viewId: string): Promise<ViewDefinition | null> {
  if (viewId === "view_default") ensureDefaultSetup();
  const db = loadDb();
  return (db.views[viewId] as ViewDefinition) ?? null;
}
export async function upsertView(v: ViewDefinition) {
  updateDb((db) => {
    db.views[v.id] = v;
  });
}

export async function listEntries(): Promise<LogbookEntry[]> {
  ensureDefaultSetup();
  const db = loadDb();
  return Object.values(db.entries) as LogbookEntry[];
}

export async function getEntry(entryId: string): Promise<LogbookEntry | null> {
  const db = loadDb();
  return (db.entries[entryId] as LogbookEntry) ?? null;
}

export async function upsertEntry(e: LogbookEntry) {
  updateDb((db) => {
    db.entries[e.id] = e;
  });
}

export async function deleteEntry(entryId: string): Promise<void> {
  updateDb((db) => {
    delete db.entries[entryId];
  });
}

export async function getUserFlags(): Promise<{ setupComplete?: boolean }> {
  ensureDefaultSetup();
  const db = loadDb();
  return db.user as any;
}
export async function setUserFlags(flags: Record<string, any>) {
  updateDb((db) => {
    db.user = { ...(db.user || {}), ...flags };
  });
}

export async function listIntegrationRequests(): Promise<any[]> {
  const db = loadDb();
  return Object.values(db.integrationRequests || {});
}

export async function addIntegrationRequest(req: any): Promise<void> {
  updateDb((db) => {
    if (!db.integrationRequests) {
      db.integrationRequests = {};
    }
    db.integrationRequests[req.id] = req;
  });
}

export async function upsertConnector(connector: any): Promise<void> {
  updateDb((db) => {
    if (!db.connectors) {
      db.connectors = {};
    }
    db.connectors[connector.id] = connector;
  });
}

export async function getConnectorByRequestId(requestId: string): Promise<any | null> {
  const db = loadDb();
  const connectors = db.connectors || {};
  const connector = Object.values(connectors).find((c: any) => c.requestId === requestId);
  return connector || null;
}

export async function listConnectors(): Promise<any[]> {
  const db = loadDb();
  return Object.values(db.connectors || {});
}

export async function runMockSync(connectorId: string): Promise<{ inserted: number; updated: number }> {
  ensureDefaultSetup();

	const SYNC_INTERVAL_MINUTES_DEFAULT = 12 * 60;
	const now = new Date();
	const nowIso = now.toISOString();
	const jitterMinutes = Math.floor(Math.random() * 5); // 0-4 minutes
	const successNextSyncAt = new Date(now.getTime() + (SYNC_INTERVAL_MINUTES_DEFAULT + jitterMinutes) * 60_000).toISOString();

  // Generate 1-3 mock entries
  const numEntries = Math.floor(Math.random() * 3) + 1;
  let inserted = 0;
  let updated = 0;

  const airports = ["ENGM", "ENBR", "ENZV", "ENTC", "ENVA", "ENKB"];
  const aircraftRegs = ["LN-ABC", "LN-DEF", "LN-GHI", "LN-JKL"];

  try {
	updateDb((db) => {
		const connector = db.connectors?.[connectorId];
		if (!connector) throw new Error("Connector not found");
		if (connector.status !== "active") throw new Error("Connector is not active");

		for (let i = 0; i < numEntries; i++) {
      const externalKey = `mock-${connectorId}-${i}`;
      const date = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const departure = airports[Math.floor(Math.random() * airports.length)];
      const arrival = airports[Math.floor(Math.random() * airports.length)];
      const registration = aircraftRegs[Math.floor(Math.random() * aircraftRegs.length)];
      const flightMinutes = Math.floor(Math.random() * 180) + 30;

      // Store as decimal hours (e.g. 1.75) to fit current FIELD_CATALOG (number)
      const totalTime = Math.round((flightMinutes / 60) * 100) / 100;

      // Check if entry with this externalKey already exists
      const existingEntry = Object.values(db.entries).find(
        (e: any) => e.source?.externalKey === externalKey
      ) as LogbookEntry | undefined;

      const newValues = {
        date,
        departure,
        arrival,
        aircraft: "AW169",
        registration,
        totalTime,
      };

			if (existingEntry) {
        // Update existing entry with conflict resolution
        const manualOverrides = existingEntry.manualOverrides || {};

        // Merge values, respecting manual overrides
        const mergedValues = { ...existingEntry.values };
        for (const [key, value] of Object.entries(newValues)) {
          if (!manualOverrides[key]) {
            mergedValues[key] = value;
          }
        }

        db.entries[existingEntry.id] = {
          ...existingEntry,
          templateId: existingEntry.templateId || "tmpl_easa_default",
          values: mergedValues,
          updatedAt: new Date().toISOString(),
        };
				updated++;
			} else {
        // Insert new entry
        const newEntry: LogbookEntry = {
          id: "e_" + Math.random().toString(36).slice(2),
          templateId: "tmpl_easa_default",
          values: newValues,
          source: {
            system: "generic_api",
            connectorId,
            externalKey,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.entries[newEntry.id] = newEntry;
        inserted++;
			}
		}

		connector.lastSyncAt = nowIso;
		connector.lastSyncAttemptAt = nowIso;
		connector.lastSyncStatus = "ok";
		connector.lastSyncError = undefined;
		connector.consecutiveFailures = 0;
		connector.autoSyncEnabled = connector.autoSyncEnabled ?? true;
		connector.syncIntervalMinutes = connector.syncIntervalMinutes ?? SYNC_INTERVAL_MINUTES_DEFAULT;
		connector.nextSyncAt = successNextSyncAt;
		db.connectors[connectorId] = connector;
	});
	} catch (err) {
		// Record failure on connector so auto-sync can back off.
		updateDb((db) => {
			const connector = db.connectors?.[connectorId];
			if (!connector) return;
			const failures = Number(connector.consecutiveFailures || 0) + 1;
			const baseMinutes = 5;
			const maxMinutes = 6 * 60;
			const backoffMinutes = Math.min(maxMinutes, baseMinutes * Math.pow(2, Math.min(failures, 8)));
			connector.lastSyncAttemptAt = nowIso;
			connector.lastSyncStatus = "error";
			connector.lastSyncError = err instanceof Error ? err.message : String(err);
			connector.consecutiveFailures = failures;
			connector.autoSyncEnabled = connector.autoSyncEnabled ?? true;
			connector.syncIntervalMinutes = connector.syncIntervalMinutes ?? SYNC_INTERVAL_MINUTES_DEFAULT;
			connector.nextSyncAt = new Date(now.getTime() + backoffMinutes * 60_000).toISOString();
			db.connectors[connectorId] = connector;
		});
		throw err;
	}

  return { inserted, updated };
}

