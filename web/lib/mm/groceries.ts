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
  { id: "morrisons", name: "Morrisons" },
  { id: "coop", name: "Co-op" },
  { id: "marks-and-spencer", name: "M&S" },
  { id: "iceland", name: "Iceland" },
  { id: "ocado", name: "Ocado" },
] as const;
export type RetailerId = (typeof RETAILERS)[number]["id"];
export const retailerName = (id: string) => RETAILERS.find((r) => r.id === id)?.name ?? id;

export interface GroceryPrice {
  /** The regular shelf price (before any loyalty-card price). */
  amount: number;
  url: string;
  checkedOn: string;
  perUnit?: { amount: number; unit: string };
  /** The loyalty-card price shown beside it ("Clubcard Price", "Nectar Price"): lower than `amount`, needs the shop's card. */
  member?: { amount: number; scheme: string; ends?: string };
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
  /** The database's most specific category ("semi-skimmed-milks"): what "similar products" means for the price rating. */
  type?: string;
  updated?: string;
  price?: GroceryPrice;
  // Read from the supermarket's own product page (docs/GROCERIES_PLAN.md), copied as printed; present only where that was done.
  ingredients?: string;
  /** The shop's own allergy wording ("may contain nuts"). */
  advice?: string;
  /** Every other row of the shop's nutrition table, "Label: value; Label: value". */
  other?: string;
  /** The per-portion column as printed, "Label: value; ...". */
  portion?: string;
  /** The numbers above are the shop's own (not Open Food Facts'). */
  source?: "retailer";
  inStock?: boolean;
  /** The product page those details came from, and when. */
  pageUrl?: string;
  checkedOn?: string;
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
  /** Each supermarket's own record of the product (its exact name, size, numbers and details). */
  byRetailer: Record<string, GroceryProduct>;
}

export function isGroceryFile(x: unknown): x is GroceryFile {
  const f = x as GroceryFile;
  return !!f && f.v === 1 && typeof f.retailer === "string" && Array.isArray(f.products);
}

/** Merge per-retailer files into one list by barcode (first file's details are the default; every retailer's own record and price is kept). */
export function mergeProducts(files: readonly GroceryFile[]): ListedProduct[] {
  const byCode = new Map<string, ListedProduct>();
  for (const f of files) {
    for (const p of f.products) {
      const existing = byCode.get(p.gtin);
      if (!existing) byCode.set(p.gtin, { ...p, retailers: [f.retailer], prices: p.price ? { [f.retailer]: p.price } : {}, byRetailer: { [f.retailer]: p } });
      else {
        if (!existing.retailers.includes(f.retailer)) existing.retailers.push(f.retailer);
        if (p.price) existing.prices[f.retailer] = p.price;
        existing.byRetailer[f.retailer] = p;
        if (!existing.image && p.image) existing.image = p.image;
        if (!existing.type && p.type) existing.type = p.type;
      }
    }
  }
  return [...byCode.values()];
}

/** The product as one supermarket lists it (its own name, size, numbers and details); the shared prices and retailers are kept. */
export function forRetailer(p: ListedProduct, retailer: string | null | undefined): ListedProduct {
  const own = retailer ? p.byRetailer[retailer] : undefined;
  if (!own) return p;
  return { ...p, ...own, image: own.image ?? p.image, type: own.type ?? p.type, retailers: p.retailers, prices: p.prices, byRetailer: p.byRetailer };
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
    const names = "byRetailer" in p ? Object.values((p as ListedProduct).byRetailer).map((x) => x.name).join(" ") : "";
    h = ` ${normalizeForSearch(`${p.name} ${names} ${p.brand}`)}`;
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

// ---------------------------------------------------------------- sizes, unit prices and the price rating

/** A pack size in grams or millilitres: "400g", "1.5 kg", "2 L", "4 x 125g", "6 x 330ml". null when it isn't a weight or a volume ("6 pack"). */
export function sizeAmount(size: string): { amount: number; unit: "g" | "ml" } | null {
  const m = /(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l|ltr|litres?|liters?)\b/i.exec(size.replace(/,/g, ""));
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const n = Number(m[2]) * count;
  const u = m[3].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return null;
  if (u === "kg") return { amount: n * 1000, unit: "g" };
  if (u === "g") return { amount: n, unit: "g" };
  if (u === "ml") return { amount: n, unit: "ml" };
  if (u === "cl") return { amount: n * 10, unit: "ml" };
  return { amount: n * 1000, unit: "ml" };
}

const SIZE_TOKENS = /\b\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:kg|g|ml|cl|l|ltr|litres?|liters?|pack|pk|pints?|oz)\b/gi;

/** Same product in different sizes shares this key: brand and name with the size words and a leading count ("6 Crumpets") taken out. */
export function familyKey(p: Pick<GroceryProduct, "brand" | "name">): string {
  const name = p.name.toLowerCase().replace(SIZE_TOKENS, " ").replace(/^\s*\d+\s+(?=[a-z])/, "");
  return normalizeForSearch(`${p.brand} ${name}`).replace(/\s+/g, " ").trim();
}

