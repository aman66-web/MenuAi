/* Menu Math web app service worker.
 *
 * Goal: after you've opened something once, it keeps working with a poor or no connection.
 *  - /_next/static/* and /icons/*: cache-first (file names contain a content hash, so they never go stale)
 *  - /menus/* and /menus-sample/*: network-first, falling back to the last copy
 *  - /app/* pages (and their data requests): network-first, falling back to the last copy
 * Nothing under /api/ is ever cached, and only same-origin GET requests are handled.
 * Bump VERSION to drop all old caches.
 */
const VERSION = "mm-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DATA = `${VERSION}-data`;
const MAX_ENTRIES = { [PAGES]: 80, [DATA]: 120, [STATIC]: 200 };
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener("install", (event) => {
  // Keep the offline page and the app shell on hand from the very first visit.
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(["/app", "/app/offline"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!key.startsWith(`${VERSION}-`)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function trim(cache, name) {
  const keys = await cache.keys();
  const extra = keys.length - (MAX_ENTRIES[name] ?? 100);
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone()).then(() => trim(cache, STATIC));
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone()).then(() => trim(cache, cacheName));
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    if (request.mode === "navigate") {
      // A page that was never opened here: say so, instead of showing the wrong page at this address.
      const offline = await cache.match("/app/offline", { ignoreVary: true });
      if (offline) return offline;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith("/api/") || path === "/sw.js") return;

  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  } else if (path.startsWith("/menus/") || path.startsWith("/menus-sample/")) {
    event.respondWith(networkFirst(request, DATA));
  } else if (path === "/app" || path.startsWith("/app/")) {
    event.respondWith(networkFirst(request, PAGES));
  }
});
