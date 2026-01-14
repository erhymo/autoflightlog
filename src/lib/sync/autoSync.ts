import { listConnectors, runMockSync } from "@/lib/repo/firestoreRepos";

export type AutoSyncReason = "startup" | "timer" | "online" | "focus" | "visibility" | "sw";

export type ConnectorSyncOutcome = {
	connectorId: string;
	ok: boolean;
	inserted?: number;
	updated?: number;
	error?: string;
};

export type AutoSyncSummary = {
	attempted: number;
	succeeded: number;
	failed: number;
	results: ConnectorSyncOutcome[];
};

type ConnectorRecord = {
	id: string;
	status?: "inactive" | "active" | "error";
	autoSyncEnabled?: boolean;
	syncIntervalMinutes?: number;
	lastSyncAt?: string;
	lastSyncAttemptAt?: string;
	consecutiveFailures?: number;
	nextSyncAt?: string;
};

const LOCK_KEY = "a_log_sync_lock_v1";
const LOCK_TTL_MS = 60_000;

function nowIso() {
	return new Date().toISOString();
}

function parseIsoDate(s?: string): Date | null {
	if (!s) return null;
	const d = new Date(s);
	return Number.isFinite(d.getTime()) ? d : null;
}

function getIntervalMinutes(c: ConnectorRecord): number {
	const raw = c.syncIntervalMinutes;
	return typeof raw === "number" && raw > 0 ? raw : 12 * 60;
}

function isDue(c: ConnectorRecord, now: Date): boolean {
	if (c.status !== "active") return false;
	if (c.autoSyncEnabled === false) return false;

	const next = parseIsoDate(c.nextSyncAt);
	if (next && now < next) return false;

	// Backward compatibility: if nextSyncAt isn't set yet, fall back to lastSyncAt + interval.
	const lastOk = parseIsoDate(c.lastSyncAt);
	if (!lastOk) return true;
	const intervalMs = getIntervalMinutes(c) * 60_000;
	return now.getTime() - lastOk.getTime() >= intervalMs;
}

function tryAcquireLock(ownerId: string): boolean {
	if (typeof window === "undefined") return false;

	const now = Date.now();
	try {
		const raw = window.localStorage.getItem(LOCK_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as { ownerId?: string; until?: number };
			if (typeof parsed.until === "number" && parsed.until > now && parsed.ownerId !== ownerId) {
				return false;
			}
		}

		window.localStorage.setItem(LOCK_KEY, JSON.stringify({ ownerId, until: now + LOCK_TTL_MS, at: nowIso() }));
		return true;
	} catch {
		// If localStorage is blocked (Safari private, etc.), just skip cross-tab locking.
		return true;
	}
}

function releaseLock(ownerId: string) {
	if (typeof window === "undefined") return;
	try {
		const raw = window.localStorage.getItem(LOCK_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw) as { ownerId?: string };
		if (parsed.ownerId === ownerId) window.localStorage.removeItem(LOCK_KEY);
	} catch {
		// ignore
	}
}

export async function runAutoSyncTick(reason: AutoSyncReason, ownerId: string): Promise<AutoSyncSummary> {
	// Note: This app is currently localStorage-first. True background sync when the app is fully closed
	// is not guaranteed on the web. This tick runs while the app/tab/PWA is alive.

	const results: ConnectorSyncOutcome[] = [];
	const connectors = (await listConnectors()) as ConnectorRecord[];
	const now = new Date();

	const due = connectors.filter((c) => isDue(c, now));
	if (due.length === 0) return { attempted: 0, succeeded: 0, failed: 0, results };

	if (!tryAcquireLock(ownerId)) return { attempted: 0, succeeded: 0, failed: 0, results };

	try {
		for (const c of due) {
			try {
				const r = await runMockSync(c.id);
				results.push({ connectorId: c.id, ok: true, inserted: r.inserted, updated: r.updated });
			} catch (err) {
				results.push({
					connectorId: c.id,
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	} finally {
		releaseLock(ownerId);
	}

	const succeeded = results.filter((r) => r.ok).length;
	const failed = results.length - succeeded;

	// Keep reason referenced to make it easy to extend with analytics later.
	void reason;

	return { attempted: results.length, succeeded, failed, results };
}
