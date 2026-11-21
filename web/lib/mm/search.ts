import { namedPescatarian } from "./foodDiet";
import { namesAlcohol, namesBeef, namesPork, namesRedMeat, passesMenuDiet, restaurantPrefs, uncheckedDiet, type UncheckedDiet } from "./menu-view";
import { passesPreferences } from "./ranking";
import { ALLERGEN_KEYS, type AllergenKey, type Chain, type MenuItem, type Preferences, type Tag } from "./types";

// SPEC §7.3: type-ahead over chain and item names. Minimum 2 characters, case- and diacritic-insensitive,
// matches the start of the name or the start of any word in it ("nugg" → Nuggets, "wrap" → Chicken wrap).

export const MIN_QUERY_LENGTH = 2;

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface ChainHit {
  chainId: string;
  name: string;
  cuisine: string;
  sample: boolean;
}

export interface ItemHit {
  chainId: string;
  chainName: string;
  itemId: string;
  name: string;
  calories: number;
  sample: boolean;
  /** The chain's own photo of the dish, "<chain id>/<file>.webp" as in the menu files (shown through itemImageUrl, which applies the
   *  photo switch and the taken-down list); absent when the dish has none or the search file predates photos. */
  image?: string;
  /** Kept although the person's diet or allergies can't be checked against its restaurant's own data (it marks no dish vegetarian, names none vegan, or
   *  publishes no allergens): only its name was read, as on the restaurant's page (menu-view.ts passesMenuDiet). Shown with a "not checked" tag. */
  notChecked?: true;
}

export interface SearchResults {
  chains: ChainHit[];
  items: ItemHit[];
  /** Matching dishes left out because they don't fit the diet settings passed to search(). */
  hiddenByDiet: number;
  /** Nothing matched as typed, so these are close matches: spaces ignored ("mc chick" → McChicken) and a slip or two forgiven ("mcdonals"). */
  close?: true;
}

/** What the diet filters need to know about a dish without its full menu (the search file's diet letters, docs/DATA.md). */
export interface DietFacts {
  tags: Tag[];
  namedVegan: boolean;
  /** The guide's contains-or-may-contain allergens; null = no allergen information. */
  allergens: AllergenKey[] | null;
  /** The dish's name, kept so that a pescatarian filter can read it (not stored in the search file). */
  name?: string;
  /** The dish's own name names fish or seafood and no meat (foodDiet.ts namedPescatarian). Worked out on first use, and only when somebody has the
   *  pescatarian filter on: working it out for every dish when the search file is read made building the index several times slower for everyone. */
  namedFish?: boolean;
  /** The name rules for pork and beef (menu-view.ts namesPork / namesBeef), worked out on first use like namedFish. */
  namedPork?: boolean;
  namedBeef?: boolean;
}

const VEGAN_WORDS = /\bvegan\b|plant[\s-]?based/i; // the same words as isNamedVegan (menu-view.ts) and the pipeline's search_diet

/** Decode the search file's diet letters: v/p/b = tags, n = named vegan, a<base 36> = allergen bit mask (bit i = ALLERGEN_KEYS[i]). */
export function decodeDiet(raw: string | undefined, name?: string): DietFacts {
  const s = raw ?? "";
  const at = s.indexOf("a");
  const letters = at === -1 ? s : s.slice(0, at);
  const tags: Tag[] = [];
  if (letters.includes("v")) tags.push("vegetarian");
  if (letters.includes("p")) tags.push("contains_pork");
  if (letters.includes("b")) tags.push("contains_beef");
  let allergens: AllergenKey[] | null = null;
  if (at !== -1) {
    const mask = parseInt(s.slice(at + 1), 36);
    allergens = Number.isFinite(mask) ? ALLERGEN_KEYS.filter((_, i) => (mask >> i) & 1) : null;
  }
  return { tags, namedVegan: letters.includes("n"), allergens, ...(name !== undefined ? { name } : {}) };
}

