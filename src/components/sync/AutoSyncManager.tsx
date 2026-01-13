"use client";

import { useEffect, useMemo, useRef } from "react";
import { runAutoSyncTick, type AutoSyncReason } from "@/lib/sync/autoSync";

function randomId(prefix: string) {
	return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

export function AutoSyncManager() {
	type SyncCapableRegistration = ServiceWorkerRegistration & {
		sync?: { register?: (tag: string) => Promise<void> };
	};

	const ownerId = useMemo(() => randomId("sync_owner"), []);
	const inFlight = useRef(false);

	async function trigger(reason: AutoSyncReason) {
		if (inFlight.current) return;
		if (typeof navigator !== "undefined" && navigator.onLine === false) return;

		inFlight.current = true;
		try {
			await runAutoSyncTick(reason, ownerId);
		} finally {
			inFlight.current = false;
		}
	}

	useEffect(() => {
		// Initial sync attempt on startup (best-effort).
		void trigger("startup");

		// If supported, register a one-off background sync so the SW can poke the client
		// when connectivity returns.
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker.ready
					.then((reg) => (reg as SyncCapableRegistration).sync?.register?.("sync-connectors"))
				.catch(() => {
					// ignore
				});
		}

		// Poll for due work. Cheap and robust.
		const interval = window.setInterval(() => {
			void trigger("timer");
		}, 60_000);

		const onOnline = () => void trigger("online");
		const onFocus = () => void trigger("focus");
		const onVisibility = () => {
			if (document.visibilityState === "visible") void trigger("visibility");
		};

		window.addEventListener("online", onOnline);
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener("online", onOnline);
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisibility);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;

		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string } | undefined;
			if (data?.type === "SYNC_CONNECTORS") void trigger("sw");
		};

		navigator.serviceWorker.addEventListener("message", onMessage);
		return () => navigator.serviceWorker.removeEventListener("message", onMessage);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return null;
}
