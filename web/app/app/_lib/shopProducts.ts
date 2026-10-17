"use client";

import { useEffect, useMemo, useState } from "react";
import { withoutRestricted } from "@/lib/mm/crossShop";
import { webCryptoSha256 } from "@/lib/mm/menu-client";
import { decodeShopProducts, isShopFile, isShopManifest, recipeListOf, type ShopFile, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";

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

// ---- the recipe lists: another supermarket's products for a recipe's ingredients (public/groceries/recipe/<shop>.json; lib/mm/shopProducts.ts recipeListOf)

const recipePromises = new Map<string, Promise<{ file: ShopFile; products: ShopProduct[] }>>();
// what has arrived, so a screen can read a shop's list the moment it renders (the arrays are the very ones the promises gave: same identity every time)
const recipeLoaded = new Map<string, { file: ShopFile; products: ShopProduct[] }>();

/** A shop's list of the products a recipe could use there (cached per shop for the session; the service worker keeps the last copy for offline). The file is checked against
 *  the manifest's SHA-256 (a manifest and a file from two different deploys are never mixed: the manifest is fetched again once, then the load fails and can be retried). Fails
 *  for a shop with no such list, a file that isn't a valid list, or one that is not that shop's. */
export function loadRecipeFile(id: string): Promise<{ file: ShopFile; products: ShopProduct[] }> {
  let p = recipePromises.get(id);
  if (!p) {
    p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const m = await loadShopManifest();
        const entry = m.retailers.find((r) => r.id === id);
        const list = entry ? recipeListOf(entry) : null;
        if (!list) throw new Error(`no recipe list for ${id}`);
        const res = await fetch(list.path);
        if (!res.ok) throw new Error(`${list.path}: ${res.status}`);
        const bytes = await res.arrayBuffer();
        const digest = typeof crypto === "undefined" || !crypto.subtle ? null : await webCryptoSha256(bytes).catch(() => null); // an insecure origin can't hash: verification is skipped there
        if (digest !== null && digest !== list.sha256) {
          if (attempt === 0) { manifestPromise = null; continue; }
          throw new Error(`${list.path} does not match the manifest`);
        }
        const f: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!isShopFile(f) || f.retailer !== id) throw new Error("recipe list is not valid");
        const decoded = decodeShopProducts(f);
        const loaded = { file: f, products: list.kind === "recipe" ? withoutRestricted(decoded) : decoded }; // a recipe list borrows numbers by barcode: never by a shop-internal one
        recipeLoaded.set(id, loaded);
        return loaded;
      }
      throw new Error("unreachable");
    })().catch((e: unknown) => {
      recipePromises.delete(id);
      throw e;
    });
    recipePromises.set(id, p);
  }
  return p;
}

export interface OtherShopsState {
  /** Shop id → its products, for the shops loaded so far, in the order of the ids asked for. A new Map whenever another shop arrives; the arrays inside never change (the engine
   *  caches which products fit a kind per array). */
  lists: ReadonlyMap<string, readonly ShopProduct[]>;
  /** Shop id → its file (name, date checked, picture and page addresses), for the same shops. */
  files: ReadonlyMap<string, ShopFile>;
  /** Shops still on their way. */
  loading: readonly string[];
  /** Shops that could not be loaded: ask again by passing a new `retry`. The others are unaffected. */
  failed: readonly string[];
}

const NONE: OtherShopsState = { lists: new Map(), files: new Map(), loading: [], failed: [] };

/**
 * Loads these shops' recipe lists (in parallel, each cached for the session) and reports them as they arrive; a shop loaded earlier is there on the first render. One shop
 * failing leaves the others as they are; bumping `retry` asks for the failed ones again. Pass the same ids in the same order to get the same answer; none loads nothing.
 */
export function useOtherShops(ids: readonly string[], retry = 0): OtherShopsState {
  const key = `${ids.join(",")}|${retry}`;
  const [seen, setSeen] = useState<{ key: string; done: string[]; failed: string[] }>({ key: "", done: [], failed: [] });
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    const update = (fn: (s: { key: string; done: string[]; failed: string[] }) => { done: string[]; failed: string[] }) => { if (!cancelled) setSeen((s) => ({ key, ...fn(s.key === key ? s : { key, done: [], failed: [] }) })); };
    for (const id of ids) {
      loadRecipeFile(id).then(
        () => update((s) => ({ done: s.done.includes(id) ? s.done : [...s.done, id], failed: s.failed.filter((x) => x !== id) })),
        () => update((s) => ({ done: s.done, failed: s.failed.includes(id) ? s.failed : [...s.failed, id] })),
      );
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids is summarised by key
  }, [key]);
  return useMemo(() => {
    if (ids.length === 0) return NONE;
    const failedNow = seen.key === key ? seen.failed : [];
    const lists = new Map<string, readonly ShopProduct[]>();
    const files = new Map<string, ShopFile>();
    for (const id of ids) {
      const v = recipeLoaded.get(id);
      if (v) { lists.set(id, v.products); files.set(id, v.file); }
    }
    return { lists, files, loading: ids.filter((id) => !lists.has(id) && !failedNow.includes(id)), failed: ids.filter((id) => !lists.has(id) && failedNow.includes(id)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids is summarised by key
  }, [seen, key]);
}

/** Which shops have a full list (null until known). */
export function useShopManifest(retry = 0): ShopManifest | null {
  const [m, setM] = useState<ShopManifest | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadShopManifest().then((x) => { if (!cancelled) setM(x); });
    return () => { cancelled = true; };
  }, [retry]);
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
