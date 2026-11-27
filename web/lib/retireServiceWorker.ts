// The website no longer runs the web app (lib/webAppClosed.ts), so its offline service worker is retired (public/sw.js). A browser that still has the old
// worker or its caches loses both on its next visit to any website page (app/components/RetireServiceWorker.tsx). Website only: the phone apps never
// register a service worker. Best effort: a browser without these features, or one that refuses, is simply left as it is.

export async function retireServiceWorker(nav: Navigator | undefined = globalThis.navigator, store: CacheStorage | undefined = globalThis.caches): Promise<void> {
  try {
    if (nav?.serviceWorker) for (const registration of await nav.serviceWorker.getRegistrations()) await registration.unregister();
  } catch {
    // ignore
  }
  try {
    if (store) for (const key of await store.keys()) await store.delete(key);
  } catch {
    // ignore
  }
}
