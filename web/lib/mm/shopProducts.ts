// "Every product" lists (founder 2026-10-09, docs/GROCERIES_PLAN.md): what a supermarket's own category pages printed for each product (name, price,
// unit price, card price, picture), with NO nutrition unless we have read the product's own page. Built by tools/groceries/build_all_products.py from
// the listing crawls; one compact array per product so a 17,000-product shop stays about 2.5 MB.
import { MIN_DENSITY_PROTEIN, type PhotoSource } from "./groceries";
import { englishT, tk, type T } from "./i18n";
import { normalizeForSearch } from "./search";

/** [id, name, price, unitPrice, unit, memberPrice, schemeIndex, categoryIndex, photoId, gtin, nutrition?, page?] where page is the product page's path after
 *  pageBase when it isn't pageBase + id (Aldi, Lidl: from the shop's own sitemap), and nutrition is
 *  [kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kJ, "g" | "ml"] per 100 g or ml, copied from the product's own page, or null when that page has not been read. */
export type ShopNutritionRow = [number, number, number, number, number | null, number | null, number | null, number | null, number | null, "g" | "ml", string?];
export type ShopRow = [string, string, number | null, number | null, string, number | null, number | null, number, string, string, (ShopNutritionRow | null)?, string?, [string, string]?];

export interface ShopFile {
  v: 1;
  retailer: string;
  name: string;
  checkedOn: string;
  /** The shop's product page is pageBase + id (or + the row's page path; or, with pageSearch, + the product's name: the shop's own search for it). */
  pageBase: string;
  pageSearch?: boolean;
  /** The shop's picture of a product is photoBase + photoId + "/image.jpg" (Sainsbury's), or photoTemplate with photoId in place of "{photo}". */
  photoBase: string;
  photoTemplate?: string;
  categories: string[];
  schemes: string[];
  /** The earliest day a product page's nutrition was read (empty when none was). */
  nutritionCheckedOn?: string;
  products: ShopRow[];
}

export interface ShopManifest {
  v: 1;
  /** `nutrition`: how many products have numbers read from their own page (recipes need them; absent = none). */
  /** `priced`: how many show a price (absent = all of them; fewer only for Lidl, whose everyday range has no price online). */
  retailers: Array<{ id: string; name: string; file: string; count: number; checkedOn: string; sha256: string; nutrition?: number; priced?: number }>;
}

/** The shops recipes can use: only those with products whose label we have read (recipes work out every figure from the labels). */
export const recipeShops = (m: ShopManifest | null): ShopManifest["retailers"] => (m ? m.retailers.filter((r) => (r.nutrition ?? 0) > 0) : []);

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
  /** null only where the shop's own page prints no price (Lidl's everyday range: Lidl prices online only its weekly offers). The app says "Price in store". */
  price: number | null;
  unitPrice: number | null;
  /** "per kg", "per litre", "each". */
  unit: string;
  member: { amount: number; scheme: string } | null;
  category: string;
  photoId: string;
  /** The product page's path after pageBase, where it isn't pageBase + id ("" or absent otherwise). */
  page?: string;
  /** Set only where the shop's own product page was read and showed a barcode: the full product page in the app is /app/groceries/product?code=. */
  gtin: string;
  /** Set only where the product's own page was read. */
  nutrition: ShopNutrition | null;
  /** Only where the shop's listing showed no picture: the same product's photo from another supermarket's own website, or the Open Food Facts front photo
   *  of its exact barcode (founder 2026-10-11; tools/groceries/build_all_products.py fill_photos). `from` is that shop's id, or "off". */
  otherPhoto?: { src: string; from: string };
}

/** A product with a shelf price: recipes and anything that adds up money use only these. */
export type PricedProduct = ShopProduct & { price: number };
export const hasPrice = (p: ShopProduct): p is PricedProduct => p.price !== null;

export function isShopFile(x: unknown): x is ShopFile {
  const f = x as ShopFile;
  return !!f && f.v === 1 && typeof f.retailer === "string" && typeof f.pageBase === "string" && f.pageBase.startsWith("https://") && Array.isArray(f.categories) && Array.isArray(f.schemes) && Array.isArray(f.products);
}

export function isShopManifest(x: unknown): x is ShopManifest {
  const m = x as ShopManifest;
  return !!m && m.v === 1 && Array.isArray(m.retailers);
}

