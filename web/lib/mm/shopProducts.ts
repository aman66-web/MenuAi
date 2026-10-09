// "Every product" lists (founder 2026-10-09, docs/GROCERIES_PLAN.md): what a supermarket's own category pages printed for each product (name, price,
// unit price, card price, picture), with NO nutrition unless we have read the product's own page. Built by tools/groceries/build_all_products.py from
// the listing crawls; one compact array per product so a 17,000-product shop stays about 2.5 MB.
import { normalizeForSearch } from "./search";

/** [id, name, price, unitPrice, unit, memberPrice, schemeIndex, categoryIndex, photoId, gtin, nutrition?] where nutrition is
 *  [kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kJ, "g" | "ml"] per 100 g or ml, copied from the product's own page, or null when that page has not been read. */
export type ShopNutritionRow = [number, number, number, number, number | null, number | null, number | null, number | null, number | null, "g" | "ml", string?];
export type ShopRow = [string, string, number, number | null, string, number | null, number | null, number, string, string, (ShopNutritionRow | null)?];

export interface ShopFile {
  v: 1;
  retailer: string;
  name: string;
  checkedOn: string;
  /** The shop's product page is pageBase + id. */
  pageBase: string;
  /** The shop's picture of a product is photoBase + photoId + "/image.jpg". */
  photoBase: string;
  categories: string[];
  schemes: string[];
  /** The earliest day a product page's nutrition was read (empty when none was). */
  nutritionCheckedOn?: string;
  products: ShopRow[];
}

export interface ShopManifest {
  v: 1;
  retailers: Array<{ id: string; name: string; file: string; count: number; checkedOn: string; sha256: string }>;
}

/** Per 100 g or 100 ml, as the shop's own product page printed them ("<0.5" counted as 0). */
export interface ShopNutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  saturates: number | null;
  sugars: number | null;
  fibre: number | null;
  salt: number | null;
  kj: number | null;
  per: "g" | "ml";
  /** "" when the numbers are for the food as sold; otherwise the word the page's own heading adds ("grilled", "cooked bacon", "prepared"), which the app shows next to them. */
  state: string;
}

export interface ShopProduct {
  id: string;
  name: string;
  price: number;
  unitPrice: number | null;
  /** "per kg", "per litre", "each". */
  unit: string;
  member: { amount: number; scheme: string } | null;
  category: string;
  photoId: string;
  /** Set only where the shop's own product page was read and showed a barcode: the full product page in the app is /app/groceries/product?code=. */
  gtin: string;
  /** Set only where the product's own page was read. */
  nutrition: ShopNutrition | null;
}

export function isShopFile(x: unknown): x is ShopFile {
  const f = x as ShopFile;
  return !!f && f.v === 1 && typeof f.retailer === "string" && typeof f.pageBase === "string" && f.pageBase.startsWith("https://") && Array.isArray(f.categories) && Array.isArray(f.schemes) && Array.isArray(f.products);
}

export function isShopManifest(x: unknown): x is ShopManifest {
  const m = x as ShopManifest;
  return !!m && m.v === 1 && Array.isArray(m.retailers);
}

const ID = /^[A-Za-z0-9][A-Za-z0-9\-_.%]{0,119}$/;

/** "per 100 g", or "per 100 g (grilled)" when the page's own heading says the numbers are for the grilled, cooked or prepared food. */
export const nutritionBasis = (n: Pick<ShopNutrition, "per" | "state">): string => `per 100 ${n.per}${n.state ? ` (${n.state})` : ""}`;

function decodeNutrition(n: ShopNutritionRow | null | undefined): ShopNutrition | null {
  if (!Array.isArray(n) || n.length < 10) return null;
  const [kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kj, per, state] = n;
  if (![kcal, protein, carbs, fat].every((v) => typeof v === "number" && Number.isFinite(v)) || (per !== "g" && per !== "ml")) return null;
  const opt = (v: number | null) => (typeof v === "number" ? v : null);
  return { kcal, protein, carbs, fat, saturates: opt(saturates), sugars: opt(sugars), fibre: opt(fibre), salt: opt(salt), kj: opt(kj), per, state: typeof state === "string" && /^[a-z][a-z ]{0,23}$/.test(state) ? state : "" };
}

