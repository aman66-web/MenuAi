"use client";

import { useMemo } from "react";
import { addToList, withPhoto, type ShoppingItem } from "@/lib/mm/groceries";
import { itemCovers, type ListRecipe } from "@/lib/mm/listRecipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeForDiet, resolveRecipe, type IngredientPick, type Recipe } from "@/lib/mm/recipes";
import type { DietPrefs } from "@/lib/mm/pantry";
import { tk } from "@/lib/mm/i18n";
import { shopPhotoSources, shopPhotoUrl, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { useSettings } from "./hooks";
import { recipeShopSetFor, useRecipeShopSet } from "./recipes";
import { useShopManifest } from "./shopProducts";

// Recipes the shopping list can make (lib/mm/listRecipes.ts), at the same shops every other recipe screen uses (recipeShopSetFor: the person's shops whose
// labels we've read, in the order they ticked them), so "What can I cook with this?", "You might also need" and the Recipes page's "Cook with what's on your
// list" show the same products, prices and recipes as the Recipes page and a recipe page (founder 2026-11-17).

/** A match with the files of the shops its products come from (in the set's order), so its photos and "Add the rest" use each product's own shop. */
export type ListMatch = ListRecipe & { files: readonly ShopFile[] };

export type ListShopsState =
  | { status: "loading" }
  | { status: "error" }
  /** `file` is the first shop's (the one recipes open on); `files` every shop of the set, in its order. */
  | { status: "ready"; file: ShopFile; files: ShopFile[]; products: ShopProduct[] };

const NO_SHOP = "\u0000"; // never a retailer: an item from a shop outside the set counts by its name only
const NOTHING: ReadonlyMap<string, ShopProduct> = new Map();

/**
 * Recipes that use at least one thing on the list, the ones needing least else first, from several shops' products together (`products` tagged with their shop:
 * tagShopProducts). The rules are lib/mm/listRecipes.ts's: an item that is a product of one of these shops counts when the recipe's own rules would pick it (looked
 * up at its own shop, so two shops' same ids never mix); any other item counts by its name; each item counts for one ingredient, never for a substitute.
 * With one shop it gives exactly what recipesFromList gives (tested). `recipes` are already set for the person's diet; recipes the shops can't fill are left out.
 */
export function recipesFromShopSet(list: readonly ShoppingItem[], recipes: readonly Recipe[], products: readonly ShopProduct[]): ListRecipe[] {
  if (!list.length || !products.length) return [];
  const byShop = new Map<string, Map<string, ShopProduct>>();
  for (const p of products) {
    if (!p.shop) continue;
    let ids = byShop.get(p.shop);
    if (!ids) byShop.set(p.shop, (ids = new Map()));
    if (!ids.has(p.id)) ids.set(p.id, p);
  }
  const out: ListRecipe[] = [];
  for (const recipe of recipes) {
    const resolved = resolveRecipe(recipe, products);
    if (!resolved.complete) continue;
    const used = new Set<number>();
    const have: number[] = [];
    const missing: number[] = [];
    recipe.ingredients.forEach((spec, i) => {
      const j = list.findIndex((item, k) => {
        if (used.has(k)) return false;
        const own = byShop.get(item.retailer);
        return itemCovers(item, spec, products, own ?? NOTHING, own ? item.retailer : NO_SHOP, recipe, false);
      });
      if (j >= 0) { used.add(j); have.push(i); } else missing.push(i);
    });
    if (have.length) out.push({ recipe, resolved, have, missing });
  }
  return out.sort((a, b) => b.have.length - a.have.length || a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

/** The file of the shop a recipe's product comes from: its tagged shop's, or (an untagged product, one shop) the first. Undefined when its shop has no file here. */
export function fileForProduct(files: readonly ShopFile[], product: Pick<ShopProduct, "shop">): ShopFile | undefined {
  return product.shop ? files.find((f) => f.retailer === product.shop) : files[0];
}

/** What "Add the rest" puts on the list: each product the recipe still needs (its own pick, enough packs for its amount) under the shop it comes from. */
export function missingItems(m: ListRecipe, files: readonly ShopFile[]): Array<{ item: Omit<ShoppingItem, "qty" | "addedAt">; packs: number }> {
  const out: Array<{ item: Omit<ShoppingItem, "qty" | "addedAt">; packs: number }> = [];
  for (const i of m.missing) {
    const p: IngredientPick | null | undefined = m.resolved.picks[i];
    if (!p) continue;
    const file = fileForProduct(files, p.product);
    if (!file) continue; // never filed under another shop
    out.push({ item: { gtin: p.product.gtin, shopId: p.product.id, retailer: file.retailer, name: p.product.name, brand: "", size: "", price: p.product.price ?? undefined, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, p.product)) }, packs: p.packs });
  }
  return out;
}

/** The shops "Add the rest" would put this match's products under (one shop: say its name; several: "your shopping list"). */
export function missingShops(m: ListRecipe, files: readonly ShopFile[]): ShopFile[] {
  const seen = new Set<string>();
  return missingItems(m, files).map((x) => files.find((f) => f.retailer === x.item.retailer)!).filter((f) => !seen.has(f.retailer) && !!seen.add(f.retailer));
}

/**
 * The match with every product's photo made independent of the file a screen passes: a product from a shop other than the first carries its own shop's
 * picture as `otherPhoto` (and no `photoId`), so shopPhotoSources(anyFile, product) gives its own shop's photo, never the first shop's template filled with
 * another shop's id. A product whose shop has no file here shows no photo of its own. The first shop's products are left as they are (same objects).
 */
export function withOwnPhotos<M extends ListRecipe>(m: M, files: readonly ShopFile[]): M {
  const first = files[0]?.retailer;
  let changed = false;
  const picks = m.resolved.picks.map((p) => {
    if (!p || !p.product.shop || p.product.shop === first || !p.product.photoId) return p;
    const own = fileForProduct(files, p.product);
    const src = own ? shopPhotoUrl(own, p.product) : undefined;
    changed = true;
    const { otherPhoto, ...rest } = p.product;
    return { ...p, product: { ...rest, photoId: "", ...(src && own ? { otherPhoto: { src, from: own.retailer } } : otherPhoto && otherPhoto.from !== first ? { otherPhoto } : {}) } };
  });
  return changed ? { ...m, resolved: { ...m.resolved, picks } } : m;
}

/** The note after "Add the rest": the one shop the products went under by name, or "your shopping list" when they went under several. Text for t(). */
export function addedNote(m: ListRecipe | ListMatch, n: number, fallback: ShopFile): { text: string; values: Record<string, string | number> } {
  const files = "files" in m && m.files.length ? m.files : [fallback];
  const into = missingShops(m, files);
  if (into.length > 1) return { text: tk("Added {n} products to your shopping list."), values: { n } };
  const shop = (into[0] ?? files[0] ?? fallback).name;
  return n === 1 ? { text: tk("Added 1 product to your {shop} list."), values: { shop } } : { text: tk("Added {n} products to your {shop} list."), values: { n, shop } };
}

export function useListRecipes(list: readonly ShoppingItem[]): { shop: string | null; state: ListShopsState | null; matches: ListMatch[] | null } {
  const settings = useSettings();
  const manifest = useShopManifest();
  const shops = recipeShopSetFor(manifest, null, settings.shops);
  const shop = shops[0] ?? null;
  const set = useRecipeShopSet(shops);
  const products = set.status === "ready" ? set.products : null;
  const files = set.status === "ready" ? set.files : null;
  const dietKey = JSON.stringify(settings.preferences);
  const matches = useMemo(() => {
    if (!products || !files?.length) return null;
    const diet = JSON.parse(dietKey) as DietPrefs;
    const recipes = RECIPES.map((r) => recipeForDiet(r, diet)).filter((r): r is Recipe => !!r);
    return recipesFromShopSet(list, recipes, products).map((m): ListMatch => withOwnPhotos({ ...m, files }, files));
  }, [list, products, files, dietKey]);
  const state: ListShopsState | null = !manifest ? { status: "loading" } : !shop ? null
    : set.status === "ready" ? { status: "ready", file: set.files[0]!, files: set.files, products: set.products } : set;
  return { shop, state, matches };
}

/** Put the products a recipe still needs on the list, each under its own shop. `file` is used only for a match without its shops' files (one shop). Returns how many. */
export function addMissing(m: ListRecipe | ListMatch, file: ShopFile): number {
  const files = "files" in m && m.files.length ? m.files : [file];
  const items = missingItems(m, files);
  shoppingStore.update((list) => items.reduce((l, x) => addToList(l, x.item, new Date(), x.packs), list));
  return items.length;
}
