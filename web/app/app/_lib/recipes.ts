"use client";

import { AI_RECIPES_ENABLED } from "@/lib/mm/config";
import { useEffect, useMemo, useState } from "react";
import { fitDistance, fitRecipe, recipeForDiet, recipeTotals, resolveRecipe, type MealTarget, type Recipe, type RecipeTotals } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { DietPrefs } from "@/lib/mm/pantry";
import { recipeShops, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";

// Recipes filled with one shop's own products (lib/mm/recipes.ts). The shop's full list is loaded once and cached (_lib/shopProducts.ts).

/** The shop recipes open on: the one asked for, else the first of the person's supermarkets that has a full list, else the first full list. */
export function recipeShop(manifest: ShopManifest | null, asked: string | null, mine: readonly string[] | undefined): string | null {
  // Only shops whose product labels we have read: a list with names and prices alone (Asda, Aldi, Lidl today) can't make a recipe.
  const shops = recipeShops(manifest);
  if (shops.length === 0) return null;
  const has = (id: string | null | undefined): id is string => !!id && shops.some((r) => r.id === id);
  if (has(asked)) return asked;
  return mine?.find((id) => has(id)) ?? shops[0]!.id;
}

export interface RecipeCard {
  recipe: Recipe;
  totals: RecipeTotals;
  /** How close one serving is to the target (0 = spot on); 0 when there is no target. */
  distance: number;
}

/** Every recipe that suits the diet, fitted to the target when there is one (else as written; snacks always as written). Recipes not complete at this shop are left out. */
export function useRecipeCards(recipes: readonly Recipe[] | null, products: readonly ShopProduct[] | null, diet: DietPrefs, target: MealTarget | null): { cards: RecipeCard[]; leftOut: number } {
  const dietKey = JSON.stringify(diet);
  const targetKey = JSON.stringify(target);
  return useMemo(() => {
    if (!products) return { cards: [], leftOut: 0 };
    const all = recipes ?? RECIPES;
    const d = JSON.parse(dietKey) as DietPrefs;
    const t = JSON.parse(targetKey) as MealTarget | null;
    let leftOut = 0;
    const cards: RecipeCard[] = [];
    for (const base of all) {
      const recipe = recipeForDiet(base, d);
      if (!recipe) { leftOut++; continue; }
      // snacks are shown as written: a meal-sized target would double them
      const fitTo = recipe.meal === "snack" ? null : t;
      const totals = fitTo ? fitRecipe(recipe, products, {}, fitTo)?.totals : recipeTotals(resolveRecipe(recipe, products));
      if (!totals) continue;
      cards.push({ recipe, totals, distance: t ? fitDistance(totals.perServing, t) : 0 });
    }
    return { cards, leftOut };
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
