"use client";

import { useMemo } from "react";
import { listRecipeFor, recipesForCupboard, type CupboardItem, type CupboardMatch } from "@/lib/mm/cupboard";
import type { DietPrefs } from "@/lib/mm/pantry";
import type { ShopFile, ShopProduct } from "@/lib/mm/shopProducts";
import { cupboardStore } from "@/lib/mm/stores";
import { useSettings, useStore } from "./hooks";
import { addMissing } from "./listRecipes";
import { recipeShop } from "./recipes";
import { useShopManifest, useShopProducts, type ShopListState } from "./shopProducts";

// What the cupboard can make (lib/mm/cupboard.ts), at the shop recipes use (the person's own if it has a full list), for the person's diet and allergies.
// Everything is worked out here on the device from the shop's product list; nothing about the cupboard is sent anywhere.

export interface CupboardRecipes {
  shop: string | null;
  state: ShopListState | null;
  result: { matches: CupboardMatch[]; leftOut: number } | null;
}

export function useCupboardRecipes(items: readonly CupboardItem[]): CupboardRecipes {
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, null, settings.shops);
  const state = useShopProducts(shop);
  const products = state.status === "ready" ? state.products : null;
  const dietKey = JSON.stringify(settings.preferences);
  // the store-cupboard things they ticked "I have this" for on a recipe page also count as in the cupboard
  const ticked = useStore(cupboardStore);
  const result = useMemo(() => {
    if (!products || !shop || !items.length) return null;
    return recipesForCupboard(items, JSON.parse(dietKey) as DietPrefs, products, shop, ticked);
  }, [items, products, shop, dietKey, ticked]);
  return { shop, state: manifest ? (shop ? state : null) : { status: "loading" }, result };
}

/** Put what a recipe still needs on the shopping list (the recipe's own pick at the shop, enough packs for the servings shown). Returns how many products. */
export function addCupboardMissing(m: CupboardMatch, products: readonly ShopProduct[], file: ShopFile): number {
  return addMissing(listRecipeFor(m, products), file);
}
