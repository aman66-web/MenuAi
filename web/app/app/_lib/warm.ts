// Offline warm-up: once a day, on a good connection, fetch every chain's menu so every restaurant opens without a
// connection (the page shells and their scripts are precached by the service worker, public/sw.js, when it installs).
// Small and polite: skipped on Save-Data or slow connections, one chain at a time when the browser is idle.

const KEY = "mm.v1.warmedAt";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CHAINS = 80;

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

export function shouldWarm(now = Date.now()): boolean {
  if (typeof navigator === "undefined" || !navigator.onLine || !("serviceWorker" in navigator)) return false;
  const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && conn.effectiveType !== "4g") return false;
  try {
    const last = Number(localStorage.getItem(KEY) ?? 0);
    return now - last > DAY_MS;
  } catch {
    return false;
  }
}

async function controlled(timeoutMs = 4000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, timeoutMs))]);
  if (navigator.serviceWorker.controller) return true;
  // First visit: the worker activates and claims this page a moment after registering.
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
    setTimeout(done, timeoutMs);
  });
  return !!navigator.serviceWorker.controller;
}

export async function warmOffline(chains: ReadonlyArray<{ id: string; file: string; baseUrl: string }>): Promise<void> {
  if (!shouldWarm()) return;
  if (!(await controlled())) return; // not controlled yet: try again on the next visit (don't mark as done)
  const idle = () => new Promise<void>((resolve) => ("requestIdleCallback" in window ? window.requestIdleCallback(() => resolve()) : setTimeout(resolve, 200)));
  for (const c of chains.slice(0, MAX_CHAINS)) {
    if (!navigator.onLine) return; // try again next time
    await idle();
    try {
      // Fetched through the service worker, which keeps a copy (public/sw.js).
      const res = await fetch(`${c.baseUrl}${c.file}`);
      if (!res.ok) return;
      await res.arrayBuffer();
    } catch {
      return;
    }
  }
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore
  }
}
