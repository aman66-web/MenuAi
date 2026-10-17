// "Tabs remember where you were" (founder 2026-10-16): tapping another tab and coming back returns to the page you were on in that tab, not its first
// page. Tapping the tab you are already on goes to its first page. Only the address (path and query) is remembered, never the part after "#" (a shared
// list or a friend's code lives there), and only for this tab of the browser (sessionStorage), so nothing outlives the visit.

export interface TabDef {
  href: string;
  match: (path: string) => boolean;
}

export type TabMemory = Record<string, string>;

const NOT_REMEMBERED = ["/app/welcome", "/app/offline"];

/** The tab a page belongs to (the first one whose match fits), if any. */
export function tabFor(tabs: readonly TabDef[], path: string): TabDef | undefined {
  return tabs.find((t) => t.match(path));
}

/** An address the memory may hold for this tab: inside the app, one slash, no fragment, and a page that really belongs to the tab. */
export function validFor(tab: TabDef, address: unknown): address is string {
  if (typeof address !== "string" || address.length > 300) return false;
  if (!address.startsWith("/app") || address.startsWith("/app//") || address.includes("#") || address.includes("\\")) return false;
  const path = address.split("?")[0]!;
  return !NOT_REMEMBERED.some((p) => path.startsWith(p)) && tab.match(path);
}

/** The memory after the person has arrived on `path` + `search`. A tab's first page clears its memory. */
export function remember(memory: TabMemory, tabs: readonly TabDef[], path: string, search: string): TabMemory {
  if (NOT_REMEMBERED.some((p) => path.startsWith(p))) return memory;
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
