const CACHE_PREFIX = "autoflightlog";
// Clean up caches from previous app names/versions
const LEGACY_CACHE_PREFIXES = ["a-log"];
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v1`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
		      .then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/assets/logo/autoflightlog-icon.svg"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
	            .filter((k) => {
	              const isCurrent = k.startsWith(CACHE_PREFIX + "-");
	              const isLegacy = LEGACY_CACHE_PREFIXES.some((p) => k.startsWith(p + "-"));
	              return (isCurrent || isLegacy) && ![STATIC_CACHE, RUNTIME_CACHE].includes(k);
	            })
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/manifest.webmanifest";

  // Static assets: cache-first.
  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            return resp;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // Other GET requests: network-first with cache fallback.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});

function broadcastToClients(message) {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => clients.forEach((c) => c.postMessage(message)));
}

// Best-effort background sync: wakes a running tab/PWA and lets the client perform the actual sync.
// Note: the SW cannot access localStorage, so it signals the client via postMessage.
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-connectors") {
    event.waitUntil(broadcastToClients({ type: "SYNC_CONNECTORS" }));
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "sync-connectors") {
    event.waitUntil(broadcastToClients({ type: "SYNC_CONNECTORS" }));
  }
});
