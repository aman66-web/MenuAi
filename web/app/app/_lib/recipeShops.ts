"use client";

import { useEffect, useMemo, useState } from "react";
import { RECIPE_COMMUNITY_NUMBERS_ENABLED, RECIPES_ANY_SHOP_ENABLED } from "@/lib/mm/config";
import { noZeros, withCommunityNumbers, type CommunityRecord } from "@/lib/mm/recipeShops";
import { recipeShops, type ShopFile, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";
import { loadManifest, loadRetailer } from "./groceries";
import { loadShopFile, useShopProducts, type ShopListState } from "./shopProducts";

// Recipes from any supermarket (RECIPES_ANY_SHOP_ENABLED; lib/mm/recipeShops.ts has the rules). The shop a recipe page or the Recipes list opens on, that shop's
// products for recipes (with community numbers only when RECIPE_COMMUNITY_NUMBERS_ENABLED), and other shops' lists for the Swap.

const NO_CATALOGUE: ReadonlyMap<string, CommunityRecord> = new Map();

/**
 * The shop recipes open on. With RECIPES_ANY_SHOP_ENABLED off: only shops whose labels we've read (lib: recipeShops), as before. On: any shop with a full list, so a
 * person who chose Tesco sees Tesco's recipes (or what is missing there): the one asked for, else the first of their supermarkets, else the first that has labels.
 */
export function recipeShopAny(manifest: ShopManifest | null, asked: string | null, mine: readonly string[] | undefined): string | null {
  if (!manifest) return null;
  const labelled = recipeShops(manifest);
  const any = RECIPES_ANY_SHOP_ENABLED ? manifest.retailers : labelled;
  const has = (id: string | null | undefined): id is string => !!id && any.some((r) => r.id === id);
  if (has(asked)) return asked;
  return mine?.find((id) => has(id)) ?? labelled[0]?.id ?? any[0]?.id ?? null;
}

/** The shops the Recipes list offers: with RECIPES_ANY_SHOP_ENABLED on, the person's own supermarkets that have a full list (or the shops with labels when they chose none). */
export function recipeShopChoices(manifest: ShopManifest | null, mine: readonly string[] | undefined): ShopManifest["retailers"] {
  if (!manifest) return [];
  if (!RECIPES_ANY_SHOP_ENABLED) return recipeShops(manifest);
  const chosen = (mine ?? []).map((id) => manifest.retailers.find((r) => r.id === id)).filter((r): r is ShopManifest["retailers"][number] => !!r);
  return chosen.length ? chosen : recipeShops(manifest);
}

/** The shop's barcode catalogue (Open Food Facts contributors) by barcode, only when RECIPE_COMMUNITY_NUMBERS_ENABLED; empty otherwise or while loading. */
export function useCommunityCatalogue(shop: string | null): ReadonlyMap<string, CommunityRecord> {
  const [byCode, setByCode] = useState<{ shop: string; map: ReadonlyMap<string, CommunityRecord> } | null>(null);
  useEffect(() => {
    if (!RECIPE_COMMUNITY_NUMBERS_ENABLED || !shop) return;
    let cancelled = false;
    loadManifest()
      .then((m) => (m.retailers.some((r) => r.id === shop && r.count > 0) ? loadRetailer(shop) : null))
      .then((f) => { if (!cancelled && f) setByCode({ shop, map: new Map(f.products.map((p) => [noZeros(p.gtin), p])) }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [shop]);
  return byCode && byCode.shop === shop ? byCode.map : NO_CATALOGUE;
}

/** A shop's products for recipes: its full list, with community numbers added when RECIPE_COMMUNITY_NUMBERS_ENABLED (never otherwise). */
export function useRecipeProducts(shop: string | null, retry = 0): ShopListState {
  const state = useShopProducts(shop, retry);
  const catalogue = useCommunityCatalogue(shop);
  return useMemo(() => (state.status === "ready" && catalogue.size > 0 ? { ...state, products: withCommunityNumbers(state.products, catalogue) } : state), [state, catalogue]);
}

export type OtherListsState = { status: "loading" } | { status: "error" } | { status: "ready"; lists: Array<{ shop: string; file: ShopFile; products: ShopProduct[] }> };

/** Other supermarkets' lists for a Swap (loaded only when asked: each is up to a few MB). Community numbers are added the same way when that switch is on. */
export function useOtherShopLists(shops: readonly string[], retry = 0): OtherListsState {
  const key = `${shops.join(",")}|${retry}`;
  const [state, setState] = useState<{ key: string; value: OtherListsState }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!shops.length) return;
    let cancelled = false;
    Promise.all(
      shops.map(async (shop) => {
        const { file, products } = await loadShopFile(shop);
        if (!RECIPE_COMMUNITY_NUMBERS_ENABLED) return { shop, file, products };
        const catalogue = await loadManifest()
          .then((m) => (m.retailers.some((r) => r.id === shop && r.count > 0) ? loadRetailer(shop) : null))
          .then((f) => (f ? new Map(f.products.map((p) => [noZeros(p.gtin), p as CommunityRecord])) : NO_CATALOGUE))
          .catch(() => NO_CATALOGUE);
        return { shop, file, products: withCommunityNumbers(products, catalogue) };
      }),
    ).then(
      (lists) => { if (!cancelled) setState({ key, value: { status: "ready", lists } }); },
      () => { if (!cancelled) setState({ key, value: { status: "error" } }); },
    );
    return () => { cancelled = true; };
    // `key` carries the shops and the retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.value : { status: "loading" };
}
