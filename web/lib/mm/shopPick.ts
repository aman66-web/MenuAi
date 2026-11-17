// Picking several supermarkets on Groceries' "Which shop?" and looking at them together (founder 2026-11-17: "a little select button on each one at the bottom
// right ... it will say the number that I've been selected ... the person can press go, and all the shops that they selected ... on the next page").
// Pure helpers: the shops go in the address as ?r=tesco,asda, so every value read from it is checked here.

const ID = /^[a-z0-9-]{2,40}$/;
/** Nine supermarkets have a full list today; the address never carries more than this many. */
export const MAX_PICKED_SHOPS = 12;

/** The shop ids in an address's ?r= value or a stored list: valid ids only, each once, in the order given, at most MAX_PICKED_SHOPS. */
export function parseShops(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (ID.test(id) && !out.includes(id)) out.push(id);
    if (out.length === MAX_PICKED_SHOPS) break;
  }
  return out;
}

/** The list with a shop added (at the end) or, when it is already there, taken out. */
export function toggleShop(picked: readonly string[], id: string): string[] {
  if (!ID.test(id)) return [...picked];
  return picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id].slice(0, MAX_PICKED_SHOPS);
}

/** Where "Go" leads: one shop opens that shop's own list as before; two or more open them together. */
export function pickedShopsHref(picked: readonly string[]): string {
  const ids = parseShops(picked.join(","));
  return ids.length <= 1 ? (ids[0] ? `/app/groceries/shop?r=${ids[0]}` : "/app/groceries") : `/app/groceries/shops?r=${ids.join(",")}`;
}
