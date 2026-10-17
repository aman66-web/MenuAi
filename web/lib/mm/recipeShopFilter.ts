import type { DietPrefs } from "./pantry";
import { othersForDiet } from "./crossShop";
import { productKey, recipeForDiet, resolveRecipe, type OtherShops, type Recipe } from "./recipes";
import type { ShopProduct } from "./shopProducts";

// The supermarket filter on the Recipes page (founder 2026-10-16): which recipes can be bought entirely at one other supermarket. A recipe counts for a shop when
// every ingredient that is not a store-cupboard item (salt, spices, oil spray...) resolves from that shop's recipe list by the very rules the recipe shop's own list
// is held to, substitutes included (the real engine, resolveRecipe, with the shop's list in the place of the home list), for the person's diet. Which products
// count depends on config.RECIPE_COMMUNITY_NUMBERS: with it off only labels from a supermarket's own page are used. The answer carries the choices that open
// the recipe at that shop, so the page shows exactly the products that were counted.

/** A shop is offered as a filter only when it completes at least this many recipes (in the current mode). */
export const MIN_SHOP_FILTER_RECIPES = 5;

export interface ShopCompletion {
  /** Ingredient key → product key ("shop:id", see productKey) of the shop's cheapest product for each ingredient it sells. A store-cupboard item the shop doesn't sell is
   *  absent: it stays as the recipe has it. Pass as `chosen` with the shop's list in `others`. */
  chosen: Record<string, string>;
  /** Ingredient key → the substitute kind the shop's product is for, only where the shop doesn't sell the kind the recipe has. Pass as `subs` (withSubstitutes) with `chosen`. */
  subs: Record<string, string>;
}

/**
 * The choices that make `recipe` come entirely from this shop, or null when it can't (an ingredient other than a store-cupboard item has no product there, or the recipe
 * is left out for the diet). `list` is the shop's recipe list already passed through `othersForDiet` for the same diet (the filter below does that once for every recipe).
 */
export function completeAtShop(recipe: Recipe, shop: string, list: readonly ShopProduct[], diet: DietPrefs = {}): ShopCompletion | null {
  const r = recipeForDiet(recipe, diet);
  if (!r) return null;
  const res = resolveRecipe(r, list);
  const chosen: Record<string, string> = {};
  const subs: Record<string, string> = {};
  for (let i = 0; i < r.ingredients.length; i++) {
    const spec = r.ingredients[i]!;
    const pick = res.picks[i];
    if (!pick) {
      if (spec.cupboard) continue;
      return null;
    }
    chosen[spec.key] = productKey(shop, pick.product.id);
    if (pick.spec !== spec && pick.spec.pantry) subs[spec.key] = pick.spec.pantry; // the shop doesn't sell the kind: its product is for the first substitute it sells
  }
  return { chosen, subs };
}

export interface ShopFilterOption {
  shop: string;
  /** How many of the recipes can be bought entirely at this shop. */
  count: number;
  /** count >= MIN_SHOP_FILTER_RECIPES: worth offering as a filter. */
  offered: boolean;
  /** Recipe id → what opens it at this shop. */
  recipes: Map<string, ShopCompletion>;
}

/**
 * For each other supermarket in `lists` (a shop whose list isn't loaded isn't here), which of `recipes` it completes for the diet, and whether it is offered as a filter.
 * The lists are the recipe lists as loaded (the diet is applied here, once). In the Map's order.
 */
export function shopFilterOptions(recipes: readonly Recipe[], lists: OtherShops, diet: DietPrefs = {}, min = MIN_SHOP_FILTER_RECIPES): ShopFilterOption[] {
  const dietLists = othersForDiet(lists, diet);
  return [...dietLists].map(([shop, list]) => {
    const done = new Map<string, ShopCompletion>();
    for (const recipe of recipes) {
      const c = completeAtShop(recipe, shop, list, diet);
      if (c) done.set(recipe.id, c);
    }
    return { shop, count: done.size, offered: done.size >= min, recipes: done };
  });
}
