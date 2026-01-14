"use client";

import { useEffect, useState } from "react";

export function PwaClient() {
  // NOTE: `navigator.onLine` and the browser's online/offline events are not always reliable.
  // We treat them as hints, but also do a best-effort same-origin network probe.
  const [online, setOnline] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("pwa_offline_dismissed_v1") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function probeNetwork(): Promise<boolean> {
      // We intentionally use a query param so the request is not served from the SW cache.
      const url = `/manifest.webmanifest?ping=${Date.now()}`;
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(url, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: { "cache-control": "no-store" },
        });
        window.clearTimeout(timeout);
        return resp.ok;
      } catch {
        return false;
      }
    }

    async function refreshOnlineStatus() {
      // If the browser says we're offline, double-check before showing the banner.
      // If the browser says we're online, still verify occasionally.
      const hintedOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      const ok = await probeNetwork();
      if (cancelled) return;

      // Avoid flicker: only go offline if both the hint and the probe indicate trouble.
      if (!hintedOnline && !ok) setOnline(false);
      else if (ok) setOnline(true);
      // If probe failed but hintedOnline is true, keep current state (transient hiccup).
    }

    // Initial check after mount.
    void refreshOnlineStatus();

    const handleOnline = () => void refreshOnlineStatus();
    const handleOffline = () => void refreshOnlineStatus();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic check so we recover even if events are missed.
    const interval = window.setInterval(() => void refreshOnlineStatus(), 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Register in production and also on localhost to make it testable.
    const shouldRegister =
      process.env.NODE_ENV === "production" || window.location.hostname === "localhost";
    if (!shouldRegister) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);

  if (online || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-[420px] rounded-xl border px-4 py-3 shadow-lg"
      style={{
        backgroundColor: "#FEF3C7",
        borderColor: "#F59E0B",
        color: "#92400E",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Connection issue</div>
          <div className="text-xs mt-1">
            Network appears to be unavailable. Some features may not work until you’re back online.
          </div>
        </div>
        <button
          type="button"
          className="text-xs underline"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem("pwa_offline_dismissed_v1", "1");
            } catch {
              // ignore
            }
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
