"use client";

import type { CompareItem } from "@/lib/mm/compare";
import { photoSources, retailerName, type GroceryProduct, type ListedProduct } from "@/lib/mm/groceries";
import { itemImageUrl } from "@/lib/mm/images";
import { shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { itemHref } from "@/lib/mm/routes";
import type { Chain, MenuItem } from "@/lib/mm/types";

// What goes into the compare list: a copy of the figures the screen shows for a product or dish (lib/mm/compare.ts).

const now = () => new Date().toISOString();
const opt = (v: number | null | undefined) => (typeof v === "number" ? v : null);

/** A product from the barcode catalogue, as one shop's own record of it (the shop asked for when it sells it, else the first that does). */
export function compareFoodFromListed(p: ListedProduct, prefer?: string | null): CompareItem {
  const shop = prefer && p.retailers.includes(prefer) ? prefer : (p.retailers[0] ?? "");
  const rec: GroceryProduct = p.byRetailer[shop] ?? p;
  const price = p.prices[shop];
  const photo = photoSources(p, shop)[0]?.src;
  return {
    key: `food:gtin:${p.gtin.replace(/^0+/, "")}`,
    kind: "food",
    name: rec.name,
    from: retailerName(shop) || shop,
    fromId: shop,
    href: `/app/groceries/product?code=${p.gtin}${shop ? `&r=${shop}` : ""}`,
    basis: rec.per,
    numbers: { kcal: rec.kcal, protein: rec.protein, carbs: rec.carbs, sugars: opt(rec.sugars), fat: rec.fat, saturates: opt(rec.saturates), fibre: opt(rec.fibre), salt: opt(rec.salt) },
    source: rec.source === "retailer" ? "label" : "community",
    addedAt: now(),
    ...(photo ? { photo } : {}),
    ...(price ? { price: price.amount } : {}),
    ...(price?.perUnit ? { unitPrice: price.perUnit.amount, unit: price.perUnit.unit } : {}),
  };
}

/** A product from a shop's full list whose own page we have read (its label's numbers). Null when there are no numbers to compare. */
export function compareFoodFromShop(f: ShopFile, p: ShopProduct): CompareItem | null {
  const n = p.nutrition;
  if (!n) return null;
  const photo = shopPhotoSources(f, p)[0]?.src;
  return {
    key: `food:${f.retailer}:${p.id}`,
    kind: "food",
    name: p.name,
    from: f.name,
    fromId: f.retailer,
    href: `/app/groceries/shop/item?r=${f.retailer}&id=${encodeURIComponent(p.id)}`,
    basis: n.per,
    numbers: { kcal: n.kcal, protein: n.protein, carbs: n.carbs, sugars: n.sugars, fat: n.fat, saturates: n.saturates, fibre: n.fibre, salt: n.salt },
    source: "label",
    addedAt: now(),
    ...(n.state ? { note: n.state } : {}),
    ...(photo ? { photo } : {}),
    ...(p.price !== null ? { price: p.price } : {}),
    ...(p.price !== null && p.unitPrice !== null && p.unit ? { unitPrice: p.unitPrice, unit: p.unit } : {}),
  };
}

/** A restaurant dish, per serving as the restaurant publishes it. */
export function compareDish(chain: Pick<Chain, "id" | "name">, item: MenuItem): CompareItem {
  const n = item.nutrients;
  const photo = itemImageUrl(item.image);
  return {
    key: `dish:${chain.id}:${item.id}`,
    kind: "dish",
    name: item.name,
    from: chain.name,
    fromId: chain.id,
    href: itemHref(chain.id, item.id),
    basis: "serving",
    numbers: { kcal: n.calories, protein: opt(n.protein), carbs: opt(n.carbs), sugars: opt(n.sugar), fat: opt(n.fat), saturates: opt(n.saturatedFat), fibre: opt(n.fiber), salt: opt(n.salt) },
    source: "restaurant",
    addedAt: now(),
    ...(item.serving ? { note: item.serving.slice(0, 60) } : {}),
    ...(photo ? { photo } : {}),
  };
}
