import "server-only";
import type { PipData } from "./askPipTools";
import { decodeShopProducts, isShopFile, isShopManifest, type ShopManifest, type ShopProduct } from "./mm/shopProducts";
import type { Chain } from "./mm/types";

// Ask Pip's data on the server: this website's own published files, the very files the app reads (public/menus for the restaurants, public/groceries/all for
// the supermarkets), fetched from the request's own address like Scan your food's reference dishes (lib/foodScanRefs.ts). Each is kept in this server's memory
// for a few hours (a supermarket's list is a few MB, read once); a failed read isn't kept, so the next question tries again.

const KEEP_MS = 6 * 3600_000;
/** Most menus and supermarket lists kept at once (the lists are the big ones). */
const KEEP_CHAINS = 40;
const KEEP_SHOPS = 4;

type Kept<T> = { at: number; value: Promise<T> };
const chainsKept = new Map<string, Kept<Chain | null>>();
const shopsKept = new Map<string, Kept<ShopProduct[] | null>>();
let manifestKept: Kept<Array<{ id: string; name: string; cuisine: string; file: string }>> | null = null;
let shopManifestKept: Kept<ShopManifest | null> | null = null;

async function getJson(url: string): Promise<unknown> {
  // never the platform's fetch cache (lib/foodScanRefs.ts): this module's own copy is the only one kept
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function keep<T>(map: Map<string, Kept<T>>, key: string, max: number, load: () => Promise<T>, now: number): Promise<T> {
  const k = map.get(key);
  if (k && now - k.at < KEEP_MS) return k.value;
  const value = load().catch((e: unknown) => {
    console.error("ask pip data:", e);
    if (map.get(key)?.value === value) map.delete(key);
    return null as T;
  });
  map.set(key, { at: now, value });
  while (map.size > max) map.delete(map.keys().next().value as string);
  return value;
}

export function siteData(origin: string, now = Date.now()): PipData {
  const manifest = () => {
    if (!manifestKept || now - manifestKept.at > KEEP_MS) {
      const value = getJson(`${origin}/menus/menus-manifest.json`).then((m) => {
        const chains = (m as { chains?: Array<{ id: string; name: string; cuisine: string; file: string; sample?: boolean }> }).chains ?? [];
        return chains.filter((c) => !c.sample && typeof c.id === "string" && typeof c.file === "string").map((c) => ({ id: c.id, name: c.name, cuisine: c.cuisine, file: c.file }));
      }).catch((e: unknown) => {
        console.error("ask pip menus:", e);
        if (manifestKept?.value === value) manifestKept = null;
        return [];
      });
      manifestKept = { at: now, value };
    }
    return manifestKept.value;
  };
  return {
    chains: async () => (await manifest()).map(({ id, name, cuisine }) => ({ id, name, cuisine })),
    chain: async (id) => {
      const entry = (await manifest()).find((c) => c.id === id);
      if (!entry || !/^[a-z0-9-]+\.json$/.test(entry.file.replace(/^chain-/, ""))) return null;
      return keep(chainsKept, id, KEEP_CHAINS, async () => {
        const c = (await getJson(`${origin}/menus/${entry.file}`)) as Chain;
        return c && c.id === id && Array.isArray(c.items) ? c : null;
      }, now);
    },
    shops: () => {
      if (!shopManifestKept || now - shopManifestKept.at > KEEP_MS) {
        const value = getJson(`${origin}/groceries/all/all-manifest.json`).then((m) => (isShopManifest(m) ? m : null)).catch((e: unknown) => {
          console.error("ask pip shops:", e);
          if (shopManifestKept?.value === value) shopManifestKept = null;
          return null;
        });
        shopManifestKept = { at: now, value };
      }
      return shopManifestKept.value;
    },
    products: async (shopId) => {
      const m = await siteData(origin, now).shops();
      const entry = m?.retailers.find((r) => r.id === shopId);
      if (!entry || !/^[a-z0-9-]+\.json$/.test(entry.file)) return null;
      return keep(shopsKept, shopId, KEEP_SHOPS, async () => {
        const f = await getJson(`${origin}/groceries/all/${entry.file}`);
        return isShopFile(f) ? decodeShopProducts(f) : null;
      }, now);
    },
  };
}