/** Rows to products; a row that doesn't have the right shape is dropped, never guessed at. */
export function decodeShopProducts(f: ShopFile): ShopProduct[] {
  const out: ShopProduct[] = [];
  for (const r of f.products) {
    if (!Array.isArray(r) || r.length < 10) continue;
    const [id, name, price, unitPrice, unit, member, scheme, cat, photoId, gtin, n] = r;
    if (typeof id !== "string" || !ID.test(id) || typeof name !== "string" || typeof price !== "number") continue;
    const m = typeof member === "number" && scheme !== null && f.schemes[scheme] ? { amount: member, scheme: f.schemes[scheme] } : null;
    out.push({ id, name, price, unitPrice: typeof unitPrice === "number" ? unitPrice : null, unit: unit || "", member: m, category: f.categories[cat] ?? "Other", photoId: /^\d+$/.test(photoId) ? photoId : "", gtin: gtin || "", nutrition: decodeNutrition(n) });
  }
  return out;
}

/** The shop's own page for a product (https only). */
export function shopPageUrl(f: Pick<ShopFile, "pageBase">, p: Pick<ShopProduct, "id">): string {
  return `${f.pageBase}${p.id}`;
}

/** The shop's picture of a product, or undefined when its listing showed none. */
export function shopPhotoUrl(f: Pick<ShopFile, "photoBase">, p: Pick<ShopProduct, "photoId">): string | undefined {
  return p.photoId && f.photoBase.startsWith("https://") ? `${f.photoBase}${p.photoId}/image.jpg` : undefined;
}

/** "Sainsbury's" stays "Sainsbury's", "Morrisons" -> "Morrisons'", "Tesco" -> "Tesco's", "M&S" -> "M&S's" (never a doubled possessive). */
export const possessive = (name: string): string => (/['’]s$/.test(name) ? name : /s$/.test(name) ? `${name}'` : `${name}'s`);

export type ShopSort = "name" | "price" | "priceDesc" | "unit" | "density" | "protein";
export const SHOP_SORTS: ReadonlyArray<{ value: ShopSort; label: string }> = [
  { value: "name", label: "Name A to Z" },
  { value: "price", label: "Price, lowest first" },
  { value: "priceDesc", label: "Price, highest first" },
  { value: "unit", label: "Price per kg or litre, lowest first" },
  { value: "density", label: "Most protein per 100 kcal" },
  { value: "protein", label: "Most protein" },
];

export interface ShopFilters {
  query?: string;
  category?: string | null;
  /** Only products with a lower loyalty-card price. */
  card?: boolean;
  /** Only products whose own page we have read for nutrition. */
  nutrition?: boolean;
  sort?: ShopSort;
}

const haystack = new WeakMap<object, string>();
const hay = (p: ShopProduct) => {
  let h = haystack.get(p);
  if (h === undefined) {
    h = ` ${normalizeForSearch(p.name)}`;
    haystack.set(p, h);
  }
  return h;
};

/** Every word typed must start a word of the name; then filter and sort (ties by name). */
export function searchShopProducts(products: readonly ShopProduct[], f: ShopFilters): ShopProduct[] {
  const words = f.query ? normalizeForSearch(f.query).split(" ").filter(Boolean) : [];
  const list = products.filter((p) => {
    if (f.category && p.category !== f.category) return false;
    if (f.card && !p.member) return false;
    if (f.nutrition && !p.nutrition) return false;
    return words.every((w) => hay(p).includes(` ${w}`));
  });
  const name = (a: ShopProduct, b: ShopProduct) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  const by = f.sort ?? "name";
  if (by === "price") list.sort((a, b) => a.price - b.price || name(a, b));
  else if (by === "priceDesc") list.sort((a, b) => b.price - a.price || name(a, b));
  else if (by === "unit") list.sort((a, b) => (a.unitPrice ?? Number.POSITIVE_INFINITY) - (b.unitPrice ?? Number.POSITIVE_INFINITY) || name(a, b));
  else if (by === "density" || by === "protein") {
    // products without numbers, and those whose numbers are for the cooked or prepared food, go last: they can't be compared with food as sold, and nothing is guessed for them
    const key = (p: ShopProduct) => (p.nutrition && !p.nutrition.state ? (by === "density" ? (p.nutrition.kcal > 0 ? (p.nutrition.protein / p.nutrition.kcal) * 100 : 0) : p.nutrition.protein) : Number.NEGATIVE_INFINITY);
    list.sort((a, b) => key(b) - key(a) || name(a, b));
  } else list.sort(name);
  return list;
}
