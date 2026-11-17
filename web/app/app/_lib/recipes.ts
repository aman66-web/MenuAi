"use client";

import { AI_RECIPES_ENABLED } from "@/lib/mm/config";
import { useEffect, useMemo, useState } from "react";
import { fitDistance, fitRecipe, recipeForDiet, recipeTotals, resolveRecipe, type MealTarget, type Recipe, type RecipeTotals } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { DietPrefs } from "@/lib/mm/pantry";
import { recipeShopSet, tagShopProducts, type ShopFile, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";
import { loadShopFile } from "./shopProducts";

// Recipes filled with shops' own products (lib/mm/recipes.ts). Each shop's full list is loaded once and cached (_lib/shopProducts.ts).

// The rule for which shops a recipe uses lives with the shop lists (pure and unit-tested): recipeShopSet in lib/mm/shopProducts.ts.
export { recipeShopSet };

/** The shop recipes open on: the first of recipeShopSet (the one asked for, else the first of the person's supermarkets that has a full list, else the first full list). */
export function recipeShop(manifest: ShopManifest | null, asked: string | null, mine: readonly string[] | undefined): string | null {
  return recipeShopSet(manifest, asked, mine)[0] ?? null;
}

export type ShopSetState =
  | { status: "loading" }
  | { status: "error" }
  /** `files` and `lists` in the set's order (lists[i] is files[i]'s own decoded products); `products` is every shop's products as tagged copies (tagShopProducts). */
  | { status: "ready"; files: ShopFile[]; lists: ShopProduct[][]; products: ShopProduct[] };

// The tagged list for a set of shops, kept while the same decoded lists are in use, so the recipes' match cache (lib/mm/recipes.ts, per products array)
// is shared by every screen showing that set and the copies are made once.
const merged = new Map<string, { lists: ShopProduct[][]; products: ShopProduct[] }>();

function mergeLists(ids: readonly string[], lists: ShopProduct[][]): ShopProduct[] {
  const key = ids.join(",");
  const hit = merged.get(key);
  if (hit && hit.lists.length === lists.length && hit.lists.every((l, i) => l === lists[i])) return hit.products;
  const products = tagShopProducts(ids.map((shop, i) => ({ shop, products: lists[i]! })));
  merged.delete(key);
  merged.set(key, { lists, products });
  // a few sets at most (the recipes list and a recipe opened from a link can differ): the oldest goes, so ticking shops doesn't pile up copies
  while (merged.size > 3) merged.delete(merged.keys().next().value!);
  return products;
}

/** Every shop of a recipe shop set, loaded, with their products together. While a changed set loads, the last one ready stays (a recipe page doesn't jump back to a
 *  spinner, and loses nothing, while the person ticks shops). */
export function useRecipeShopSet(ids: readonly string[], retry = 0): ShopSetState {
  const idsKey = ids.join(",");
  const key = `${idsKey}|${retry}`;
  const [state, setState] = useState<{ key: string; value: ShopSetState }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!idsKey) return;
    const shops = idsKey.split(",");
    let cancelled = false;
    Promise.all(shops.map((id) => loadShopFile(id))).then(
      (loaded) => {
        if (cancelled) return;
        const lists = loaded.map((l) => l.products);
        setState({ key, value: { status: "ready", files: loaded.map((l) => l.file), lists, products: mergeLists(shops, lists) } });
      },
      () => { if (!cancelled) setState({ key, value: { status: "error" } }); },
    );
    return () => { cancelled = true; };
  }, [idsKey, key]);
  return useMemo((): ShopSetState => {
    if (!idsKey) return { status: "error" };
    if (state.key === key) return state.value;
    return state.value.status === "ready" ? state.value : { status: "loading" };
  }, [idsKey, key, state]);
}

export interface RecipeCard {
  recipe: Recipe;
  totals: RecipeTotals;
  /** How close one serving is to the target (0 = spot on); 0 when there is no target. */
  distance: number;
}

/** Every recipe that suits the diet, fitted to the target when there is one (else as written; snacks always as written). Recipes not complete at this shop are left out. */
export function useRecipeCards(recipes: readonly Recipe[] | null, products: readonly ShopProduct[] | null, diet: DietPrefs, target: MealTarget | null): { cards: RecipeCard[]; leftOut: number; incomplete: number } {
  const dietKey = JSON.stringify(diet);
  const targetKey = JSON.stringify(target);
  return useMemo(() => {
    if (!products) return { cards: [], leftOut: 0, incomplete: 0 };
    const all = recipes ?? RECIPES;
    const d = JSON.parse(dietKey) as DietPrefs;
    const t = JSON.parse(targetKey) as MealTarget | null;
    let leftOut = 0;
    let incomplete = 0; // recipes the shops can't fill (an ingredient they don't sell with a read label)
    const cards: RecipeCard[] = [];
    for (const base of all) {
      const recipe = recipeForDiet(base, d);
      if (!recipe) { leftOut++; continue; }
      // snacks are shown as written: a meal-sized target would double them
      const fitTo = recipe.meal === "snack" ? null : t;
      const totals = fitTo ? fitRecipe(recipe, products, {}, fitTo)?.totals : recipeTotals(resolveRecipe(recipe, products));
      if (!totals) { incomplete++; continue; }
      cards.push({ recipe, totals, distance: t ? fitDistance(totals.perServing, t) : 0 });
    }
    return { cards, leftOut, incomplete };
  }, [recipes, products, dietKey, targetKey]);
}

/** Whether Pip's recipe maker is switched on (the server has its key). Null until known; false when the check fails. */
export function useRecipeMakerEnabled(): boolean | null {
  const [on, setOn] = useState<boolean | null>(AI_RECIPES_ENABLED ? null : false);
  useEffect(() => {
    if (!AI_RECIPES_ENABLED) return; // off for the free launch (lib/mm/config.ts): never asks the server
    let cancelled = false;
    fetch("/api/v1/recipe").then((r) => (r.ok ? r.json() : { enabled: false })).then(
      (j: { enabled?: boolean }) => { if (!cancelled) setOn(j.enabled === true); },
      () => { if (!cancelled) setOn(false); },
    );
    return () => { cancelled = true; };
  }, []);
  return on;
}
