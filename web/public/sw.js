/* Numbite's old web app service worker, retired on 27 November 2026: the website no longer runs the web app (lib/webAppClosed.ts sends /app to the
 * homepage's App Store and Google Play badges), so nothing should keep serving it from a cache.
 *
 * A browser that installed the old worker (scope /app, registered with updateViaCache "none") checks this file again on its next visit; it is served with
 * max-age=0 (next.config.ts). It then gets this version, which:
 *  - takes over at once (skipWaiting), so the old worker stops answering from its copy;
 *  - deletes every cache the old worker made;
 *  - unregisters itself, so nothing is left behind.
 * It has no fetch handler: every page and file comes from the network, so /app gets the redirect. Website pages also remove any registration and these
 * caches themselves (lib/retireServiceWorker.ts). The phone apps never register a service worker, and their packs leave this file out (scripts/pack_app_web.py).
 * To bring the offline web app back, revert the commit that made this file (docs/SITE_NO_WEB_APP_REPORT.md).
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
    })(),
  );
});
