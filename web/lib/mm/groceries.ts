import { normalizeForSearch } from "./search";
import type { AllergenKey } from "./types";

// Supermarket products (founder's request 2026-10-07; docs/GROCERIES_PLAN.md). The files are built by tools/groceries/build_groceries.py:
// barcode, name, brand, size and per-100 g nutrition from Open Food Facts (COMMUNITY data, not official; credited in the app), prices only
// where they were read from the retailer's own website. Pure and unit-tested; no browser APIs here.

export const RETAILERS = [
  { id: "tesco", name: "Tesco" },
  { id: "sainsburys", name: "Sainsbury's" },
  { id: "asda", name: "Asda" },
  { id: "waitrose", name: "Waitrose" },
  { id: "lidl", name: "Lidl" },
  { id: "aldi", name: "Aldi" },
] as const;
export type RetailerId = (typeof RETAILERS)[number]["id"];
export const retailerName = (id: string) => RETAILERS.find((r) => r.id === id)?.name ?? id;

export interface GroceryPrice {
  amount: number;
  url: string;
  checkedOn: string;
  perUnit?: { amount: number; unit: string };
}

export interface GroceryProduct {
  gtin: string;
  name: string;
  brand: string;
  size: string;
  per: "g" | "ml";
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  saturates?: number;
  sugars?: number;
  fibre?: number;
  salt?: number;
  kj?: number;
  serving?: { size: string; kcal: number; protein: number; carbs: number; fat: number };
  /** null = the database has no ingredients or allergen tags for this product: unknown, NOT "none". */
  allergens: { contains: AllergenKey[]; mayContain: AllergenKey[] } | null;
  image?: string;
  category: string;
  updated?: string;
  price?: GroceryPrice;
}

export interface GroceryFile {
  v: 1;
  retailer: string;
  name: string;
  generatedOn: string;
  source: string;
  products: GroceryProduct[];
}

export interface GroceryManifest {
  v: 1;
  generatedOn: string;
  source: string;
  retailers: Array<{ id: string; name: string; file: string; count: number; sha256: string }>;
  categories: Array<{ id: string; label: string }>;
}

/** A product as listed under one retailer (the same barcode can be sold by several). */
export interface ListedProduct extends GroceryProduct {
  retailers: string[];
  prices: Record<string, GroceryPrice>;
}

export function isGroceryFile(x: unknown): x is GroceryFile {
  const f = x as GroceryFile;
  return !!f && f.v === 1 && typeof f.retailer === "string" && Array.isArray(f.products);
}

/** Merge per-retailer files into one list by barcode (first file's details win; every retailer and price is kept). */
export function mergeProducts(files: readonly GroceryFile[]): ListedProduct[] {
  const byCode = new Map<string, ListedProduct>();
  for (const f of files) {
    for (const p of f.products) {
      const existing = byCode.get(p.gtin);
      if (!existing) byCode.set(p.gtin, { ...p, retailers: [f.retailer], prices: p.price ? { [f.retailer]: p.price } : {} });
      else {
        if (!existing.retailers.includes(f.retailer)) existing.retailers.push(f.retailer);
        if (p.price) existing.prices[f.retailer] = p.price;
        if (!existing.image && p.image) existing.image = p.image;
      }
    }
  }
  return [...byCode.values()];
}

const IMAGE_HOST = "https://images.openfoodfacts.org/images/products/";
/** Open Food Facts serves each photo at .100/.200/.400/.full widths. */
export function imageUrl(base: string | undefined, size: 100 | 200 | 400 | "full" = 200): string | undefined {
  return base ? `${IMAGE_HOST}${base}.${size}.jpg` : undefined;
}

/** Protein grams per 100 kcal (0 when there are no calories): same measure as the restaurant lists. */
export function proteinPer100Kcal(p: Pick<GroceryProduct, "kcal" | "protein">): number {
  return p.kcal > 0 ? (p.protein / p.kcal) * 100 : 0;
}

/** Digits of at least 8 characters: a barcode, not words. Leading zeros don't matter (EAN-13 vs the 12-digit UPC). */
export function barcodeQuery(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(d) ? d.replace(/^0+/, "") : null;
}

export type GrocerySort = "density" | "protein" | "kcal" | "name";
export const GROCERY_SORTS: ReadonlyArray<{ value: GrocerySort; label: string }> = [
  { value: "density", label: "Most protein per 100 kcal" },
  { value: "protein", label: "Most protein" },
  { value: "kcal", label: "Fewest calories" },
  { value: "name", label: "Name A to Z" },
];

export interface GroceryFilters {
  query?: string;
  retailer?: string | null;
  category?: string | null;
  priced?: boolean;
  sort?: GrocerySort;
}

