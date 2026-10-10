"use client";

import { useMemo } from "react";
import { RECIPES, recipeTotals, resolveRecipe, type Recipe, type RecipeTotals, type ResolvedRecipe } from "@/lib/mm/recipes";
import type { ShopManifest, ShopProduct } from "@/lib/mm/shopProducts";

// Recipes filled with one shop's own products (lib/mm/recipes.ts). The shop's full list is loaded once and cached (_lib/shopProducts.ts).

/** The shop recipes open on: the one asked for, else the first of the person's supermarkets that has a full list, else the first full list. */
export function recipeShop(manifest: ShopManifest | null, asked: string | null, mine: readonly string[] | undefined): string | null {
  if (!manifest || manifest.retailers.length === 0) return null;
  const has = (id: string | null | undefined): id is string => !!id && manifest.retailers.some((r) => r.id === id);
  if (has(asked)) return asked;
  return mine?.find((id) => has(id)) ?? manifest.retailers[0]!.id;
}

export interface RecipeCard {
  recipe: Recipe;
  resolved: ResolvedRecipe;
  totals: RecipeTotals | null;
}

/** Every recipe resolved against a shop's products (only complete ones have totals). */
export function useRecipeCards(products: readonly ShopProduct[] | null): RecipeCard[] {
  return useMemo(() => {
    if (!products) return [];
    return RECIPES.map((recipe) => {
      const resolved = resolveRecipe(recipe, products);
      return { recipe, resolved, totals: recipeTotals(resolved) };
    });
  }, [products]);
}
