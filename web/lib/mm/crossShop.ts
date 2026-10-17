import { RECIPE_COMMUNITY_NUMBERS } from "./config";
import { foodDietProblem } from "./foodDiet";
import type { DietPrefs } from "./pantry";
import { candidates, isShopKey, type IngredientPick, type IngredientSpec, type OtherShops } from "./recipes";
import type { ShopProduct } from "./shopProducts";
import type { Preferences } from "./types";

// Products of other supermarkets for one ingredient of a recipe (founder 2026-10-16, "swap an ingredient for a product from another supermarket"): what the
// swap sheet offers, how a choice changes a serving, where its numbers come from, and the diet guard. The engine itself (resolveRecipe, fitRecipe, recipeTotals)
// is in recipes.ts; nothing here estimates a number.

export interface ShopCandidates {
  shop: string;
  /** The shop's products that fit the ingredient, cheapest basket first (the very order and rules of the recipe shop's own list); each pick carries `shop`. */
  picks: IngredientPick[];
}

/**
 * For each other supermarket in `others` (in the Map's order: put the person's own shops first), the products that can stand for this ingredient. A shop with none
 * is left out, so an empty answer means "no other supermarket has a product we can use for this one". Pass the ingredient as the page shows it (the substitute
 * spec if one was chosen: another shop's product is offered for the CURRENT kind only). `others` should already be passed through `othersForDiet`. A pick with
 * `usedCost` null has no price per kg or litre to work a serving's price from; the swap sheet hides those the way it does for the recipe shop's own list.
 */
export function crossCandidates(others: OtherShops, spec: IngredientSpec, meatFree = false): ShopCandidates[] {
  const out: ShopCandidates[] = [];
  for (const [shop, list] of others) {
    if (!isShopKey(shop)) continue; // an id a choice couldn't be kept under
    const picks = candidates(list, spec, meatFree).map((c) => ({ ...c, shop }));
    if (picks.length) out.push({ shop, picks });
  }
  return out;
}

/** Where a picked product's numbers come from: "own" = the label on the recipe shop's own page; "sameBarcode" = another shop's product, with the label printed on the
 *  recipe shop's own page for the IDENTICAL barcode (copied when the recipe lists were built); "community" = Open Food Facts contributors' record of its barcode,
 *  only while config.RECIPE_COMMUNITY_NUMBERS is on. The screen marks the last two on the product's row and the third in the recipe's note. */
export type PickSource = "own" | "sameBarcode" | "community";
export const pickSource = (p: Pick<IngredientPick, "product" | "shop">): PickSource =>
  p.product.nutrition?.source === "community" ? "community" : p.shop ? "sameBarcode" : "own";

/** Why Open Food Facts numbers can never stand in for this ingredient, whatever the switch says: a drained amount (the record doesn't say whether it is for the drained
 *  food) or a kind with no kcal range (which is all that fixes the form of the food the numbers are for). Null when they could. Only another supermarket's label
 *  from a supermarket page can serve such an ingredient. */
export function communityBlockedReason(spec: Pick<IngredientSpec, "drained" | "match">): "drained" | "noRange" | null {
  return spec.drained ? "drained" : spec.match.kcal ? null : "noRange";
}

/** Whether Open Food Facts numbers are allowed at all (config.RECIPE_COMMUNITY_NUMBERS), for screens that word things differently when they are not. */
export const communityNumbersOn = (): boolean => RECIPE_COMMUNITY_NUMBERS;

/**
 * What picking `alt` instead of `current` does to a serving: calories and protein, the difference between the two labels for the ingredient's amount, per
 * serving (kcal to a whole number, protein to 0.1 g; never -0). Null when either product has no label we have read, or `servings` is not positive. Use the
 * recipe-as-written's pick and servings (`(resolved.basis ?? resolved)`), so the answer is the serving and not the people. Both products are for the amount
 * `current` has (the swap sheet offers only products for that very ingredient).
 */
