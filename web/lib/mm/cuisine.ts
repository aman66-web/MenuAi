// Browse by type on Home: each chain's own `cuisine` (from its chain.csv) is placed in one broad group so the chips stay
// few and useful on a phone ("Japanese", "Thai" and "Noodles" all browse under Asian). Groups are umbrellas over cuisines
// that exist in the data; nothing is ever given a cuisine it doesn't have, and a cuisine that fits no group goes under
// "More". Pure, so it is unit-tested.

import { tk } from "./i18n";

export interface CuisineGroupDef {
  id: string;
  label: string;
  match: RegExp;
}

/** In chip order. The first group whose pattern matches a chain's cuisine wins, so order matters (Pizza before Italian). */
export const CUISINE_GROUPS: readonly CuisineGroupDef[] = [
  { id: "burgers", label: tk("Burgers"), match: /burger/i },
  { id: "chicken", label: tk("Chicken"), match: /chicken|wings?\b/i },
  { id: "pizza", label: tk("Pizza"), match: /pizza/i },
  { id: "coffee", label: tk("Coffee & cafés"), match: /coffee|caf[eé]|\btea\b/i },
  { id: "bakery", label: tk("Bakery & sweets"), match: /baker|pastr|doughnut|donut|ice cream|dessert/i },
  { id: "sandwiches", label: tk("Sandwiches & bowls"), match: /sandwich|wrap|bowl|salad/i },
  { id: "italian", label: tk("Italian"), match: /italian/i },
  { id: "asian", label: tk("Asian"), match: /asian|japanese|chinese|thai|vietnam|korean|noodle|sushi|ramen|indian/i },
  { id: "mexican", label: tk("Mexican & Latin"), match: /mexican|latin|tex-mex|taco|burrito/i },
  { id: "pubs", label: tk("Pubs & bars"), match: /\bpubs?\b|\bbars?\b|carvery/i },
  { id: "grill", label: tk("Grill & steak"), match: /grill|steak|barbecue|bbq|smokehouse/i },
  { id: "brasserie", label: tk("British & French"), match: /british|french|brasserie/i },
  { id: "american", label: tk("American & diner"), match: /american|diner/i },
  { id: "seafood", label: tk("Seafood"), match: /seafood|fish/i },
  { id: "world", label: tk("World food"), match: /lebanese|middle east|turkish|greek|mediterranean|world/i },
  { id: "leisure", label: tk("Hotels & days out"), match: /hotel|holiday|cinema|resort|\bpark\b|leisure|bingo|bowling|museum/i },
];

export const OTHER_GROUP = { id: "more", label: tk("More") } as const;

/** The group id for a chain's cuisine ("more" when no group fits or the cuisine is missing). */
export function cuisineGroupId(cuisine: string | undefined): string {
  const c = (cuisine ?? "").trim();
  if (!c) return OTHER_GROUP.id;
  return CUISINE_GROUPS.find((g) => g.match.test(c))?.id ?? OTHER_GROUP.id;
}

export interface CuisineGroup {
  id: string;
  label: string;
  count: number;
}

/** The groups that actually have chains, in chip order, each with how many chains it holds; "More" last if used. */
export function cuisineGroups(chains: ReadonlyArray<{ cuisine?: string }>): CuisineGroup[] {
  const counts = new Map<string, number>();
  for (const c of chains) {
    const id = cuisineGroupId(c.cuisine);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const groups: CuisineGroup[] = CUISINE_GROUPS.filter((g) => counts.has(g.id)).map((g) => ({ id: g.id, label: g.label, count: counts.get(g.id)! }));
  if (counts.has(OTHER_GROUP.id)) groups.push({ ...OTHER_GROUP, count: counts.get(OTHER_GROUP.id)! });
  return groups;
}

/** The chains in one group, A to Z (case-insensitive, as the other lists). */
export function chainsInGroup<T extends { name: string; cuisine?: string }>(chains: readonly T[], groupId: string): T[] {
  return chains.filter((c) => cuisineGroupId(c.cuisine) === groupId).sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));
}
