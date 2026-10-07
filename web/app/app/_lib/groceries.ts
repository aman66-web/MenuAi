"use client";

import { useEffect, useMemo, useState } from "react";
import { isGroceryFile, mergeProducts, RETAILERS, type GroceryFile, type GroceryManifest, type ListedProduct } from "@/lib/mm/groceries";

// Product files are static (public/groceries/<retailer>.json), fetched when needed and kept for the session; the service worker keeps
// the last copy for offline use. Opening the Groceries screen loads only the manifest plus the retailer(s) being looked at.

let manifestPromise: Promise<GroceryManifest> | null = null;
const filePromises = new Map<string, Promise<GroceryFile>>();

function getJson(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json() as Promise<unknown>;
  });
}

export function loadManifest(): Promise<GroceryManifest> {
  manifestPromise ??= getJson("/groceries/groceries-manifest.json")
    .then((m) => {
      const x = m as GroceryManifest;
      if (!x || x.v !== 1 || !Array.isArray(x.retailers)) throw new Error("groceries manifest is not valid");
      return x;
    })
    .catch((e: unknown) => {
      manifestPromise = null;
      throw e;
    });
  return manifestPromise;
}

export function loadRetailer(id: string): Promise<GroceryFile> {
  let p = filePromises.get(id);
  if (!p) {
    p = loadManifest()
      .then((m) => {
        const entry = m.retailers.find((r) => r.id === id);
        if (!entry) throw new Error(`no products for ${id}`);
        return getJson(`/groceries/${entry.file}`);
      })
      .then((f) => {
        if (!isGroceryFile(f)) throw new Error("groceries file is not valid");
        return f;
      })
      .catch((e: unknown) => {
        filePromises.delete(id);
        throw e;
      });
    filePromises.set(id, p);
  }
  return p;
}

export type CatalogueState =
  | { status: "loading"; products: ListedProduct[]; manifest: GroceryManifest | null }
  | { status: "ready"; products: ListedProduct[]; manifest: GroceryManifest }
  | { status: "error"; products: ListedProduct[]; manifest: GroceryManifest | null };

/** The products of one retailer, or of all of them (retailer = null), merged by barcode. */
export function useGroceryCatalogue(retailer: string | null, retry = 0): CatalogueState {
  const [state, setState] = useState<{ key: string; files: GroceryFile[]; manifest: GroceryManifest | null; error: boolean }>({ key: "", files: [], manifest: null, error: false });
  const key = `${retailer ?? "*"}|${retry}`;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const manifest = await loadManifest();
        const ids = retailer ? [retailer] : RETAILERS.map((r) => r.id).filter((id) => manifest.retailers.some((m) => m.id === id));
        const files = await Promise.all(ids.map(loadRetailer));
        if (!cancelled) setState({ key, files, manifest, error: false });
      } catch {
        if (!cancelled) setState((s) => ({ key, files: [], manifest: s.manifest, error: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, retailer]);
  const products = useMemo(() => (state.key === key ? mergeProducts(state.files) : []), [state, key]);
  if (state.key !== key) return { status: "loading", products: [], manifest: state.manifest };
  if (state.error || !state.manifest) return { status: "error", products: [], manifest: state.manifest };
  return { status: "ready", products, manifest: state.manifest };
}
