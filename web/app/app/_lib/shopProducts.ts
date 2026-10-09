"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeShopProducts, isShopFile, isShopManifest, type ShopFile, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";

// The "every product" files (public/groceries/all/<shop>.json): fetched only when someone opens that shop's full list, kept for the session;
// the service worker keeps the last copy for offline use. Nothing here is estimated: see lib/mm/shopProducts.ts.

let manifestPromise: Promise<ShopManifest> | null = null;
const filePromises = new Map<string, Promise<{ file: ShopFile; products: ShopProduct[] }>>();

function getJson(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json() as Promise<unknown>;
  });
}

/** The shops that have a full list. A missing or invalid manifest means "none yet", never an error on the Groceries screen. */
export function loadShopManifest(): Promise<ShopManifest> {
  manifestPromise ??= getJson("/groceries/all/all-manifest.json")
    .then((m) => (isShopManifest(m) ? m : ({ v: 1, retailers: [] } as ShopManifest)))
    .catch(() => {
      manifestPromise = null;
      return { v: 1, retailers: [] } as ShopManifest;
    });
  return manifestPromise;
}

export function loadShopFile(id: string): Promise<{ file: ShopFile; products: ShopProduct[] }> {
  let p = filePromises.get(id);
  if (!p) {
    p = loadShopManifest()
      .then((m) => {
        const entry = m.retailers.find((r) => r.id === id);
        if (!entry) throw new Error(`no full list for ${id}`);
        return getJson(`/groceries/all/${entry.file}`);
      })
      .then((f) => {
        if (!isShopFile(f)) throw new Error("full list is not valid");
        return { file: f, products: decodeShopProducts(f) };
      })
      .catch((e: unknown) => {
        filePromises.delete(id);
        throw e;
      });
    filePromises.set(id, p);
  }
  return p;
}

/** Which shops have a full list (null until known). */
export function useShopManifest(): ShopManifest | null {
  const [m, setM] = useState<ShopManifest | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadShopManifest().then((x) => { if (!cancelled) setM(x); });
    return () => { cancelled = true; };
  }, []);
  return m;
}

export type ShopListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; file: ShopFile; products: ShopProduct[] };

/** One shop's full list. */
export function useShopProducts(id: string | null, retry = 0): ShopListState {
  const key = `${id ?? ""}|${retry}`;
  const [state, setState] = useState<{ key: string; value: ShopListState }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadShopFile(id).then(
      (v) => { if (!cancelled) setState({ key, value: { status: "ready", ...v } }); },
      () => { if (!cancelled) setState({ key, value: { status: "error" } }); },
    );
    return () => { cancelled = true; };
  }, [id, key]);
  return useMemo(() => (id && state.key === key ? state.value : id ? { status: "loading" as const } : { status: "error" as const }), [id, key, state]);
}