const haystack = new WeakMap<object, string>();
const hay = (p: GroceryProduct) => {
  let h = haystack.get(p);
  if (h === undefined) {
    h = ` ${normalizeForSearch(`${p.name} ${p.brand}`)}`;
    haystack.set(p, h);
  }
  return h;
};

/** Search by barcode (digits) or by words (every word must start a word of the name or brand), then filter and sort. */
export function searchProducts(products: readonly ListedProduct[], f: GroceryFilters): ListedProduct[] {
  const code = f.query ? barcodeQuery(f.query) : null;
  const words = !code && f.query ? normalizeForSearch(f.query).split(" ").filter(Boolean) : [];
  let list = products.filter((p) => {
    if (f.retailer && !p.retailers.includes(f.retailer)) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.priced && Object.keys(p.prices).length === 0) return false;
    if (code) return p.gtin.replace(/^0+/, "") === code;
    return words.every((w) => hay(p).includes(` ${w}`));
  });
  const by = f.sort ?? "density";
  const name = (a: GroceryProduct, b: GroceryProduct) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  list = [...list];
  if (by === "density") list.sort((a, b) => proteinPer100Kcal(b) - proteinPer100Kcal(a) || name(a, b));
  else if (by === "protein") list.sort((a, b) => b.protein - a.protein || name(a, b));
  else if (by === "kcal") list.sort((a, b) => a.kcal - b.kcal || name(a, b));
  else list.sort(name);
  return list;
}

/** "£1.25". */
export const formatPrice = (amount: number): string => `£${amount.toFixed(2)}`;

/** "per 100 g" / "per 100 ml". */
export const perLabel = (p: Pick<GroceryProduct, "per">): string => `per 100 ${p.per}`;

/** The three-line summary used in lists: "97 kcal · 9g protein · 4.2g carbs · 5g fat". Whole grams from 10 g, one decimal below. */
export function productLine(p: Pick<GroceryProduct, "kcal" | "protein" | "carbs" | "fat">): string {
  const g = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}g`;
  return `${Math.round(p.kcal)} kcal · ${g(p.protein)} protein · ${g(p.carbs)} carbs · ${g(p.fat)} fat`;
}

// ---------------------------------------------------------------- shopping list

export interface ShoppingItem {
  gtin: string;
  retailer: string;
  name: string;
  brand: string;
  size: string;
  qty: number;
  addedAt: string;
}

export const MAX_SHOPPING_ITEMS = 200;
export const MAX_QTY = 20;

/** Adding the same barcode for the same retailer again raises its quantity. */
export function addToList(list: readonly ShoppingItem[], item: Omit<ShoppingItem, "qty" | "addedAt">, now = new Date()): ShoppingItem[] {
  const i = list.findIndex((x) => x.gtin === item.gtin && x.retailer === item.retailer);
  if (i >= 0) return list.map((x, j) => (j === i ? { ...x, qty: Math.min(MAX_QTY, x.qty + 1) } : x));
  if (list.length >= MAX_SHOPPING_ITEMS) return [...list];
  return [...list, { ...item, qty: 1, addedAt: now.toISOString() }];
}

export function setQty(list: readonly ShoppingItem[], gtin: string, retailer: string, qty: number): ShoppingItem[] {
  if (qty <= 0) return list.filter((x) => !(x.gtin === gtin && x.retailer === retailer));
  return list.map((x) => (x.gtin === gtin && x.retailer === retailer ? { ...x, qty: Math.min(MAX_QTY, Math.floor(qty)) } : x));
}

export function sanitizeShoppingList(raw: unknown): ShoppingItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ShoppingItem[] = [];
  for (const r of raw.slice(0, MAX_SHOPPING_ITEMS)) {
    const x = r as Partial<ShoppingItem>;
    if (typeof x?.gtin === "string" && /^\d{8,14}$/.test(x.gtin) && typeof x.retailer === "string" && typeof x.name === "string" && x.name.length > 0) {
      out.push({
        gtin: x.gtin, retailer: x.retailer.slice(0, 30), name: x.name.slice(0, 120), brand: typeof x.brand === "string" ? x.brand.slice(0, 80) : "",
        size: typeof x.size === "string" ? x.size.slice(0, 40) : "", qty: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(x.qty) || 1))),
        addedAt: typeof x.addedAt === "string" ? x.addedAt : new Date(0).toISOString(),
      });
    }
  }
  return out;
}

/** Plain text for sharing or pasting into notes, grouped by retailer: "Aldi\n- 2 x Greek yogurt 500 g (5012345678900)". */
export function listAsText(list: readonly ShoppingItem[]): string {
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of list) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);
  return [...groups.entries()].map(([r, items]) => `${retailerName(r)}\n${items.map((i) => `- ${i.qty} x ${i.name}${i.size ? ` ${i.size}` : ""} (${i.gtin})`).join("\n")}`).join("\n\n");
}
