// How the Home screen lists many restaurants: a short curated "Popular" list (the biggest UK chains first), then every
// other chain A to Z under letter headings. Pure, so it is unit-tested. Chains missing from the menu data are simply skipped.

/** Biggest UK chains first. Only chains actually present in the menu data are shown. */
export const POPULAR_ORDER: readonly string[] = [
  "mcdonalds", "kfc", "burger-king", "subway", "greggs", "dominos", "pizza-hut", "papa-johns", "nandos", "five-guys",
  "wagamama", "pizza-express", "starbucks", "costa", "pret", "caffe-nero", "taco-bell", "popeyes", "krispy-kreme",
  "jd-wetherspoon", "wimpy", "leon", "itsu", "wasabi", "tim-hortons",
];

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en-US");

/**
 * Popular = the curated chains that exist, in order, up to `limit`. If hardly any curated chain exists (for example only
 * the fictional samples while testing) fall back to the first `limit` A to Z, so the list is never empty.
 */
export function splitChains<T extends { id: string; name: string }>(chains: readonly T[], limit = 10): { popular: T[]; rest: T[] } {
  const byId = new Map(chains.map((c) => [c.id, c]));
  const curated = POPULAR_ORDER.map((id) => byId.get(id)).filter((c): c is T => c !== undefined);
  const sorted = [...chains].sort(byName);
  const popular = curated.length >= 3 ? curated.slice(0, limit) : sorted.slice(0, limit);
  const taken = new Set(popular.map((c) => c.id));
  return { popular, rest: sorted.filter((c) => !taken.has(c.id)) };
}

/** Letter headings for an A to Z list: "Café Nero" files under C, anything that doesn't start with a letter under #. */
export function groupByInitial<T extends { name: string }>(chains: readonly T[]): Array<{ letter: string; chains: T[] }> {
  const groups = new Map<string, T[]>();
  for (const c of chains) {
    const first = c.name.normalize("NFD").replace(/\p{M}/gu, "").trim().charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([letter, list]) => ({ letter, chains: list }));
}

/** How many menus the offline warm-up fetches in the background (about 80 KB each): enough for the usual choices. */
export const MAX_WARM_CHAINS = 30;

/** Which chains to keep ready offline: the user's own (favourites, chains with saved orders) first, then the popular ones. */
export function chooseWarmChains<T extends { id: string; name: string }>(chains: readonly T[], priorityIds: readonly string[], limit = MAX_WARM_CHAINS): T[] {
  const byId = new Map(chains.map((c) => [c.id, c]));
  const { popular, rest } = splitChains(chains, POPULAR_ORDER.length);
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const c of [...priorityIds.map((id) => byId.get(id)), ...popular, ...rest]) {
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      ordered.push(c);
    }
  }
  return ordered.slice(0, limit);
}
