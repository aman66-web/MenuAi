"use client";

import { useEffect, useState } from "react";
import { loggableFromListed, loggableFromOff, loggableFromShop, type LoggableProduct } from "@/lib/mm/addFood";
import { hasLabel, offAnswerFrom, type OffProduct } from "@/lib/mm/barcodes";
import { API_BASE } from "@/lib/mm/config";
import { mergeProducts } from "@/lib/mm/groceries";
import { loadRetailer } from "../../_lib/groceries";
import { findBarcode, loadShopFile } from "../../_lib/shopProducts";

// A scanned or typed barcode, found (founder 2026-11-20: "when they scan a barcode of a product, it needs to come up with the product and they can input in and it's
// their food thing"): our own shop lists first (a shop's own label always wins), then the older barcode catalogue, and only for a barcode neither holds, Open Food
// Facts through our own API (GET /api/v1/barcode/{code}; the phone never talks to it directly). Community numbers are said so on screen.

/**
 * The products a barcode opens from our own files, best first (the person's own shops first): every shop list row with numbers for it; for a barcode no shop list
 * holds, the older catalogue's record (community numbers, said so), with only the catalogue files that hold it loaded. Empty when we have no numbers for it.
 */
export async function productsForBarcode(code: string, mine: readonly string[]): Promise<LoggableProduct[]> {
  const hit = await findBarcode(code, mine);
  if (!hit) return [];
  const rows = hit.shops.filter(hasLabel);
  if (rows.length > 0) {
    const shops = [...new Set(rows.map((h) => h.shop))];
    const lists = await Promise.allSettled(shops.map((s) => loadShopFile(s)));
    const out: LoggableProduct[] = [];
    for (const h of rows) {
      const got = lists[shops.indexOf(h.shop)];
      if (got?.status !== "fulfilled") continue;
      const p = got.value.products.find((x) => x.id === h.id);
      const l = p ? loggableFromShop(got.value.file, p) : null;
      if (l && !out.some((x) => x.key === l.key)) out.push(l);
    }
    if (out.length === 0 && lists.every((x) => x.status === "rejected")) throw new Error("the shop lists couldn't be loaded");
    return out.map((l) => ({ ...l, code }));
  }
  if (hit.shops.length > 0 || hit.catalogue.length === 0) return [];
  const loaded = await Promise.allSettled(hit.catalogue.map((r) => loadRetailer(r)));
  const files = loaded.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
  if (files.length === 0) throw new Error("the catalogue couldn't be loaded");
  const found = mergeProducts(files).find((p) => p.gtin.replace(/^0+/, "") === hit.code);
  return found ? [loggableFromListed(found, hit.catalogue.find((r) => mine.includes(r)) ?? hit.catalogue[0] ?? null)] : [];
}

/** Open Food Facts' record for a barcode, through our API: the product (with or without figures we'd add), null when it has none, and a throw when it can't be asked. */
export async function askOpenFoodFacts(digits: string): Promise<OffProduct | null> {
  const res = await fetch(`${API_BASE}barcode/${digits}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`barcode lookup: ${res.status}`);
  const answer = offAnswerFrom(await res.json(), digits);
  if (!answer) throw new Error("barcode lookup: not an answer");
  return answer.found ? answer.product : null;
}

export type BarcodeLookup =
  | { status: "loading" }
  /** Products with figures to add, best first: ours, or the one Open Food Facts has. */
  | { status: "found"; products: LoggableProduct[] }
  /** Nobody has figures for it; `name` is Open Food Facts' name for it where it knows the product (the typed entry starts with it), else "". */
  | { status: "missing"; name: string }
  /** It couldn't be looked up (no connection). */
  | { status: "error" };

/** Everything we can find for a barcode's digits (leading zeros kept), in the order above. `unnamed`: the name for an Open Food Facts record with none. */
export async function lookupBarcodeEverywhere(digits: string, mine: readonly string[], unnamed: string): Promise<BarcodeLookup> {
  try {
    const ours = await productsForBarcode(digits, mine);
    if (ours.length > 0) return { status: "found", products: ours };
  } catch {
    // our files couldn't load: Open Food Facts may still answer
  }
  try {
    const off = await askOpenFoodFacts(digits);
    const product = off ? loggableFromOff(off, unnamed) : null;
    return product ? { status: "found", products: [product] } : { status: "missing", name: off?.name ?? "" };
  } catch {
    return { status: "error" };
  }
}

/** The lookup for a barcode's digits (null: none yet), asked once per digits and `retry`. */
export function useBarcodeLookup(digits: string | null, mine: readonly string[], unnamed: string, retry = 0): BarcodeLookup | null {
  const mineKey = mine.join(",");
  const key = digits ? `${digits}|${mineKey}|${retry}` : null;
  const [got, setGot] = useState<{ key: string; value: BarcodeLookup } | null>(null);
  useEffect(() => {
    if (!key || !digits) return;
    let live = true;
    lookupBarcodeEverywhere(digits, mineKey ? mineKey.split(",") : [], unnamed).then((value) => { if (live) setGot({ key, value }); });
    return () => { live = false; };
  }, [key, digits, mineKey, unnamed]);
  if (!key) return null;
  return got?.key === key ? got.value : { status: "loading" };
}
