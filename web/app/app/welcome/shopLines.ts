// What Numbite has for each supermarket, said under its name in the shop picker (the onboarding redesign meeting of 20 November 2026, build list 5; approved by
// the founder). Worked out from the data, never typed: whether the shop is in recipes (lib/mm/shopProducts.ts recipeShops: its labels read, and
// RECIPE_COVERAGE at or above MIN_RECIPE_COVERAGE), how many of its products in the every-product list (public/groceries/all/all-manifest.json) show a
// price, and whether the product-names list (public/groceries/groceries-manifest.json) has any of its products. Pure; relative imports, so the unit tests can
// load it (tests/onboardingShopLines.test.ts). Used by app/app/_components/ShopPicker.tsx.

import { tk } from "../../../lib/mm/i18n";
import { recipeShops, type ShopManifest } from "../../../lib/mm/shopProducts";

export type ShopOffer =
  /** in recipes: our recipes are made from its labelled, priced products */
  | "recipes"
  /** in the every-product list, at least half of it priced, not in recipes */
  | "priced"
  /** in the every-product list, fewer than half priced (Lidl lists its everyday range with no price), not in recipes */
  | "somePrices"
  /** only in the product-names list (Co-op) */
  | "namesOnly"
  /** no products at all (Ocado): left out of the onboarding picker */
  | "none";

/** The line under each shop's name (read after the name as its description). "none" has no line: the shop isn't offered there. */
export const SHOP_OFFER_LINE: Readonly<Record<Exclude<ShopOffer, "none">, string>> = {
  recipes: tk("Recipes, products and prices"),
  priced: tk("Products and prices. Not in recipes yet"),
  somePrices: tk("Products and some prices. Not in recipes yet"),
  namesOnly: tk("Product names only"),
};

/** The product-names list, as far as this needs it: how many products each shop has there. */
export interface NamesManifest {
  retailers: ReadonlyArray<{ id: string; count: number }>;
}

/**
 * What a shop has. null while it can't be told (the every-product list hasn't loaded, or loaded empty because the phone is offline: a failed load must never
 * mark every shop), or, for a shop missing from that list, while the product-names list hasn't loaded.
 */
export function shopOffer(id: string, all: ShopManifest | null, names: NamesManifest | null): ShopOffer | null {
  if (!all || all.retailers.length === 0) return null;
  if (recipeShops(all).some((r) => r.id === id)) return "recipes";
  const entry = all.retailers.find((r) => r.id === id);
  if (entry && entry.count > 0) {
    const priced = entry.priced ?? entry.count;
    return priced * 2 >= entry.count ? "priced" : "somePrices";
  }
  if (!names) return null;
  return (names.retailers.find((r) => r.id === id)?.count ?? 0) > 0 ? "namesOnly" : "none";
}
