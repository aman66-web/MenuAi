// Offline warm-up: once a day, on a good connection, fetch every chain's menu so every restaurant opens without a
// connection (the pages themselves are static shells the service worker, public/sw.js, caches on install).
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

export async function warmOffline(chains: ReadonlyArray<{ id: string }>, loadChain: (id: string) => Promise<unknown>): Promise<void> {
  if (!shouldWarm()) return;
  const idle = () => new Promise<void>((resolve) => ("requestIdleCallback" in window ? window.requestIdleCallback(() => resolve()) : setTimeout(resolve, 200)));
  for (const { id } of chains.slice(0, MAX_CHAINS)) {
    if (!navigator.onLine) return; // try again next time
    await idle();
    try {
      await loadChain(id);
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
