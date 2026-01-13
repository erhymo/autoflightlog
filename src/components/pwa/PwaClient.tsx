"use client";

import { useEffect, useState } from "react";

export function PwaClient() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Register in production and also on localhost to make it testable.
    const shouldRegister =
      process.env.NODE_ENV === "production" || window.location.hostname === "localhost";
    if (!shouldRegister) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("Service worker registration failed", err);
    });
  }, []);

  if (online) return null;

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
      <div className="text-sm font-semibold">You’re offline</div>
      <div className="text-xs mt-1">
        You can still view and edit your logbook. Changes are saved locally and will be available when you’re
        back online.
      </div>
    </div>
  );
}