const ID = /^[A-Za-z0-9][A-Za-z0-9\-_.%]{0,119}$/;
// A picture id put into a shop's photoTemplate, and a page path put after pageBase: the characters those addresses use, never "..".
const PHOTO_ID = /^[A-Za-z0-9_\-./:=%]{1,400}$/;
const PAGE_PATH = /^[A-Za-z0-9][A-Za-z0-9\-_.%/]{0,199}$/;
const safe = (v: unknown, re: RegExp): v is string => typeof v === "string" && re.test(v) && !v.includes("..");
const templated = (f: Pick<ShopFile, "photoTemplate">) => typeof f.photoTemplate === "string" && f.photoTemplate.startsWith("https://") && f.photoTemplate.includes("{photo}");

/**
 * "per 100 g", or "per 100 g (grilled)" when the page's own heading says the numbers are for the grilled, cooked or prepared food
 * (the state word is the shop's own, shown as printed).
 */
export const nutritionBasis = (n: Pick<ShopNutrition, "per" | "state">, t: T = englishT): string =>
  n.state ? t("per 100 {unit} ({state})", { unit: n.per, state: n.state }) : t("per 100 {unit}", { unit: n.per });

function decodeNutrition(n: ShopNutritionRow | null | undefined): ShopNutrition | null {
  if (!Array.isArray(n) || n.length < 10) return null;
  const [kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kj, per, state] = n;
  if (![kcal, protein, carbs, fat].every((v) => typeof v === "number" && Number.isFinite(v)) || (per !== "g" && per !== "ml")) return null;
  const opt = (v: number | null) => (typeof v === "number" ? v : null);
  return { kcal, protein, carbs, fat, saturates: opt(saturates), sugars: opt(sugars), fibre: opt(fibre), salt: opt(salt), kj: opt(kj), per, state: typeof state === "string" && /^[a-z][a-z ]{0,23}$/.test(state) ? state : "" };
}

// Where a borrowed photo may come from: the supermarkets' own image servers and Open Food Facts' (https only, checked again here).
const OTHER_PHOTO_HOSTS = ["assets.sainsburys-groceries.co.uk", "asdagroceries.scene7.com", "dm.emea.cms.aldi.cx", "imgproxy-retcat.assets.schwarz", "digitalcontent.api.tesco.com",
  "ecom-su-static-prod.wtrecom.com", "groceries.morrisons.com", "assets.iceland.co.uk", "assets.digitalcontent.marksandspencer.app", "images.openfoodfacts.org"];
const OTHER_FROM = /^(?:off|[a-z][a-z-]{1,30})$/;

function decodeOtherPhoto(x: unknown): ShopProduct["otherPhoto"] {
  if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== "string" || typeof x[1] !== "string" || !OTHER_FROM.test(x[0])) return undefined;
  try {
    const u = new URL(x[1]);
    return u.protocol === "https:" && OTHER_PHOTO_HOSTS.includes(u.hostname) && (x[0] === "off") === (u.hostname === "images.openfoodfacts.org") ? { src: u.href, from: x[0] } : undefined;
  } catch {
    return undefined;
  }
}

/** Rows to products; a row that doesn't have the right shape is dropped, never guessed at. */
export function decodeShopProducts(f: ShopFile): ShopProduct[] {
  const out: ShopProduct[] = [];
  for (const r of f.products) {
    if (!Array.isArray(r) || r.length < 10) continue;
    const [id, name, price, unitPrice, unit, member, scheme, cat, photoId, gtin, n, page, other] = r;
    if (typeof id !== "string" || !ID.test(id) || typeof name !== "string" || (price !== null && (typeof price !== "number" || !(price > 0)))) continue;
    const m = typeof member === "number" && price !== null && scheme !== null && f.schemes[scheme] ? { amount: member, scheme: f.schemes[scheme] } : null;
    out.push({ id, name, price, unitPrice: typeof unitPrice === "number" && price !== null ? unitPrice : null, unit: unit || "", member: m, category: f.categories[cat] ?? "Other", photoId: templated(f) ? (safe(photoId, PHOTO_ID) ? photoId : "") : /^\d+$/.test(photoId) ? photoId : "", page: safe(page, PAGE_PATH) ? page : "", gtin: gtin || "", nutrition: decodeNutrition(n), ...(decodeOtherPhoto(other) ? { otherPhoto: decodeOtherPhoto(other) } : {}) });
  }
  return out;
}