/** The other sizes of this product (including itself), smallest first. Empty when it comes in one size only. */
export function sizeVariants(all: readonly ListedProduct[], p: ListedProduct): ListedProduct[] {
  const key = familyKey(p);
  if (!key) return [];
  const same = all.filter((x) => familyKey(x) === key);
  if (same.length < 2) return [];
  const amount = (x: ListedProduct) => sizeAmount(x.size)?.amount ?? Number.POSITIVE_INFINITY;
  return same.sort((a, b) => amount(a) - amount(b) || a.gtin.localeCompare(b.gtin));
}

/** Price per kilogram or per litre, from the shop's own unit price when it gave one, otherwise from the price and the pack size. */
export function unitPrice(price: GroceryPrice, p: Pick<GroceryProduct, "size" | "per">): { amount: number; unit: "kg" | "l" } | null {
  const u = price.perUnit;
  if (u && u.amount > 0 && !/dr\.?\s*wt|drain/i.test(u.unit)) {
    const t = u.unit.toLowerCase().replace(/\s+/g, " ");
    if (/\b(kg|kilo)/.test(t)) return { amount: u.amount, unit: "kg" };
    if (/100\s?g\b/.test(t)) return { amount: u.amount * 10, unit: "kg" };
    if (/100\s?ml\b/.test(t)) return { amount: u.amount * 10, unit: "l" };
    if (/\b(litre|liter|ltr)\b|\bl\b/.test(t)) return { amount: u.amount, unit: "l" };
  }
  const s = sizeAmount(p.size);
  if (!s || price.amount <= 0) return null;
  return { amount: price.amount / (s.amount / 1000), unit: s.unit === "g" ? "kg" : "l" };
}

export interface PriceRating {
  /** Products compared (not counting this one). */
  n: number;
  /** Share of the others that cost MORE per kg or litre, 0-100. */
  cheaperThanPct: number;
  band: "lower" | "middle" | "higher";
  unit: "kg" | "l";
  mine: number;
  median: number;
  /** Grams of protein per £1 spent (from the price per kg/litre and the protein per 100 g/ml). */
  proteinPerPound: number;
}

export const MIN_RATING_PEERS = 5;

/**
 * Where this product's price per kg/litre sits among similar products (same database category, same unit), using each one's cheapest
 * price. About PRICE only: it says nothing about whether a food is good or bad for anyone. null until at least MIN_RATING_PEERS others
 * have a price.
 */
export function priceRating(all: readonly ListedProduct[], p: ListedProduct, retailer?: string | null): PriceRating | null {
  if (!p.type) return null;
  const best = (x: ListedProduct): { amount: number; unit: "kg" | "l" } | null => {
    let out: { amount: number; unit: "kg" | "l" } | null = null;
    for (const [r, price] of Object.entries(x.prices)) {
      const own = x.byRetailer[r] ?? x;
      const up = unitPrice(price, own);
      if (up && (!out || up.amount < out.amount)) out = up;
    }
    return out;
  };
  let mineP: { amount: number; unit: "kg" | "l" } | null = null;
  const chosen = retailer ? p.prices[retailer] : undefined;
  if (chosen) mineP = unitPrice(chosen, p.byRetailer[retailer as string] ?? p);
  mineP ??= best(p);
  if (!mineP) return null;
  const peers: number[] = [];
  for (const x of all) {
    if (x.gtin === p.gtin || x.type !== p.type || familyKey(x) === familyKey(p)) continue;
    const b = best(x);
    if (b && b.unit === mineP.unit) peers.push(b.amount);
  }
  if (peers.length < MIN_RATING_PEERS) return null;
  peers.sort((a, b) => a - b);
  const cheaperThanPct = Math.round((peers.filter((v) => v > mineP.amount).length / peers.length) * 100);
  const median = peers.length % 2 ? peers[(peers.length - 1) / 2] : (peers[peers.length / 2 - 1] + peers[peers.length / 2]) / 2;
  const per100 = mineP.amount / 10;
  return {
    n: peers.length, cheaperThanPct, band: cheaperThanPct >= 67 ? "lower" : cheaperThanPct >= 34 ? "middle" : "higher",
    unit: mineP.unit, mine: mineP.amount, median, proteinPerPound: per100 > 0 ? Math.round((p.protein / per100) * 10) / 10 : 0,
  };
}

/** The retailer with the lowest price for this product (null when none is known). Regular prices by default; with `withCard`, a loyalty-card price counts where there is one. */
export function cheapestRetailer(p: Pick<ListedProduct, "prices">, withCard = false): string | null {
  let best: [string, number] | null = null;
  for (const [r, price] of Object.entries(p.prices)) {
    const amount = withCard && price.member ? price.member.amount : price.amount;
    if (!best || amount < best[1]) best = [r, amount];
  }
  return best ? best[0] : null;
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
