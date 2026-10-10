"use client";

import { useMemo } from "react";
import { addToList, type ShoppingItem } from "@/lib/mm/groceries";
import { recipesFromList, type ListRecipe } from "@/lib/mm/listRecipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeForDiet, type IngredientPick, type Recipe } from "@/lib/mm/recipes";
import type { DietPrefs } from "@/lib/mm/pantry";
import type { ShopFile } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { useSettings } from "./hooks";
import { recipeShop } from "./recipes";
import { useShopManifest, useShopProducts, type ShopListState } from "./shopProducts";

// Recipes the shopping list can make (lib/mm/listRecipes.ts), at the shop recipes use (the person's own if it has a full list).

export function useListRecipes(list: readonly ShoppingItem[]): { shop: string | null; state: ShopListState | null; matches: ListRecipe[] | null } {
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, null, settings.shops);
  const state = useShopProducts(shop);
  const products = state.status === "ready" ? state.products : null;
  const dietKey = JSON.stringify(settings.preferences);
  const matches = useMemo(() => {
    if (!products || !shop) return null;
    const diet = JSON.parse(dietKey) as DietPrefs;
    const recipes = RECIPES.map((r) => recipeForDiet(r, diet)).filter((r): r is Recipe => !!r);
    return recipesFromList(list, recipes, products, shop);
  }, [list, products, shop, dietKey]);
  return { shop, state: manifest ? (shop ? state : null) : { status: "loading" }, matches };
}

/** Put the products a recipe still needs on the list (the recipe's own pick at the shop, enough packs for its amount). Returns how many. */
export function addMissing(m: ListRecipe, file: ShopFile): number {
  const picks = m.missing.map((i) => m.resolved.picks[i]).filter((p): p is IngredientPick => !!p);
  shoppingStore.update((list) => picks.reduce((l, p) => addToList(l, { gtin: p.product.gtin, shopId: p.product.id, retailer: file.retailer, name: p.product.name, brand: "", size: "", price: p.product.price, checkedOn: file.checkedOn }, new Date(), p.packs), list));
  return picks.length;
}
