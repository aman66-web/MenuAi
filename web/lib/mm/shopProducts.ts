// "Every product" lists (founder 2026-10-09, docs/GROCERIES_PLAN.md): what a supermarket's own category pages printed for each product (name, price,
// unit price, card price, picture), with NO nutrition unless we have read the product's own page. Built by tools/groceries/build_all_products.py from
// the listing crawls; one compact array per product so a 17,000-product shop stays about 2.5 MB.
import { normalizeForSearch } from "./search";

/** [id, name, price, unitPrice, unit, memberPrice, schemeIndex, categoryIndex, photoId, gtin] */
export type ShopRow = [string, string, number, number | null, string, number | null, number | null, number, string, string];

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
  products: ShopRow[];
}

export interface ShopManifest {
  v: 1;
  retailers: Array<{ id: string; name: string; file: string; count: number; checkedOn: string; sha256: string }>;
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

/** Rows to products; a row that doesn't have the right shape is dropped, never guessed at. */
export function decodeShopProducts(f: ShopFile): ShopProduct[] {
  const out: ShopProduct[] = [];
  for (const r of f.products) {
    if (!Array.isArray(r) || r.length < 10) continue;
    const [id, name, price, unitPrice, unit, member, scheme, cat, photoId, gtin] = r;
    if (typeof id !== "string" || !ID.test(id) || typeof name !== "string" || typeof price !== "number") continue;
    const m = typeof member === "number" && scheme !== null && f.schemes[scheme] ? { amount: member, scheme: f.schemes[scheme] } : null;
    out.push({ id, name, price, unitPrice: typeof unitPrice === "number" ? unitPrice : null, unit: unit || "", member: m, category: f.categories[cat] ?? "Other", photoId: /^\d+$/.test(photoId) ? photoId : "", gtin: gtin || "" });
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

export type ShopSort = "name" | "price" | "priceDesc" | "unit";
export const SHOP_SORTS: ReadonlyArray<{ value: ShopSort; label: string }> = [
  { value: "name", label: "Name A to Z" },
  { value: "price", label: "Price, lowest first" },
  { value: "priceDesc", label: "Price, highest first" },
  { value: "unit", label: "Price per kg or litre, lowest first" },
];

export interface ShopFilters {
  query?: string;
  category?: string | null;
  /** Only products with a lower loyalty-card price. */
  card?: boolean;
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
    return words.every((w) => hay(p).includes(` ${w}`));
  });
  const name = (a: ShopProduct, b: ShopProduct) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  const by = f.sort ?? "name";
  if (by === "price") list.sort((a, b) => a.price - b.price || name(a, b));
  else if (by === "priceDesc") list.sort((a, b) => b.price - a.price || name(a, b));
  else if (by === "unit") list.sort((a, b) => (a.unitPrice ?? Number.POSITIVE_INFINITY) - (b.unitPrice ?? Number.POSITIVE_INFINITY) || name(a, b));
  else list.sort(name);
  return list;
}
