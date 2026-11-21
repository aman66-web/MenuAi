"use client";

import { useEffect, useMemo, useState } from "react";
import { isBarcodeFile, lookupBarcode, type BarcodeFile, type BarcodeHit } from "@/lib/mm/barcodes";
import { decodeShopProducts, isShopFile, isShopManifest, type ShopFile, type ShopManifest, type ShopProduct } from "@/lib/mm/shopProducts";

// The "every product" files (public/groceries/all/<shop>.json): fetched only when someone opens that shop's full list, kept for the session;
// the service worker keeps the last copy for offline use. Nothing here is estimated: see lib/mm/shopProducts.ts.

let manifestPromise: Promise<ShopManifest> | null = null;
let barcodesPromise: Promise<BarcodeFile> | null = null;
const filePromises = new Map<string, Promise<{ file: ShopFile; products: ShopProduct[] }>>();
/** At most this many shops' decoded lists are kept (2026-11-20: all nine came to about 68 MB, and iOS can close a web view that grows): the one used longest
 *  ago is let go first and fetched again (from the browser's cache) if it is wanted later. A screen still showing a list keeps its own copy until it closes. */
export const KEEP_SHOP_LISTS = 3;

function getJson(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json() as Promise<unknown>;
  });
}

const NO_SHOPS: ShopManifest = { v: 1, retailers: [] };

/** The shops that have a full list, or a rejection when the manifest can't be fetched or isn't valid (2026-11-20: Groceries said "Not here yet: Tesco,
 *  Sainsbury's, ..." when it simply couldn't load). */
export function loadShopManifestStrict(): Promise<ShopManifest> {
  manifestPromise ??= getJson("/groceries/all/all-manifest.json")
    .then((m) => {
      if (!isShopManifest(m)) throw new Error("all-manifest.json is not valid");
      return m;
    })
    .catch((e: unknown) => {
      manifestPromise = null;
      throw e;
    });
  return manifestPromise;
}

/** The shops that have a full list. A missing or invalid manifest means "none yet" here (screens that need to tell a failure apart use loadShopManifestStrict). */
export function loadShopManifest(): Promise<ShopManifest> {
  return loadShopManifestStrict().catch(() => NO_SHOPS);
}

export function loadShopFile(id: string): Promise<{ file: ShopFile; products: ShopProduct[] }> {
  let p = filePromises.get(id);
  if (p) {
    // used again: it becomes the newest
    filePromises.delete(id);
    filePromises.set(id, p);
    return p;
  }
  p = loadShopManifest()
    .then((m) => {
      const entry = m.retailers.find((r) => r.id === id);
      if (!entry) throw new Error(`no full list for ${id}`);
      return getJson(`/groceries/all/${entry.file}`);
    })
    .then((f) => {
      if (!isShopFile(f)) throw new Error("full list is not valid");
      // the raw rows are let go once decoded: only decodeShopProducts reads them, and keeping both came to about 22 MB for nine lists (the second pass, 21
      // November 2026, Xena #35). The file kept is everything else (its name, pages, photos, schemes) with no rows.
      return { file: { ...f, products: [] }, products: decodeShopProducts(f) };
    })
    .catch((e: unknown) => {
      if (filePromises.get(id) === p) filePromises.delete(id);
      throw e;
    });
  filePromises.set(id, p);
  while (filePromises.size > KEEP_SHOP_LISTS) filePromises.delete(filePromises.keys().next().value!);
  return p;
}

/** Where every barcode is (lib/mm/barcodes.ts). */
export function loadBarcodes(): Promise<BarcodeFile> {
  barcodesPromise ??= getJson("/groceries/all/barcodes.json")
    .then((f) => {
      if (!isBarcodeFile(f)) throw new Error("barcodes.json is not valid");
      return f;
    })
    .catch((e: unknown) => {
      barcodesPromise = null;
      throw e;
    });
  return barcodesPromise;
}

/** A scanned or typed barcode looked up: the hit, null when no file holds it; rejects when the barcode file can't be loaded. */
export async function findBarcode(code: string, mine: readonly string[] = []): Promise<BarcodeHit | null> {
  return lookupBarcode(await loadBarcodes(), code, mine);
}

export type ShopManifestState = { status: "loading" } | { status: "error" } | { status: "ready"; manifest: ShopManifest };

/** Which shops have a full list, or that it couldn't be loaded; tried again when the connection comes back (the window's "online") or `retry` changes. */
export function useShopManifestState(retry = 0): ShopManifestState {
  const [state, setState] = useState<{ key: number; value: ShopManifestState } | null>(null);
  const [online, setOnline] = useState(0);
  useEffect(() => {
    const again = () => setOnline((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, []);
  const key = retry * 1000 + online;
  useEffect(() => {
    let cancelled = false;
    loadShopManifestStrict().then(
      (m) => { if (!cancelled) setState({ key, value: { status: "ready", manifest: m } }); },
      () => { if (!cancelled) setState({ key, value: { status: "error" } }); },
    );
    return () => { cancelled = true; };
  }, [key]);
  // while a retry loads, an earlier answer stays on screen (no flash of the spinner when the connection comes back)
  return state ? (state.key === key || state.value.status === "ready" ? state.value : { status: "loading" }) : { status: "loading" };
}

/** Which shops have a full list (null until known; a manifest that couldn't be loaded reads as none, as it always has for the screens that use this). */
export function useShopManifest(retry = 0): ShopManifest | null {
  const s = useShopManifestState(retry);
  return s.status === "ready" ? s.manifest : s.status === "error" ? NO_SHOPS : null;
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

export type Loaded = { file: ShopFile; products: ShopProduct[] };

/** Several shops' full lists at once (each loaded in parallel); `failed` names the ones that couldn't be. An empty `ids` is ready at once with nothing. */
export function useShopLists(ids: readonly string[], retry = 0): { status: "loading" } | { status: "ready"; loaded: Loaded[]; failed: string[] } {
  const list = ids.join(",");
  const key = `${list}|${retry}`;
  const [state, setState] = useState<{ key: string; loaded: Loaded[]; failed: string[] } | null>(null);
  useEffect(() => {
    if (!list) return;
    let cancelled = false;
    const wanted = list.split(",");
    void Promise.allSettled(wanted.map((id) => loadShopFile(id))).then((results) => {
      if (cancelled) return;
      const loaded: Loaded[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => (r.status === "fulfilled" ? loaded.push(r.value) : failed.push(wanted[i]!)));
      setState({ key, loaded, failed });
    });
    return () => { cancelled = true; };
  }, [list, key]);
  if (!list) return { status: "ready", loaded: [], failed: [] };
  return state && state.key === key ? { status: "ready", loaded: state.loaded, failed: state.failed } : { status: "loading" };
}