/** The same facts read from a full menu item (for indexes built from whole chains). */
export function dietFactsOf(item: Pick<MenuItem, "tags" | "name" | "category" | "allergens">): DietFacts {
  const a = item.allergens;
  return {
    tags: [...item.tags],
    namedVegan: VEGAN_WORDS.test(item.name) || VEGAN_WORDS.test(item.category ?? ""),
    allergens: a ? ALLERGEN_KEYS.filter((k) => a.contains.includes(k) || a.mayContain.includes(k)) : null,
    name: item.name,
  };
}

/**
 * Same rule as passesDiet (menu-view.ts): the diet as restaurantPrefs maps it, tags, named vegan, pork, beef, lamb and alcohol named in the dish's own name, and
 * no avoided allergen (dishes without allergen information fail an allergy filter). `beefMenu`: the dish's restaurant sells beef, so a plain "burger" there
 * counts as beef (as on its page).
 */
export function fitsDiet(d: DietFacts, rawPrefs: Preferences, beefMenu = false): boolean {
  const prefs = restaurantPrefs(rawPrefs);
  if (!passesPreferences(d.tags, prefs)) return false;
  if (prefs.veganOnly && !d.namedVegan) return false;
  if (prefs.pescatarianOnly) {
    d.namedFish ??= d.name !== undefined && namedPescatarian(d.name);
    if (!(d.tags.includes("vegetarian") || (d.namedFish && !d.tags.includes("contains_pork") && !d.tags.includes("contains_beef")))) return false;
  }
  if (d.name !== undefined) {
    if (prefs.noPork && (d.namedPork ??= namesPork(d.name))) return false;
    if (prefs.noBeef && ((d.namedBeef ??= namesBeef(d.name)) || (beefMenu && namesBeef(d.name, true)))) return false;
    if (prefs.noRedMeat && namesRedMeat(d.name)) return false;
    if (prefs.noAlcohol && namesAlcohol(d.name)) return false;
  }
  const avoid = prefs.avoidAllergens ?? [];
  if (avoid.length === 0) return true;
  return d.allergens !== null && !avoid.some((k) => d.allergens!.includes(k));
}

/**
 * Per index and diet, what each restaurant's own data can't check (menu-view.ts uncheckedDiet, from the search file's diet letters), worked out on first use for
 * the restaurants a search reaches. A restaurant that marks no dish vegetarian, names none vegan or publishes no allergens is searched as its page shows it:
 * only dishes whose own names say otherwise are left out, and the rest are tagged "not checked".
 */
const menuChecks = new WeakMap<SearchIndex, { key: string; byChain: Map<string, UncheckedDiet> }>();
const asMenuItem = (i: IndexedItem): MenuItem => ({
  id: i.itemId, name: i.name, category: "", serving: "", nutrients: { calories: i.calories }, tags: i.diet.tags, limitedTime: false, rankable: true, components: [], modifiers: [],
  ...(i.diet.allergens ? { allergens: { contains: i.diet.allergens, mayContain: [] } } : {}),
});
function uncheckedOf(index: SearchIndex, chainId: string, prefs: Preferences): UncheckedDiet {
  const key = JSON.stringify(prefs);
  let cache = menuChecks.get(index);
  if (!cache || cache.key !== key) menuChecks.set(index, (cache = { key, byChain: new Map() }));
  let u = cache.byChain.get(chainId);
  if (!u) {
    u = uncheckedDiet(index.items.filter((i) => i.chainId === chainId).map(asMenuItem), prefs, chainId);
    cache.byChain.set(chainId, u);
  }
  return u;
}

/** Per index, which restaurants sell beef (worked out on first use, only while No beef is on). Search and Find by numbers (numbers.ts) both read it. */
const beefMenus = new WeakMap<SearchIndex, Map<string, boolean>>();
export function beefMenuOf(index: SearchIndex, chainId: string): boolean {
  let known = beefMenus.get(index);
  if (!known) beefMenus.set(index, (known = new Map()));
  let sells = known.get(chainId);
  if (sells === undefined) {
    sells = index.items.some((i) => i.chainId === chainId && (i.diet.tags.includes("contains_beef") || (i.diet.namedBeef ??= namesBeef(i.name))));
    known.set(chainId, sells);
  }
  return sells;
}

interface IndexedChain extends ChainHit {
  norms: string[]; // name + aliases
}
interface IndexedItem extends ItemHit {
  norm: string;
  diet: DietFacts;
}

