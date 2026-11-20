"use client";

import { AI_RECIPES_ENABLED } from "@/lib/mm/config";
import { useEffect, useMemo, useState } from "react";
import { fitDistance, fitRecipe, recipeForDiet, recipeTotals, resolveRecipe, type MealTarget, type Recipe, type RecipeTotals } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { DietPrefs } from "@/lib/mm/pantry";
import { recipeShops, recipeShopSet, tagShopProducts, type ShopFile, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";
import { loadShopFile } from "./shopProducts";

// Recipes filled with shops' own products (lib/mm/recipes.ts). Each shop's full list is loaded once and cached (_lib/shopProducts.ts).

/**
 * The shops every recipe screen uses (Recipes, a recipe page, Add food, My meals, onboarding's first recipe), so a recipe has the same products and figures
 * wherever it is shown. The rule lives with the shop lists (recipeShopSet in lib/mm/shopProducts.ts: the person's shops whose labels we've read, in the order
 * they ticked them), with one more: a shop named by the address (a recipe card's &r=, a Back link's ?r=, a tab that remembers an old address, a saved
 * recipe's own shop) counts only when none of the person's own shops can make recipes yet. Their own choice always wins, so a supermarket they have
 * unticked never comes back first (founder 2026-11-17: "If I choose to shop at Asda, it's still showing stuff from Sainsbury's").
 */
export function recipeShopSetFor(manifest: ShopManifest | null, asked: string | null, mine: readonly string[] | undefined): string[] {
  const ready = recipeShops(manifest);
  const ownReady = (mine ?? []).some((id) => ready.some((r) => r.id === id));
  return recipeShopSet(manifest, ownReady ? null : asked, mine);
}

/** The shop recipes open on: the first of recipeShopSetFor. */
export function recipeShop(manifest: ShopManifest | null, asked: string | null, mine: readonly string[] | undefined): string | null {
  return recipeShopSetFor(manifest, asked, mine)[0] ?? null;
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

export interface RecipeCards {
  cards: RecipeCard[];
  leftOut: number;
  incomplete: number;
  /** The cards are worked out for these products (false while products load, or while a `chunked` list is still being worked out: show the spinner). */
  ready: boolean;
}

type Worked = Omit<RecipeCards, "ready">;
const NONE: Worked = { cards: [], leftOut: 0, incomplete: 0 };

/** One recipe's card for this diet and target, or why there is none. */
function cardFor(base: Recipe, products: readonly ShopProduct[], d: DietPrefs, t: MealTarget | null): RecipeCard | "leftOut" | "incomplete" {
  const recipe = recipeForDiet(base, d);
  if (!recipe) return "leftOut";
  // snacks are shown as written: a meal-sized target would double them
  const fitTo = recipe.meal === "snack" ? null : t;
  const totals = fitTo ? fitRecipe(recipe, products, {}, fitTo)?.totals : recipeTotals(resolveRecipe(recipe, products));
  if (!totals) return "incomplete";
  return { recipe, totals, distance: t ? fitDistance(totals.perServing, t) : 0 };
}

function addCard(out: Worked, c: ReturnType<typeof cardFor>): void {
  if (c === "leftOut") out.leftOut++;
  else if (c === "incomplete") out.incomplete++; // recipes the shops can't fill (an ingredient they don't sell with a read label)
  else out.cards.push(c);
}

// The whole book's cards, kept per products array (the shop set's tagged list is kept while it is in use: `merged` above) and per diet and target, so the Recipes
// tab, My recipes and Add food's "Choose a recipe" work the book out once, and coming Back to the Recipes tab shows the same list at once (its scroll comes back to
// the same cards). The 30-person audit (20 November 2026) measured one 3-second block the first time.
const bookCards = new WeakMap<readonly ShopProduct[], Map<string, Worked>>();
const BOOK_KEYS_KEPT = 4;
function keepBook(products: readonly ShopProduct[], key: string, worked: Worked): void {
  let byKey = bookCards.get(products);
  if (!byKey) { byKey = new Map(); bookCards.set(products, byKey); }
  byKey.delete(key);
  byKey.set(key, worked);
  while (byKey.size > BOOK_KEYS_KEPT) byKey.delete(byKey.keys().next().value!);
}

/** How many recipes are worked out between pauses when the book is worked out in chunks (each pause lets the screen draw and take a tap). */
const CHUNK = 8;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Every recipe that suits the diet, fitted to the target when there is one (else as written; snacks always as written). Recipes not complete at this shop are
 * left out. With `chunked` (the whole book only: `recipes` null), the first time a book is worked out for these products, diet and target it is done a few
 * recipes at a time with pauses between, so the screen never freezes; `ready` says when the list is complete (show the spinner until then).
 */
export function useRecipeCards(recipes: readonly Recipe[] | null, products: readonly ShopProduct[] | null, diet: DietPrefs, target: MealTarget | null, opts: { chunked?: boolean } = {}): RecipeCards {
  const dietKey = JSON.stringify(diet);
  const targetKey = JSON.stringify(target);
  const key = `${dietKey}|${targetKey}`;
  const book = recipes === null;
  const chunked = !!opts.chunked && book;
  const kept = book && products ? bookCards.get(products)?.get(key) : undefined;
  const now = useMemo((): Worked | null => {
    if (!products) return NONE;
    if (kept) return kept;
    if (chunked) return null; // worked out in the effect below
    const d = JSON.parse(dietKey) as DietPrefs;
    const t = JSON.parse(targetKey) as MealTarget | null;
    const out: Worked = { cards: [], leftOut: 0, incomplete: 0 };
    for (const base of recipes ?? RECIPES) addCard(out, cardFor(base, products, d, t));
    if (book) keepBook(products, key, out);
    return out;
  }, [recipes, products, dietKey, targetKey, key, kept, chunked, book]);
  const [later, setLater] = useState<{ products: readonly ShopProduct[]; key: string; worked: Worked } | null>(null);
  useEffect(() => {
    if (now || !products) return;
    let live = true;
    void (async () => {
      const d = JSON.parse(dietKey) as DietPrefs;
      const t = JSON.parse(targetKey) as MealTarget | null;
      const out: Worked = { cards: [], leftOut: 0, incomplete: 0 };
      for (let i = 0; i < RECIPES.length; i += CHUNK) {
        if (i > 0) await pause();
        if (!live) return;
        for (const base of RECIPES.slice(i, i + CHUNK)) addCard(out, cardFor(base, products, d, t));
      }
      keepBook(products, key, out);
      if (live) setLater({ products, key, worked: out });
    })();
    return () => { live = false; };
  }, [now, products, dietKey, targetKey, key]);
  if (now) return { ...now, ready: !!products };
  if (later && later.products === products && later.key === key) return { ...later.worked, ready: true };
  return { ...NONE, ready: false };
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
