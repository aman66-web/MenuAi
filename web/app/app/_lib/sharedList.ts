"use client";

import { useEffect, useState } from "react";
import { customItem, photoSources, withPhoto, type ShoppingItem } from "@/lib/mm/groceries";
import { shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import type { SharedEntry } from "@/lib/mm/shareList";
import { loadRetailer } from "./groceries";
import { loadShopFile, loadShopManifest } from "./shopProducts";

// A shared shopping list read back (founder 2026-10-15). The link carries only references (lib/mm/shareList.ts); the names, pictures and prices come from
// the shop's own list here, the same one the product pages use, so the person sees today's. An entry whose product is no longer in the list is counted, not guessed.

export type SharedListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: ShoppingItem[]; missing: number };

type Resolved = Omit<ShoppingItem, "addedAt">;

const noZeros = (gtin: string) => gtin.replace(/^0+/, "");

/** A shop that has no list of that kind at all (Co-op, say) is "not found"; a list that couldn't be loaded is an error to try again, not a missing product. */
function noList(e: unknown): null {
  if (/^no (full list|products) for /.test(String((e as Error)?.message))) return null;
  throw e;
}

type ShopList = { file: ShopFile; byId: Map<string, ShopProduct> };
type Catalogue = Map<string, Omit<Resolved, "qty">>;

/** Every entry as a list item, in the order they were shared, and how many couldn't be found. Needs each shop's list once, kept for the session. */
export async function resolveEntries(entries: readonly SharedEntry[]): Promise<{ items: Resolved[]; missing: number }> {
  const shopLists = new Map<string, Promise<ShopList | null>>();
  const catalogues = new Map<string, Promise<Catalogue | null>>();
  const shopList = (retailer: string) => {
    let p = shopLists.get(retailer);
    // loadShopManifest answers "no shops" when the manifest can't be fetched (right for the Groceries screen); here that must be an error to try again,
    // not "none of these products exist any more".
    const load = () => loadShopManifest().then((m) => {
      if (m.retailers.length === 0) throw new Error("the shops' lists could not be loaded");
      return loadShopFile(retailer);
    });
    if (!p) shopLists.set(retailer, (p = load().then(({ file, products }) => ({ file, byId: new Map(products.map((x) => [x.id, x])) })).catch(noList)));
    return p;
  };
  const catalogue = (retailer: string) => {
    let p = catalogues.get(retailer);
    if (!p) catalogues.set(retailer, (p = loadRetailer(retailer).then((f) => new Map(f.products.map((x) => [noZeros(x.gtin), catalogueItem(retailer, x)]))).catch(noList)));
    return p;
  };

  const items: Resolved[] = [];
  let missing = 0;
  for (const e of entries) {
    if (e.kind === "typed") {
      const typed = customItem(e.code);
      if (typed) items.push({ ...typed, qty: e.qty });
      else missing++;
    } else if (e.kind === "shop") {
      const list = await shopList(e.retailer);
      const product = list?.byId.get(e.code);
      if (!list || !product) { missing++; continue; }
      items.push({ gtin: product.gtin, shopId: product.id, retailer: e.retailer, name: product.name, brand: "", size: "", qty: e.qty, ...(product.price !== null ? { price: product.price } : {}), checkedOn: list.file.checkedOn, ...withPhoto(shopPhotoSources(list.file, product)) });
    } else {
      const found = (await catalogue(e.retailer))?.get(noZeros(e.code));
      if (!found) { missing++; continue; }
      items.push({ ...found, qty: e.qty });
    }
  }
  return { items, missing };
}

function catalogueItem(retailer: string, p: Parameters<typeof photoSources>[0] & { gtin: string; name: string; brand: string; size: string }): Omit<Resolved, "qty"> {
  return { gtin: p.gtin, retailer, name: p.name, brand: p.brand, size: p.size, ...withPhoto(photoSources(p, retailer)) };
}

/** The shared entries as list items, once their shops' lists have loaded (undefined entries = still waiting for a link to be read). */
export function useSharedList(entries: readonly SharedEntry[] | null, retry = 0): SharedListState {
  const [state, setState] = useState<{ key: string; value: SharedListState }>({ key: "", value: { status: "loading" } });
  const key = entries ? `${retry}|${JSON.stringify(entries)}` : "";
  useEffect(() => {
    if (!entries) return;
    let cancelled = false;
    resolveEntries(entries).then(
      ({ items, missing }) => { if (!cancelled) setState({ key, value: { status: "ready", items: items.map((i) => ({ ...i, addedAt: new Date().toISOString() })), missing } }); },
      () => { if (!cancelled) setState({ key, value: { status: "error" } }); },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the entries
  }, [key]);
  return entries && state.key === key ? state.value : { status: "loading" };
}
