"use client";

import { useMemo } from "react";
import { addAtLeast, listForShop, MAX_SHOPPING_ITEMS, withPhoto, type AddOutcome, type ShoppingItem, type ShoppingList } from "@/lib/mm/groceries";
import { itemCovers, type ListRecipe } from "@/lib/mm/listRecipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeForDiet, resolveRecipe, type IngredientPick, type Recipe } from "@/lib/mm/recipes";
import type { DietPrefs } from "@/lib/mm/pantry";
import { tk } from "@/lib/mm/i18n";
import { recipeShops, shopPhotoSources, shopPhotoUrl, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
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

/**
 * The one rule for which list a product goes on (the meeting's shopping-list finding, 20 November 2026: "your Sainsbury's list" was said while everything went
 * on the main list): the list the person is looking at, when it is the main list or that shop's own list (`viewing`: "" for the main list, an extra list's
 * id, undefined when no list is shown); else the person's newest list for the product's shop (listForShop); else the main list. Returns "" for the main list.
 */
export function targetList(viewing: string | undefined, lists: readonly ShoppingList[] | undefined, retailer: string): string {
  if (viewing === "") return "";
  if (viewing && (lists ?? []).some((l) => l.id === viewing && l.shop === retailer)) return viewing;
  return listForShop({ shoppingLists: lists }, retailer) ?? "";
}

/** Where products went: each list ("" = the main list) and how many went on it, in the order first used; and how many couldn't (the lists were full). */
export interface Placed { lists: Array<{ list: string; n: number }>; full: number; tried: number }

/**
 * Puts items on their lists by targetList, each with at least its packs (addAtLeast: never doubled when added again), and counts what really went on. Pure:
 * the screens run it inside shoppingStore.update.
 */
export function placeItems(items: ReadonlyArray<{ item: Omit<ShoppingItem, "qty" | "addedAt" | "list">; packs: number }>, list: readonly ShoppingItem[], lists: readonly ShoppingList[] | undefined, viewing: string | undefined, now = new Date()): { list: ShoppingItem[]; placed: Placed } {
  const counts = new Map<string, number>();
  let full = 0;
  let out = [...list];
  for (const { item, packs } of items) {
    const into = targetList(viewing, lists, item.retailer);
    const r: { list: ShoppingItem[]; outcome: AddOutcome } = addAtLeast(out, { ...item, ...(into ? { list: into } : {}) }, packs, now);
    out = r.list;
    if (r.outcome === "full") full++;
    else if (r.outcome !== "had") counts.set(into, (counts.get(into) ?? 0) + 1);
  }
  return { list: out, placed: { lists: [...counts].map(([l, n]) => ({ list: l, n })), full, tried: items.length } };
}

/**
 * The note after an add, naming the real lists ("Added 4 products to Sainsbury's.", "Added 6 products to Sainsbury's and Shopping list."), or that the lists are
 * full, or that everything was on already. `nameOf` gives a list's name as the person sees it ("" = "Shopping list"). Text for t(), and the list to link to.
 */
export function addedNote(placed: Placed, nameOf: (list: string) => string): { text: string; values: Record<string, string | number>; list: string | null } {
  const n = placed.lists.reduce((s, l) => s + l.n, 0);
  const first = placed.lists[0]?.list ?? null;
  if (placed.full > 0) return { text: tk("Added {n} of {total}: your lists are full ({max} items). Remove ticked things to make room."), values: { n, total: placed.tried, max: MAX_SHOPPING_ITEMS }, list: first };
  if (!n) return { text: tk("Everything is on your shopping list already."), values: {}, list: null };
  const names = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(placed.lists.map((l) => nameOf(l.list)));
  return n === 1 ? { text: tk("Added 1 product to {list}."), values: { list: names }, list: first } : { text: tk("Added {n} products to {list}."), values: { n, list: names }, list: first };
}

/**
 * What matching reads of the list, as one string: each item's shop, its shop id, whether it was typed in and its name (itemCovers in lib/mm/listRecipes.ts,
 * and recipesFromShopSet's shop lookup), never whether it is ticked or how many. The second sort of the 21 November meeting (Xena): the recipes were worked
 * out again from the whole `list`, so every tick or quantity change redid all 333 recipes, and the Recipes tab froze on first open.
 */
export function coverKey(list: readonly ShoppingItem[]): string {
  return JSON.stringify(list.map((i) => [i.retailer, i.shopId ?? "", i.custom ? 1 : 0, i.name]));
}

/** The items back from coverKey, with only what matching reads (the rest blank): recipesFromShopSet gives the same recipes for them as for the list. */
export function coverItems(key: string): ShoppingItem[] {
  return (JSON.parse(key) as Array<[string, string, 0 | 1, string]>).map(([retailer, shopId, custom, name]) => ({
    gtin: "", retailer, name, brand: "", size: "", qty: 1, addedAt: "", ...(shopId ? { shopId } : {}), ...(custom ? { custom: true as const } : {}),
  }));
}

/**
 * The recipes for the list. `listShop`: the shop of the list being looked at (an extra list's own shop): its recipes come first when it is in recipes;
 * when it isn't, `usesOther` names it, so the screen can say which shop the recipes use. Worked out again only when coverKey changes (a tick never does it).
 */
export function useListRecipes(list: readonly ShoppingItem[], listShop?: string | null): { shop: string | null; state: ListShopsState | null; matches: ListMatch[] | null; usesOther: string | null } {
  const settings = useSettings();
  const manifest = useShopManifest();
  const inRecipes = !!listShop && recipeShops(manifest).some((r) => r.id === listShop);
  const mine = inRecipes ? [listShop!, ...(settings.shops ?? []).filter((s) => s !== listShop)] : settings.shops;
  const shops = recipeShopSetFor(manifest, null, mine);
  const shop = shops[0] ?? null;
  const set = useRecipeShopSet(shops);
  const products = set.status === "ready" ? set.products : null;
  const files = set.status === "ready" ? set.files : null;
  const dietKey = JSON.stringify(settings.preferences);
  const itemsKey = coverKey(list);
  const matches = useMemo(() => {
    if (!products || !files?.length) return null;
    const diet = JSON.parse(dietKey) as DietPrefs;
    const recipes = RECIPES.map((r) => recipeForDiet(r, diet)).filter((r): r is Recipe => !!r);
    return recipesFromShopSet(coverItems(itemsKey), recipes, products).map((m): ListMatch => withOwnPhotos({ ...m, files }, files));
  }, [itemsKey, products, files, dietKey]);
  const state: ListShopsState | null = !manifest ? { status: "loading" } : !shop ? null
    : set.status === "ready" ? { status: "ready", file: set.files[0]!, files: set.files, products: set.products } : set;
  const usesOther = listShop && manifest && !inRecipes && shop ? listShop : null;
  return { shop, state, matches, usesOther };
}

/**
 * Put the products a recipe still needs on the lists (placeItems: the list looked at, else the shop's own list, else the main list), each under its own shop.
 * `file` is used only for a match without its shops' files (one shop). Returns where they went.
 */
export function addMissing(m: ListRecipe | ListMatch, file: ShopFile, lists: readonly ShoppingList[] | undefined, viewing: string | undefined): Placed {
  const files = "files" in m && m.files.length ? m.files : [file];
  const items = missingItems(m, files);
  let placed: Placed = { lists: [], full: 0, tried: items.length };
  shoppingStore.update((list) => {
    const r = placeItems(items, list, lists, viewing);
    placed = r.placed;
    return r.list;
  });
  return placed;
}
