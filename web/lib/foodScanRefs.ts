import "server-only";
import { indexRefs, type RefDish, type RefIndexEntry } from "./mm/foodScan";
import { SCAN_RECIPE_REFS } from "./mm/scanRecipeRefs";

// Scan food's reference dishes (lib/mm/foodScan.ts): every chain's published dishes with their official calories, protein, carbs and fat, read from the
// website's own published menu files (public/menus/menus-search.json for the names, menus-numbers.json for the figures, the same files the app searches), and
// our recipes worked out from Sainsbury's labels (lib/mm/scanRecipeRefs.ts). Read once per server instance and kept for a few hours; if the menu files can't be
// read, the recipes alone are used and the estimate goes on.

const KEEP_MS = 6 * 3600_000;
let cached: { at: number; index: Promise<RefIndexEntry[]> } | null = null;

type SearchFile = { chains: Array<{ id: string; name: string; sample?: boolean; items: Array<[string, string, ...unknown[]]> }> };
type NumbersFile = { chains: Array<{ id: string; k: Array<number | null>; p: Array<number | null>; c: Array<number | null>; f: Array<number | null> }> };

/** The menu dishes from the two published files: a dish counts only when all four figures are printed. The two files are paired by position, so a chain whose
 *  figures don't line up with its dishes one for one (the two files from different publishes) is left out rather than given another dish's numbers. */
export function menuRefs(search: SearchFile, numbers: NumbersFile): RefDish[] {
  const byId = new Map(numbers.chains.map((c) => [c.id, c]));
  const out: RefDish[] = [];
  for (const chain of search.chains) {
    if (chain.sample) continue;
    const n = byId.get(chain.id);
    if (!n) continue;
    const len = chain.items.length;
    if ([n.k, n.p, n.c, n.f].some((list) => !Array.isArray(list) || list.length !== len)) continue;
    chain.items.forEach((item, i) => {
      const [kcal, protein, carbs, fat] = [n.k[i], n.p[i], n.c[i], n.f[i]];
      if (typeof item[1] !== "string" || [kcal, protein, carbs, fat].some((x) => typeof x !== "number")) return;
      out.push({ from: chain.name, name: item[1], kcal: kcal as number, protein: protein as number, carbs: carbs as number, fat: fat as number });
    });
  }
  return out;
}

export const recipeRefs = (): RefDish[] => SCAN_RECIPE_REFS.map((r) => ({ from: "Numbite recipe", ...r }));

async function load(origin: string): Promise<RefIndexEntry[]> {
  let menus: RefDish[] = [];
  try {
    // never the platform's fetch cache (meeting 21 November 2026, Priya): it keeps each file on its own, so after a menu publish the names of one could be
    // paired with the figures of the other; this module's own copy (KEEP_MS) is the only one kept, made from the two read together
    const [s, n] = await Promise.all(["menus-search.json", "menus-numbers.json"].map((f) => fetch(`${origin}/menus/${f}`, { cache: "no-store" })));
    if (s.ok && n.ok) menus = menuRefs((await s.json()) as SearchFile, (await n.json()) as NumbersFile);
    else console.error(`food scan refs: menus ${s.status}/${n.status}`);
  } catch (error) {
    console.error("food scan refs:", error);
  }
  return indexRefs([...menus, ...recipeRefs()]);
}

/** The reference index, read from this website's own published menus (origin = the request's own address). */
export function scanRefs(origin: string, now = Date.now()): Promise<RefIndexEntry[]> {
  if (!cached || now - cached.at > KEEP_MS) {
    const index = load(origin);
    cached = { at: now, index };
    // a failed read isn't kept for hours: the next scan tries again
    void index.then((list) => { if (list.length <= SCAN_RECIPE_REFS.length && cached?.index === index) cached = null; });
  }
  return cached.index;
}
