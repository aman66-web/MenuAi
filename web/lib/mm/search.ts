import type { Chain } from "./types";

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
}

interface IndexedChain extends ChainHit {
  norms: string[]; // name + aliases
}
interface IndexedItem extends ItemHit {
  norm: string;
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
      });
    }
  }
  return index;
}

/** One chain in the pipeline's compact search file (menus-search.json): items are [item id, name, calories]. */
export interface CompactSearchChain {
  id: string;
  name: string;
  cuisine: string;
  aliases: string[];
  sample: boolean;
  items: Array<[string, string, number]>;
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
    for (const [itemId, name, calories] of chain.items) {
      index.items.push({ chainId: chain.id, chainName: chain.name, itemId, name, calories, sample: chain.sample, norm: normalizeForSearch(name) });
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

export function search(index: SearchIndex, rawQuery: string, maxItems = 40): SearchResults {
  const q = normalizeForSearch(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return { chains: [], items: [] };

  const chains = index.chains
    .map((c) => ({ c, rank: Math.min(...c.norms.map((n) => matchRank(n, q) ?? 2)) }))
    .filter((x) => x.rank < 2)
    .sort((a, b) => a.rank - b.rank || byName(a.c.name, b.c.name))
    .map(({ c }) => ({ chainId: c.chainId, name: c.name, cuisine: c.cuisine, sample: c.sample }));

  const items = index.items
    .map((i) => ({ i, rank: matchRank(i.norm, q) }))
    .filter((x): x is { i: IndexedItem; rank: 0 | 1 } => x.rank !== null)
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

  return { chains, items };
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