export function swapEffect(current: IngredientPick, alt: Pick<IngredientPick, "product">, servings: number): { kcal: number; protein: number } | null {
  const a = alt.product.nutrition;
  const c = current.product.nutrition;
  if (!a || !c || !(servings > 0)) return null;
  const f = current.spec.amount / 100 / servings;
  return { kcal: Math.round((a.kcal - c.kcal) * f) + 0, protein: Math.round((a.protein - c.protein) * f * 10) / 10 + 0 };
}

// ---- shop-internal barcodes

/** A shop-internal ("restricted circulation") barcode, the very rule the pipeline uses (tools/groceries/build_groceries.py restricted_code): EAN-8 starting 0 or 2, EAN-13
 *  starting 2, 02 or 04 (UPC 2 and 4 too), leading zeros ignored. A shop gives these out itself, so the same number is a different product at another shop. */
export function isRestrictedCode(code: string): boolean {
  const n = code.trim().replace(/^0+/, "");
  if (!/^\d+$/.test(n)) return false;
  if (n.length <= 8) return n.padStart(8, "0")[0] === "0" || n.padStart(8, "0")[0] === "2";
  const c = n.length <= 13 ? n.padStart(13, "0") : n.slice(-13);
  return c[0] === "2" || c.startsWith("02") || c.startsWith("04");
}

/** A recipe list's products without any whose barcode is shop-internal. The numbers in a recipe list are copied from another record of the same barcode, and a shop-internal
 *  barcode names a different product at every shop, so the pipeline never joins on one; this drops such a row if one ever got in. Not for a shop's own full list (its own labels). */
export function withoutRestricted(products: readonly ShopProduct[]): ShopProduct[] {
  return products.filter((p) => !p.gtin || !isRestrictedCode(p.gtin));
}

// ---- the diet guard

const asPreferences = (d: DietPrefs): Preferences => ({
  vegetarianOnly: !!d.vegetarianOnly, noPork: !!d.noPork, noBeef: !!d.noBeef, veganOnly: !!d.veganOnly, pescatarianOnly: !!d.pescatarianOnly, halalOnly: !!d.halalOnly,
});
const anyDiet = (d: DietPrefs) => !!(d.vegetarianOnly || d.noPork || d.noBeef || d.veganOnly || d.pescatarianOnly || d.halalOnly);

const filteredLists = new WeakMap<readonly ShopProduct[], Map<string, readonly ShopProduct[]>>();
const filteredShops = new WeakMap<OtherShops, Map<string, OtherShops>>();

/**
 * The other supermarkets' lists with every product removed that its own name or aisle plainly says doesn't suit the diet (the app's grocery rule, foodDietProblem:
 * meat or fish for a vegetarian, milk for a vegan, pork or an alcoholic name for halal...). It only ever removes, and it reads names and aisles alone: these products'
 * allergens are not read, so allergies are not applied here (the recipe's ingredients already are, and the page says to check each pack). The recipe shop's own list is
 * never passed through this. The same Map and arrays come back for the same input (which products fit a kind is cached per array), and the input itself when no
 * diet is set. Pass the result to resolveRecipe / fitRecipe / recipeView / crossCandidates, so a choice that the diet no longer allows is stale and falls back.
 */
export function othersForDiet(others: OtherShops, diet: DietPrefs): OtherShops {
  if (!anyDiet(diet)) return others;
  const key = JSON.stringify([!!diet.vegetarianOnly, !!diet.veganOnly, !!diet.pescatarianOnly, !!diet.halalOnly, !!diet.noPork, !!diet.noBeef]);
  let byKey = filteredShops.get(others);
  if (!byKey) { byKey = new Map(); filteredShops.set(others, byKey); }
  const done = byKey.get(key);
  if (done) return done;
  const prefs = asPreferences(diet);
  const out = new Map<string, readonly ShopProduct[]>();
  for (const [shop, list] of others) {
    let perDiet = filteredLists.get(list);
    if (!perDiet) { perDiet = new Map(); filteredLists.set(list, perDiet); }
    let kept = perDiet.get(key);
    if (!kept) {
      kept = list.filter((p) => foodDietProblem({ name: p.name, category: p.category }, prefs) === null);
      perDiet.set(key, kept);
    }
    out.set(shop, kept);
  }
  byKey.set(key, out);
  return out;
}
