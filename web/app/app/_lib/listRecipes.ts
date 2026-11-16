"use client";

import { useMemo } from "react";
import { addToList, withPhoto, type ShoppingItem } from "@/lib/mm/groceries";
import { recipesFromList, type ListRecipe } from "@/lib/mm/listRecipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeForDiet, type IngredientPick, type Recipe } from "@/lib/mm/recipes";
import type { DietPrefs } from "@/lib/mm/pantry";
import { shopPhotoSources, type ShopFile } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { useSettings } from "./hooks";
import { recipeShop } from "./recipes";
import { useShopManifestState, useShopProducts, type ShopListState } from "./shopProducts";

// Recipes the shopping list can make (lib/mm/listRecipes.ts), at the shop recipes use (the person's own if it has a full list).

/**
 * `state` is null when no shop can make recipes (none has labels we've read), "error" when the list of shops or the shop's products couldn't be downloaded
 * (bump `retry` to try again), else the shop's products loading or ready. `matches` is null until there is something to match against, so a screen
 * must not read a null `matches` with a null or failed `state` as "still looking" (code audit 2026-10-29: the Shopping list's tile said "Looking through the
 * recipes…" for ever).
 */
export function useListRecipes(list: readonly ShoppingItem[], retry = 0): { shop: string | null; state: ShopListState | null; matches: ListRecipe[] | null } {
  const settings = useSettings();
  const manifestState = useShopManifestState(retry);
  const manifest = manifestState.status === "ready" ? manifestState.manifest : null;
  const shop = recipeShop(manifest, null, settings.shops);
  const state = useShopProducts(shop, retry);
  const products = state.status === "ready" ? state.products : null;
  const dietKey = JSON.stringify(settings.preferences);
  const matches = useMemo(() => {
    if (!products || !shop) return null;
    const diet = JSON.parse(dietKey) as DietPrefs;
    const recipes = RECIPES.map((r) => recipeForDiet(r, diet)).filter((r): r is Recipe => !!r);
    return recipesFromList(list, recipes, products, shop);
  }, [list, products, shop, dietKey]);
  const shown: ShopListState | null = manifestState.status === "error" ? { status: "error" } : manifestState.status === "loading" ? { status: "loading" } : shop ? state : null;
  return { shop, state: shown, matches };
}

/** Put the products a recipe still needs on the list (the recipe's own pick at the shop, enough packs for its amount). Returns how many. */
export function addMissing(m: ListRecipe, file: ShopFile): number {
  const picks = m.missing.map((i) => m.resolved.picks[i]).filter((p): p is IngredientPick => !!p);
  shoppingStore.update((list) => picks.reduce((l, p) => addToList(l, { gtin: p.product.gtin, shopId: p.product.id, retailer: file.retailer, name: p.product.name, brand: "", size: "", price: p.product.price, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, p.product)) }, new Date(), p.packs), list));
  return picks.length;
}
