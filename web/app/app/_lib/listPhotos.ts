"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { itemPhotoSources, photoSources, type GroceryFile, type PhotoSource, type ShoppingItem } from "@/lib/mm/groceries";
import { shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { loadRetailer } from "./groceries";
import { useHiddenLogos } from "./hiddenLogos";
import { loadShopFile } from "./shopProducts";

// The pictures on the shopping list (founder 2026-10-15). An item added now carries its picture (ShoppingItem.photo), so the list shows it at once and loads
// nothing. An item added before that has none, so its picture is looked up in the shop's own lists, the same ones its product page uses: a product from a
// shop's full list by the shop's id, a product from the barcode catalogue by its barcode. Only the shops that have such an item are loaded (the files are
// kept for the session and the service worker keeps them for offline use), nothing is written back to the list, and no list is read when every item
// already has its picture. A typed-in item has no picture to look up.

type Resolver = (item: ShoppingItem) => PhotoSource[];

const noZeros = (gtin: string) => gtin.replace(/^0+/, "");

function fromShopList(file: ShopFile, products: readonly ShopProduct[]): Resolver {
  const byId = new Map(products.map((p) => [p.id, p]));
  return (i) => {
    const p = i.shopId ? byId.get(i.shopId) : undefined;
    return p ? shopPhotoSources(file, p) : [];
  };
}

function fromCatalogue(file: GroceryFile): Resolver {
  const byGtin = new Map(file.products.map((p) => [noZeros(p.gtin), p]));
  return (i) => {
    const p = i.gtin ? byGtin.get(noZeros(i.gtin)) : undefined;
    return p ? photoSources(p, i.retailer) : [];
  };
}

/** Where this item's missing picture would be looked up: "shop|tesco" (a shop's full list) or "catalogue|tesco" (the barcode catalogue), or null when there is nothing to look up. */
const lookupKey = (i: ShoppingItem): string | null => (i.custom || i.photo ? null : i.shopId ? `shop|${i.retailer}` : i.gtin ? `catalogue|${i.retailer}` : null);

/** For each list item, the pictures to try in order (the shop being on the taken-down list already leaves them out). */
export function useListPhotos(list: readonly ShoppingItem[]): (item: ShoppingItem) => PhotoSource[] {
  const needs = useMemo(() => [...new Set(list.map(lookupKey).filter((k): k is string => k !== null))].sort().join(" "), [list]);
  const [resolvers, setResolvers] = useState<ReadonlyMap<string, Resolver>>(() => new Map());
  const hidden = useHiddenLogos(); // the taken-down list arrives after the page opens: re-read the pictures when it does

  useEffect(() => {
    let cancelled = false;
    for (const key of needs.split(" ").filter(Boolean)) {
      const [kind, retailer] = key.split("|") as [string, string];
      const loaded = kind === "shop" ? loadShopFile(retailer).then(({ file, products }) => fromShopList(file, products)) : loadRetailer(retailer).then(fromCatalogue);
      loaded.then(
        (resolver) => { if (!cancelled) setResolvers((prev) => (prev.has(key) ? prev : new Map(prev).set(key, resolver))); },
        () => undefined, // a list that can't be loaded just leaves those items without a picture
      );
    }
    return () => { cancelled = true; };
  }, [needs]);

  return useCallback((i: ShoppingItem) => {
    if (i.photo) return itemPhotoSources(i);
    const key = lookupKey(i);
    return key ? (resolvers.get(key)?.(i) ?? []) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `hidden` is read through isTakenDown inside the lookups: it only has to make this function new when the list changes
  }, [resolvers, hidden]);
}
