import type { ShoppingItem } from "./groceries";
import { nameFits, productFits, resolveRecipe, subSpec, isMeatFree, type IngredientSpec, type Recipe, type ResolvedRecipe } from "./recipes";
import type { ShopProduct } from "./shopProducts";

// "What can I cook with my shopping list?" (founder 2026-10-10: "an option at the top of the shopping list to see what recipes can be made
// from this ... and also get suggestions of what else to get"). An item on the list covers a recipe's ingredient when it is a product from
// the same shop that the recipe would pick (the very same rules), or, for a product from another shop or words the person typed, when its
// name names the ingredient. Ingredients nobody has are suggestions: the recipe's own pick at the shop, to add in one tap. Pure and tested.

export interface ListRecipe {
  recipe: Recipe;
  resolved: ResolvedRecipe;
  /** Indexes of the recipe's ingredients that something on the list covers. */
  have: number[];
  /** Indexes of the ones nothing on the list covers (to buy). */
  missing: number[];
}

/** Whether this item on the list covers the ingredient (`subs`: or one of its substitutes). `byId` holds the shop's products by id; `retailer` is that shop. */
export function itemCovers(item: ShoppingItem, spec: IngredientSpec, products: readonly ShopProduct[], byId: ReadonlyMap<string, ShopProduct>, retailer: string, recipe: Recipe, subs = true): boolean {
  const specs = [spec, ...(subs ? (spec.subs ?? []).map((s) => subSpec(spec, s, recipe.halal)).filter((x): x is IngredientSpec => !!x) : [])];
  const product = item.shopId && item.retailer === retailer ? byId.get(item.shopId) : undefined;
  const meatFree = isMeatFree(recipe);
  return specs.some((sp) => (product ? productFits(products, sp, product, meatFree) : nameFits(item.name, sp, !!item.custom)));
}

/** Which ingredients the list covers, each item counting for one ingredient only: exact matches first, then substitutes (a tin of kidney
 *  beans can stand in for black beans, but not also be the kidney beans). */
function covered(list: readonly ShoppingItem[], recipe: Recipe, products: readonly ShopProduct[], byId: ReadonlyMap<string, ShopProduct>, retailer: string): Set<number> {
  const used = new Set<number>();
  const have = new Set<number>();
  for (const subs of [false, true]) {
    recipe.ingredients.forEach((spec, i) => {
      if (have.has(i)) return;
      const j = list.findIndex((item, k) => !used.has(k) && itemCovers(item, spec, products, byId, retailer, recipe, subs));
      if (j >= 0) { used.add(j); have.add(i); }
    });
  }
  return have;
}

/**
 * Recipes that use at least one thing on the list, the ones needing least else first. `recipes` are already set for the person's diet
 * (recipeForDiet); recipes the shop can't fill are left out. Ticked-off items count (they're in the basket).
 */
export function recipesFromList(list: readonly ShoppingItem[], recipes: readonly Recipe[], products: readonly ShopProduct[], retailer: string): ListRecipe[] {
  if (!list.length || !products.length) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: ListRecipe[] = [];
  for (const recipe of recipes) {
    const resolved = resolveRecipe(recipe, products);
    if (!resolved.complete) continue;
    const got = covered(list, recipe, products, byId, retailer);
    const have = recipe.ingredients.map((_, i) => i).filter((i) => got.has(i));
    const missing = recipe.ingredients.map((_, i) => i).filter((i) => !got.has(i));
    if (have.length) out.push({ recipe, resolved, have, missing });
  }
  return out.sort((a, b) => b.have.length - a.have.length || a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

/** What to suggest buying: the best recipe that still needs something (fewest missing among those using most of the list). */
export function nextToBuy(matches: readonly ListRecipe[]): ListRecipe | null {
  return matches.find((m) => m.missing.length > 0) ?? null;
}
