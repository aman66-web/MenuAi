import { namedPescatarian } from "./foodDiet";
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
}

export interface SearchResults {
  chains: ChainHit[];
  items: ItemHit[];
  /** Matching dishes left out because they don't fit the diet settings passed to search(). */
  hiddenByDiet: number;
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

/** Same rule as passesDiet (menu-view.ts): tags, named vegan, and no avoided allergen (dishes without allergen information fail an allergy filter). */
export function fitsDiet(d: DietFacts, prefs: Preferences): boolean {
  if (!passesPreferences(d.tags, prefs)) return false;
  if (prefs.veganOnly && !d.namedVegan) return false;
  if (prefs.pescatarianOnly) {
    d.namedFish ??= d.name !== undefined && namedPescatarian(d.name);
    if (!(d.tags.includes("vegetarian") || (d.namedFish && !d.tags.includes("contains_pork") && !d.tags.includes("contains_beef")))) return false;
  }
  const avoid = prefs.avoidAllergens ?? [];
  if (avoid.length === 0) return true;
  return d.allergens !== null && !avoid.some((k) => d.allergens!.includes(k));
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
        norm: normalizeForSearch(item.name),
        diet: dietFactsOf(item),
      });
    }
  }
  return index;
}

/** One chain in the pipeline's compact search file (menus-search.json): items are [item id, name, calories, diet letters?] (docs/DATA.md). */
export interface CompactSearchChain {
  id: string;
  name: string;
  cuisine: string;
  aliases: string[];
  sample: boolean;
  items: Array<[string, string, number, string?]>;
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
    for (const [itemId, name, calories, diet] of chain.items) {
      index.items.push({ chainId: chain.id, chainName: chain.name, itemId, name, calories, sample: chain.sample, norm: normalizeForSearch(name), diet: decodeDiet(diet, name) });
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

/** `diet`: the person's diet settings; dishes that don't fit are left out (and counted in hiddenByDiet). */
export function search(index: SearchIndex, rawQuery: string, maxItems = 40, diet?: Preferences): SearchResults {
  const q = normalizeForSearch(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return { chains: [], items: [], hiddenByDiet: 0 };

  const chains = index.chains
    .map((c) => ({ c, rank: Math.min(...c.norms.map((n) => matchRank(n, q) ?? 2)) }))
    .filter((x) => x.rank < 2)
    .sort((a, b) => a.rank - b.rank || byName(a.c.name, b.c.name))
    .map(({ c }) => ({ chainId: c.chainId, name: c.name, cuisine: c.cuisine, sample: c.sample }));

  const matched = index.items
    .map((i) => ({ i, rank: matchRank(i.norm, q) }))
    .filter((x): x is { i: IndexedItem; rank: 0 | 1 } => x.rank !== null);
  const fitting = diet ? matched.filter((x) => fitsDiet(x.i.diet, diet)) : matched;
  const items = fitting
    .sort((a, b) => a.rank - b.rank || byName(a.i.chainName, b.i.chainName) || byName(a.i.name, b.i.name))
    .slice(0, maxItems)
    .map(({ i }) => ({
      chainId: i.chainId,
      chainName: i.chainName,
      itemId: i.itemId,
      name: i.name,
      calories: i.calories,
      sample: i.sample,
    }));

  return { chains, items, hiddenByDiet: matched.length - fitting.length };
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
