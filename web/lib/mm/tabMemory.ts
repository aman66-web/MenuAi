// "Tabs remember where you were" (founder 2026-10-16): tapping another tab and coming back returns to the page you were on in that tab, not its first
// page. Tapping the tab you are already on goes to its first page. Only the address (path and query) is remembered, never the part after "#" (a shared
// list or a friend's code lives there), and only for this tab of the browser (sessionStorage), so nothing outlives the visit.

export interface TabDef {
  href: string;
  match: (path: string) => boolean;
}

export type TabMemory = Record<string, string>;

const NOT_REMEMBERED = ["/app/welcome", "/app/offline"];
// Pages Home reaches by its gear (Settings), Settings' Reminders row and its calendar (a past day, /app/today?d=...): they are side trips from Home, not
// where the person "was" in it, so tapping Home from another tab opens today, never Settings or an old day. What Home remembered before is kept.
const SIDE_TRIPS = ["/app/settings", "/app/reminders"];

/** Whether an address is never remembered: the welcome and offline pages, Home's side trips, and a day page that names a day. */
function notRemembered(path: string, search: string): boolean {
  if (NOT_REMEMBERED.some((p) => path.startsWith(p)) || SIDE_TRIPS.some((p) => path.startsWith(p))) return true;
  return path.startsWith("/app/today") && new URLSearchParams(search).has("d");
}

/** The tab a page belongs to (the first one whose match fits), if any. */
export function tabFor(tabs: readonly TabDef[], path: string): TabDef | undefined {
  return tabs.find((t) => t.match(path));
}

/** An address the memory may hold for this tab: inside the app, one slash, no fragment, and a page that really belongs to the tab. */
export function validFor(tab: TabDef, address: unknown): address is string {
  if (typeof address !== "string" || address.length > 300) return false;
  if (!address.startsWith("/app") || address.startsWith("/app//") || address.includes("#") || address.includes("\\")) return false;
  const q = address.indexOf("?");
  const path = q < 0 ? address : address.slice(0, q);
  return !notRemembered(path, q < 0 ? "" : address.slice(q)) && tab.match(path);
}

/** The memory after the person has arrived on `path` + `search`. A tab's first page clears its memory. */
export function remember(memory: TabMemory, tabs: readonly TabDef[], path: string, search: string): TabMemory {
  if (notRemembered(path, search)) return memory;
  const tab = tabFor(tabs, path);
  if (!tab) return memory;
  const address = path + search;
  if (address === tab.href) {
    if (!(tab.href in memory)) return memory;
    const rest = { ...memory };
    delete rest[tab.href];
    return rest;
  }
  if (!validFor(tab, address) || memory[tab.href] === address) return memory;
  return { ...memory, [tab.href]: address };
}

/** Where a tab's link goes: its first page when it is the open tab, else the page last seen in it. */
export function tabTarget(memory: TabMemory, tab: TabDef, active: boolean): string {
  if (active) return tab.href;
  const saved = memory[tab.href];
  return validFor(tab, saved) ? saved : tab.href;
}

/** Reads what sessionStorage held, keeping only addresses that still belong to their tab. */
export function readMemory(raw: string | null, tabs: readonly TabDef[]): TabMemory {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: TabMemory = {};
    for (const tab of tabs) {
      const v = (data as Record<string, unknown>)[tab.href];
      if (validFor(tab, v) && v !== tab.href) out[tab.href] = v;
    }
    return out;
  } catch {
    return {};
  }
}
