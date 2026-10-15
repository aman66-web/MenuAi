import { tk, type T } from "./i18n";
import { fitsDiet, type SearchIndex } from "./search";
import { ALLERGEN_KEYS, type AllergenKey, type MenuItem, type Preferences } from "./types";

// "Find a restaurant by my numbers" (founder 2026-10-15: "a way where you can input the macros like calories, protein and fat to filter the
// restaurants, also a way to filter by allergies"). A restaurant counts when at least one of its dishes fits every number typed in (and the
// person's diet and allergy settings); the list says how many dishes fit. The numbers of every dish come from the pipeline's numbers file
// (docs/DATA.md "Numbers file"), paired with the search file's items by position and checked against their calories before they are used.
// Nothing is estimated: a dish with no published figure for a number you asked about doesn't count.

export type NumberColumn = ReadonlyArray<number | null>;

/** One chain as the pipeline's numbers file lists it: calories (k), protein (p), carbohydrate (c) and fat (f) of every item, in the search file's order. */
export interface CompactNumbersChain {
  id: string;
  k: number[];
  p: NumberColumn;
  c: NumberColumn;
  f: NumberColumn;
}

export interface NumbersColumns {
  p: NumberColumn;
  c: NumberColumn;
  f: NumberColumn;
}

/** The columns of every chain whose numbers line up with the search index. */
export type NumbersIndex = ReadonlyMap<string, NumbersColumns>;

type IndexedItem = SearchIndex["items"][number];

/** "Add 8oz Sirloin", "Extra cheese": an add-on to another dish, never counted or shown as a dish of its own. */
const ADD_ON = /^(?:add|extra)\b/i;

function itemsByChain(index: SearchIndex): Map<string, IndexedItem[]> {
  const by = new Map<string, IndexedItem[]>();
  for (const it of index.items) {
    let list = by.get(it.chainId);
    if (!list) by.set(it.chainId, (list = []));
    list.push(it);
  }
  return by;
}

/**
 * Pair the numbers file with a search index built from the compact search file. A chain is used only when it has the same number of items and
 * every calorie figure agrees with the search file's, so a numbers file that doesn't belong to this search file is never trusted.
 */
export function buildNumbersIndex(chains: readonly CompactNumbersChain[], index: SearchIndex): NumbersIndex {
  const by = itemsByChain(index);
  const out = new Map<string, NumbersColumns>();
  for (const c of chains) {
    const items = by.get(c.id);
    if (!items || items.length !== c.k.length || c.p.length !== c.k.length || c.c.length !== c.k.length || c.f.length !== c.k.length) continue;
    if (!items.every((it, i) => it.calories === c.k[i])) continue;
    out.set(c.id, { p: c.p, c: c.c, f: c.f });
  }
  return out;
}

/** What the person typed in; each is optional. Protein is "at least", the others "up to". */
export interface NumberLimits {
  maxCalories?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
}

export const hasMacroLimits = (l: NumberLimits): boolean => l.minProtein !== undefined || l.maxCarbs !== undefined || l.maxFat !== undefined;
export const hasLimits = (l: NumberLimits): boolean => l.maxCalories !== undefined || hasMacroLimits(l);

export interface FinderHit {
  chainId: string;
  name: string;
  /** How many dishes fit everything. */
  count: number;
  /** One dish that fits, the one with the most protein: shown as an example. */
  example: { name: string; calories: number; protein: number | null };
}

export interface FinderResult {
  hits: FinderHit[];
  /** Restaurants left out because they publish no allergen guide (only counted while an allergy is chosen). */
  noAllergenGuide: number;
  /** Restaurants that publish calories only, left out because protein, carbs or fat were asked for. */
  caloriesOnly: number;
  /** Restaurants whose numbers couldn't be checked (the numbers file didn't line up with their menu). */
  unchecked: number;
}

/**
 * The restaurants with at least one dish that fits every number typed in and the person's diet and allergy settings, most dishes first.
 * `numbers` may be null while calories are the only limit (the search file carries them).
 */