export interface SearchIndex {
  chains: IndexedChain[];
  items: IndexedItem[];
}

export function buildSearchIndex(chains: readonly Chain[]): SearchIndex {
  const index: SearchIndex = { chains: [], items: [] };
  for (const chain of chains) {
    index.chains.push({
      chainId: chain.id,
      name: chain.name,
      cuisine: chain.cuisine,
      sample: chain.sample,
      norms: [chain.name, ...chain.aliases].map(normalizeForSearch).filter(Boolean),
    });
    for (const item of chain.items) {
      index.items.push({
        chainId: chain.id,
        chainName: chain.name,
        itemId: item.id,
        name: item.name,
        calories: item.nutrients.calories,
        sample: chain.sample,
        ...(item.image ? { image: item.image } : {}),
        norm: normalizeForSearch(item.name),
        diet: dietFactsOf(item),
      });
    }
  }
  return index;
}

/**
 * One chain in the pipeline's compact search file (menus-search.json): items are [item id, name, calories, diet letters?, photo?]
 * (docs/DATA.md "Search file"). The photo is the file name without ".webp" in the chain's own folder; a dish with a photo and no diet
 * letters has "" for the letters. Files written before photos have at most 4 entries.
 */
export interface CompactSearchChain {
  id: string;
  name: string;
  cuisine: string;
  aliases: string[];
  sample: boolean;
  items: Array<[string, string, number, string?, string?]>;
}

const PHOTO_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The search file's photo entry as the menu files write it ("<chain id>/<file>.webp"); anything else (absent, malformed) is no photo. */
export function compactPhoto(chainId: string, photo: unknown): string | undefined {
  return typeof photo === "string" && PHOTO_NAME_RE.test(photo) ? `${chainId}/${photo}.webp` : undefined;
}

/** The same index as buildSearchIndex, built from the compact file so no full menu has to be downloaded to search. */
export function buildSearchIndexFromCompact(chains: readonly CompactSearchChain[]): SearchIndex {
  const index: SearchIndex = { chains: [], items: [] };
  for (const chain of chains) {
    index.chains.push({
      chainId: chain.id,
      name: chain.name,
      cuisine: chain.cuisine,
      sample: chain.sample,
      norms: [chain.name, ...chain.aliases].map(normalizeForSearch).filter(Boolean),
    });
    for (const [itemId, name, calories, diet, photo] of chain.items) {
      const image = compactPhoto(chain.id, photo);
      index.items.push({ chainId: chain.id, chainName: chain.name, itemId, name, calories, sample: chain.sample, ...(image ? { image } : {}), norm: normalizeForSearch(name), diet: decodeDiet(diet, name) });
    }
  }
  return index;
}

/** 0 = the name starts with the query, 1 = a later word starts with it, null = no match. */
function matchRank(norm: string, q: string): 0 | 1 | null {
  if (norm.startsWith(q)) return 0;
  if (` ${norm}`.includes(` ${q}`)) return 1;
  return null;
}

const byName = (a: string, b: string) => a.localeCompare(b, "en-US");

/** The restaurant a search names at its start or end ("greggs sausage roll", "sausage roll greggs", "greggs"), with the rest of the words; null when none does. */
function namedChain(index: SearchIndex, q: string): { chainId: string; rest: string } | null {
  let best: { chainId: string; rest: string; len: number } | null = null;
  for (const c of index.chains) {
    for (const n of c.norms) {
      if (n.length < 3 || (best && best.len >= n.length)) continue;
      const rest = q === n ? "" : q.startsWith(`${n} `) ? q.slice(n.length + 1) : q.endsWith(` ${n}`) ? q.slice(0, -(n.length + 1)) : null;
      if (rest !== null) best = { chainId: c.chainId, rest: rest.trim(), len: n.length };
    }
  }
  return best && { chainId: best.chainId, rest: best.rest };
}

