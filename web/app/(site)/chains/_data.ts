import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD } from "@/lib/mm/config";
import { applyPreset } from "@/lib/mm/truth/presets";
import type { Chain, Manifest, ManifestChain } from "@/lib/mm/types";

// The data behind the public restaurant pages (/chains/<id>): read from the published menus at build time, so every page is plain static HTML with the real numbers
// in it. In the iPhone app's build these pages do not exist (no restaurants listed, so no pages are made and nothing of them ships inside the app).

const root = join(process.cwd(), "public/menus");
let manifestCache: Manifest | null = null;
const chainCache = new Map<string, Chain>();

export function manifest(): Manifest {
  manifestCache ??= JSON.parse(readFileSync(join(root, "menus-manifest.json"), "utf8")) as Manifest;
  return manifestCache;
}

/** The restaurants that get pages: every real chain in the manifest (never the fictional sample chains), none in the app's build. */
export function realChains(): ManifestChain[] {
  return APP_BUILD ? [] : manifest().chains.filter((c) => !c.sample);
}

export function chainEntry(id: string): ManifestChain | undefined {
  return realChains().find((c) => c.id === id);
}

export function loadChain(id: string): Chain | null {
  const hit = chainCache.get(id);
  if (hit) return hit;
  const entry = chainEntry(id);
  if (!entry) return null;
  const chain = JSON.parse(readFileSync(join(root, entry.file), "utf8")) as Chain;
  chainCache.set(id, chain);
  return chain;
}

/** A restaurant page with fewer dishes than this is not offered to search engines (it would be thin); it still works for people. */
export const MIN_ITEMS_TO_INDEX = 10;
/** A "high protein" or "under 500 calories" page exists only when at least this many dishes qualify. */
export const MIN_LIST = 3;

export type SubPage = "high-protein" | "under-500-calories";
const PRESET_OF: Record<SubPage, "protein-35" | "under-500"> = { "high-protein": "protein-35", "under-500-calories": "under-500" };

/** The dishes a sub page lists (the preset's own order). Empty for a restaurant that publishes no protein, on the high-protein page. */
export function subPageItems(chain: Chain, page: SubPage) {
  if (page === "high-protein" && chain.nutritionLevel === "calories") return [];
  return applyPreset(PRESET_OF[page], chain.items);
}

export const hasSubPage = (chain: Chain, page: SubPage): boolean => subPageItems(chain, page).length >= MIN_LIST;

/** The ids that have a given sub page (used for static params and the sitemap). */
export function chainsWithSubPage(page: SubPage): string[] {
  return realChains().filter((e) => { const c = loadChain(e.id); return c !== null && hasSubPage(c, page); }).map((e) => e.id);
}