export function findRestaurants(index: SearchIndex, numbers: NumbersIndex | null, limits: NumberLimits, prefs: Preferences): FinderResult {
  const macros = hasMacroLimits(limits);
  const allergy = (prefs.avoidAllergens?.length ?? 0) > 0;
  const names = new Map(index.chains.map((c) => [c.chainId, c.name]));
  const hits: FinderHit[] = [];
  let noAllergenGuide = 0, caloriesOnly = 0, unchecked = 0;
  for (const [chainId, items] of itemsByChain(index)) {
    const cols = numbers?.get(chainId);
    if (macros && !cols) { unchecked++; continue; }
    if (macros && cols && cols.p.every((v) => v === null)) { caloriesOnly++; continue; }
    let count = 0;
    let best: { name: string; calories: number; protein: number | null } | null = null;
    let anyAllergenInfo = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.diet.allergens !== null) anyAllergenInfo = true;
      if (ADD_ON.test(it.name)) continue;
      if (limits.maxCalories !== undefined && it.calories > limits.maxCalories) continue;
      const p = cols ? cols.p[i] ?? null : null;
      if (limits.minProtein !== undefined && (p === null || p < limits.minProtein)) continue;
      if (limits.maxCarbs !== undefined) { const c = cols?.c[i] ?? null; if (c === null || c > limits.maxCarbs) continue; }
      if (limits.maxFat !== undefined) { const f = cols?.f[i] ?? null; if (f === null || f > limits.maxFat) continue; }
      if (!fitsDiet(it.diet, prefs)) continue;
      count++;
      if (!best || (p ?? -1) > (best.protein ?? -1) || ((p ?? -1) === (best.protein ?? -1) && it.calories < best.calories)) best = { name: it.name, calories: it.calories, protein: p };
    }
    if (allergy && !anyAllergenInfo) noAllergenGuide++;
    if (count > 0 && best) hits.push({ chainId, name: names.get(chainId) ?? chainId, count, example: best });
  }
  hits.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en-GB"));
  return { hits, noAllergenGuide, caloriesOnly, unchecked };
}

/** A full menu item against the numbers (the restaurant page's "Your numbers" filter). A missing figure never fits a limit on it. */
export function fitsLimits(item: Pick<MenuItem, "nutrients">, l: NumberLimits): boolean {
  const n = item.nutrients;
  if (l.maxCalories !== undefined && n.calories > l.maxCalories) return false;
  if (l.minProtein !== undefined && (n.protein === undefined || n.protein === null || n.protein < l.minProtein)) return false;
  if (l.maxCarbs !== undefined && (n.carbs === undefined || n.carbs === null || n.carbs > l.maxCarbs)) return false;
  if (l.maxFat !== undefined && (n.fat === undefined || n.fat === null || n.fat > l.maxFat)) return false;
  return true;
}

// ---- the numbers in a link (Eat out opens a restaurant with them applied)

const PARAMS = { maxCalories: "kcal", minProtein: "protein", maxCarbs: "carbs", maxFat: "fat" } as const;

/** The limits and the allergies as query parameters ("kcal=600&protein=30&avoid=milk,eggs"); empty when there are none. */
export function limitsToParams(l: NumberLimits, avoid: readonly string[] = []): string {
  const q = new URLSearchParams();
  for (const [key, name] of Object.entries(PARAMS) as Array<[keyof NumberLimits, string]>) if (l[key] !== undefined) q.set(name, String(l[key]));
  if (avoid.length > 0) q.set("avoid", avoid.join(","));
  return q.toString();
}

/** What limitsToParams wrote. Anything that isn't a sensible number is ignored. */
export function limitsFromParams(sp: { get(name: string): string | null }): NumberLimits {
  const out: NumberLimits = {};
  for (const [key, name] of Object.entries(PARAMS) as Array<[keyof NumberLimits, string]>) {
    const raw = sp.get(name);
    if (raw === null || raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 5000) out[key] = n;
  }
  return out;
}

/** The allergies a link carries ("avoid=milk,eggs"), in the app's order; anything that isn't one of the 14 is ignored. */
export function allergensFromParams(sp: { get(name: string): string | null }): AllergenKey[] {
  const listed = (sp.get("avoid") ?? "").split(",");
  return ALLERGEN_KEYS.filter((k) => listed.includes(k));
}

const LIMIT_WORDS = {
  maxCalories: tk("up to {n} kcal"),
  minProtein: tk("{n} g+ protein"),
  maxCarbs: tk("up to {n} g carbs"),
  maxFat: tk("up to {n} g fat"),
} as const;

/** "up to 600 kcal · 30 g+ protein": the limits in a few words. */
export function limitWords(l: NumberLimits, t: T): string[] {
  return (Object.keys(LIMIT_WORDS) as Array<keyof NumberLimits>).filter((k) => l[k] !== undefined).map((k) => t(LIMIT_WORDS[k], { n: l[k]! }));
}

/** The zero of each numeral system the app's languages use besides 0-9: Arabic-Indic, Urdu (Extended Arabic-Indic), Bengali, Gurmukhi, Gujarati. */
const ZEROS = [0x660, 0x6f0, 0x9e6, 0xa66, 0xae6];

/**
 * Digits typed in another numeral system (a keyboard or number pad set to Arabic, Urdu, Bengali, Punjabi or Gujarati) as the plain 0-9 the
 * app reads, so a number typed in those isn't thrown away. Anything else is left as it is.
 */
export function toAsciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const zero = ZEROS.find((z) => cp >= z && cp <= z + 9);
    out += zero === undefined ? ch : String(cp - zero);
  }
  return out;
}