/** True when a and b are at most `max` single-letter edits apart (insert, delete, change, or two letters swapped). */
export function nearlySame(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (max <= 0 || Math.abs(a.length - b.length) > max) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/** How many slips a typed word may have: none up to 4 letters, one up to 8, two from 9 ("maccies" is not "manchester"). */
const slipsFor = (word: string) => (word.length >= 9 ? 2 : word.length >= 5 ? 1 : 0);

/**
 * A close match for a name (founder 2026-11-21: "one little spelling mistake will mean that they won't be able to get the right thing"): 2 when the typed
 * letters without spaces are inside the name without spaces ("mc chick" in "mcchicken sandwich"), 3 when every typed word starts a word of the name or is a
 * slip or two from one ("mcdonals", "chiken burger"), null otherwise.
 */
export function closeRank(norm: string, q: string): 2 | 3 | null {
  const qc = q.replace(/ /g, "");
  if (qc.length >= 4 && norm.replace(/ /g, "").includes(qc)) return 2;
  const words = norm.split(" ");
  const typed = q.split(" ").filter(Boolean);
  if (!typed.some((t) => t.length >= 4)) return null;
  for (const t of typed) {
    const max = slipsFor(t);
    // the first letter is taken as typed; the start of a longer word ("chik" for "chicken") may have one slip
    const hit = words.some((w) => w.startsWith(t) || (max > 0 && w[0] === t[0] && (nearlySame(w, t, max) || (w.length > t.length && nearlySame(w.slice(0, t.length), t, 1)))));
    if (!hit) return null;
  }
  return 3;
}

/** `diet`: the person's diet settings; dishes that don't fit are left out (and counted in hiddenByDiet). */
export function search(index: SearchIndex, rawQuery: string, maxItems = 40, diet?: Preferences): SearchResults {
  const q = normalizeForSearch(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return { chains: [], items: [], hiddenByDiet: 0 };

  const chains = index.chains
    .map((c) => ({ c, rank: Math.min(...c.norms.map((n) => matchRank(n, q) ?? 2)) }))
    .filter((x) => x.rank < 2)
    .sort((a, b) => a.rank - b.rank || byName(a.c.name, b.c.name))
    .map(({ c }) => ({ chainId: c.chainId, name: c.name, cuisine: c.cuisine, sample: c.sample }));

  // a restaurant named in the search (usability test 2026-11-19: "greggs sausage roll" found nothing, and "greggs" showed no Greggs dish): its dishes that match
  // the rest of the words come first; its name alone lists its menu. The longest name wins ("pizza express" over "pizza").
  const named = namedChain(index, q);
  const inChain = named ? index.items.filter((i) => i.chainId === named.chainId) : [];
  const fromChain = named
    ? inChain.map((i) => ({ i, rank: named.rest ? matchRank(i.norm, named.rest) : (0 as const) })).filter((x): x is { i: IndexedItem; rank: 0 | 1 } => x.rank !== null).map((x) => ({ i: x.i, rank: (x.rank - 2) as -2 | -1 }))
    : [];
  const seen = new Set(fromChain.map((x) => x.i));
  const matched = [
    ...fromChain,
    ...index.items.map((i) => ({ i, rank: matchRank(i.norm, q) })).filter((x): x is { i: IndexedItem; rank: 0 | 1 } => x.rank !== null && !seen.has(x.i)),
  ];
  const noBeef = diet ? restaurantPrefs(diet).noBeef : false;
  const unchecked = new Set<IndexedItem>();
  const fitting = diet
    ? matched.filter((x) => {
        const u = uncheckedOf(index, x.i.chainId, diet);
        if (u.vegetarian || u.vegan || u.allergies) {
          // as on the restaurant's page: the dish's own name (and the restaurant's own tags) decide; kept dishes are marked "not checked"
          const keep = passesMenuDiet(asMenuItem(x.i), diet, u);
          if (keep) unchecked.add(x.i);
          return keep;
        }
        return fitsDiet(x.i.diet, diet, noBeef && beefMenuOf(index, x.i.chainId));
      })
    : matched;
  const items = fitting
    .sort((a, b) => a.rank - b.rank || (a.rank === -2 && !named?.rest ? 0 : byName(a.i.chainName, b.i.chainName) || byName(a.i.name, b.i.name)))
    .slice(0, maxItems)
    .map(({ i }) => ({
      chainId: i.chainId,
      chainName: i.chainName,
      itemId: i.itemId,
      name: i.name,
      calories: i.calories,
      sample: i.sample,
      ...(i.image ? { image: i.image } : {}),
      ...(unchecked.has(i) ? { notChecked: true as const } : {}),
    }));

  const results: SearchResults = { chains, items, hiddenByDiet: matched.length - fitting.length };
  // nothing as typed: close matches instead, marked so the screen can say so
  if (!chains.length && !matched.length && q.replace(/ /g, "").length >= 4) return closeSearch(index, q, maxItems, diet) ?? results;
  return results;
}

/** search()'s second try: restaurants and dishes whose names are a close match (closeRank), best first; null when there are none either. */
function closeSearch(index: SearchIndex, q: string, maxItems: number, diet?: Preferences): SearchResults | null {
  const chains = index.chains
    .map((c) => ({ c, rank: Math.min(...c.norms.map((n) => closeRank(n, q) ?? 9)) }))
    .filter((x) => x.rank < 9)
    .sort((a, b) => a.rank - b.rank || byName(a.c.name, b.c.name))
    .map(({ c }) => ({ chainId: c.chainId, name: c.name, cuisine: c.cuisine, sample: c.sample }));
  // a dish is matched with its restaurant's name too, so "greggs saussage roll" finds Greggs' sausage roll; its own name alone ranks first
  const chainNorm = new Map(index.chains.map((c) => [c.chainId, c.norms[0] ?? ""]));
  const matched = index.items
    .map((i) => {
      const own = closeRank(i.norm, q);
      const withChain = own === null ? closeRank(`${i.norm} ${chainNorm.get(i.chainId) ?? ""}`, q) : null;
      return { i, rank: own ?? (withChain === null ? null : ((withChain + 2) as 4 | 5)) };
    })
    .filter((x): x is { i: IndexedItem; rank: 2 | 3 | 4 | 5 } => x.rank !== null);
  if (!chains.length && !matched.length) return null;
  const noBeef = diet ? restaurantPrefs(diet).noBeef : false;
  const fitting = diet ? matched.filter((x) => { const u = uncheckedOf(index, x.i.chainId, diet); return u.vegetarian || u.vegan || u.allergies ? passesMenuDiet(asMenuItem(x.i), diet, u) : fitsDiet(x.i.diet, diet, noBeef && beefMenuOf(index, x.i.chainId)); }) : matched;
  const items = fitting
    // the plainest name first within a rank ("Sausage Roll" before "6 Hot Mini Sausage Rolls")
    .sort((a, b) => a.rank - b.rank || a.i.name.length - b.i.name.length || byName(a.i.chainName, b.i.chainName) || byName(a.i.name, b.i.name))
    .slice(0, maxItems)
    .map(({ i }) => ({ chainId: i.chainId, chainName: i.chainName, itemId: i.itemId, name: i.name, calories: i.calories, sample: i.sample, ...(i.image ? { image: i.image } : {}) }));
  return { chains, items, hiddenByDiet: matched.length - fitting.length, close: true };
}

/** One character folded for matching (lower case, accents dropped) without changing the string's length. */
const foldChar = (ch: string) => ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().charAt(0) || ch;

/**
 * Where to highlight a query in a displayed name: the first place it starts the name or a word, ignoring case and accents.
 * [start, end) in the original string, or null when the typed text doesn't appear as-is (e.g. "&" typed as "and").
 */
export function highlightRange(name: string, rawQuery: string): [number, number] | null {
  const q = [...rawQuery.trim().replace(/\s+/g, " ")].map(foldChar).join("");
  if (q.length < MIN_QUERY_LENGTH) return null;
  const chars = [...name];
  const folded = chars.map(foldChar).join("");
  for (let i = folded.indexOf(q); i !== -1; i = folded.indexOf(q, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(folded.charAt(i - 1))) return [i, i + q.length];
  }
  return null;
}

/** Recent searches, newest first, without repeats (compared as search compares), at most `max`. */
export function addRecentSearch(list: readonly string[], query: string, max = 6): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (normalizeForSearch(q).length < MIN_QUERY_LENGTH) return [...list];
  const key = normalizeForSearch(q);
  return [q, ...list.filter((r) => normalizeForSearch(r) !== key)].slice(0, max);
}