/** The shop's own page for a product (https only): its page path, else the shop's own search for its name (pageSearch), else pageBase + id. */
export function shopPageUrl(f: Pick<ShopFile, "pageBase" | "pageSearch">, p: Pick<ShopProduct, "id" | "name"> & { page?: string }): string {
  if (p.page) return `${f.pageBase}${p.page}`;
  if (f.pageSearch) return `${f.pageBase}${encodeURIComponent(p.name)}`;
  return `${f.pageBase}${p.id}`;
}

/**
 * Where a list product's picture comes from, best first: the shop's own photo, then (only where its listing showed none) the same product's photo from
 * another supermarket's website or from Open Food Facts. The screen credits each one by name.
 */
export function shopPhotoSources(f: Pick<ShopFile, "retailer" | "photoBase" | "photoTemplate">, p: Pick<ShopProduct, "photoId" | "otherPhoto">): PhotoSource[] {
  const own = shopPhotoUrl(f, p);
  if (own) return [{ src: own, from: "retailer", shop: f.retailer }];
  if (p.otherPhoto) return [p.otherPhoto.from === "off" ? { src: p.otherPhoto.src, from: "off", shop: "" } : { src: p.otherPhoto.src, from: "retailer", shop: p.otherPhoto.from }];
  return [];
}

/** The shop's picture of a product, or undefined when its listing showed none. */
export function shopPhotoUrl(f: Pick<ShopFile, "photoBase" | "photoTemplate">, p: Pick<ShopProduct, "photoId">): string | undefined {
  if (!p.photoId) return undefined;
  if (f.photoTemplate !== undefined) return templated(f) && safe(p.photoId, PHOTO_ID) ? f.photoTemplate.replace("{photo}", p.photoId) : undefined;
  return f.photoBase.startsWith("https://") ? `${f.photoBase}${p.photoId}/image.jpg` : undefined;
}

/** "Sainsbury's" stays "Sainsbury's", "Morrisons" -> "Morrisons'", "Tesco" -> "Tesco's", "M&S" -> "M&S's" (never a doubled possessive). */
export const possessive = (name: string): string => (/['’]s$/.test(name) ? name : /s$/.test(name) ? `${name}'` : `${name}'s`);

export type ShopSort = "name" | "price" | "priceDesc" | "unit" | "density" | "protein";
export const SHOP_SORTS: ReadonlyArray<{ value: ShopSort; label: string }> = [
  { value: "name", label: tk("Name A to Z") },
  { value: "price", label: tk("Price, lowest first") },
  { value: "priceDesc", label: tk("Price, highest first") },
  { value: "unit", label: tk("Price per kg or litre, lowest first") },
  { value: "density", label: tk("Most protein per 100 kcal") },
  { value: "protein", label: tk("Most protein") },
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
  // like a phone's address book: names that start with a letter first, then those starting with a number or a sign ("-196 ...", "1000 Stories ...")
  const letter = (p: ShopProduct) => (/^\p{L}/u.test(p.name) ? 0 : 1);
  const name = (a: ShopProduct, b: ShopProduct) => letter(a) - letter(b) || a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  const by = f.sort ?? "name";
  // products whose price is only in store (Lidl's everyday range) go last either way
  if (by === "price") list.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY) || name(a, b));
  else if (by === "priceDesc") list.sort((a, b) => (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY) || name(a, b));
  else if (by === "unit") list.sort((a, b) => (a.unitPrice ?? Number.POSITIVE_INFINITY) - (b.unitPrice ?? Number.POSITIVE_INFINITY) || name(a, b));
  else if (by === "density" || by === "protein") {
    // products without numbers, and those whose numbers are for the cooked or prepared food, go last: they can't be compared with food as sold, and nothing is guessed for them
    const key = (p: ShopProduct) => (p.nutrition && !p.nutrition.state ? (by === "density" ? (p.nutrition.kcal > 0 ? (p.nutrition.protein / p.nutrition.kcal) * 100 : 0) : p.nutrition.protein) : Number.NEGATIVE_INFINITY);
    // by density, a product with under 1 g of protein per 100 g goes after those with more (a 2 kcal drink with 0.5 g would otherwise top the list)
    const low = (p: ShopProduct) => Number(by === "density" && !!p.nutrition && !p.nutrition.state && p.nutrition.protein < MIN_DENSITY_PROTEIN);
    list.sort((a, b) => low(a) - low(b) || key(b) - key(a) || name(a, b));
  } else list.sort(name);
  return list;
}
