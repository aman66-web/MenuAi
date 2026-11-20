// Scan a barcode, see the product (founder 2026-11-20: "when they scan a barcode of a product, it needs to come up with the product and they can input in and
// it's their food thing, food tracker"). public/groceries/all/barcodes.json (tools/groceries/build_all_products.py write_barcodes) says where every barcode in
// the shop lists and in the older barcode catalogue is, so a scan opens the right page loading only the files that hold it. Pure and unit-tested.

/** How a shop list row's numbers were come by (build_all_products.py label_kind). */
export type LabelKind = "none" | "own" | "same" | "community" | "government";
const KINDS: readonly LabelKind[] = ["none", "own", "same", "community", "government"];

export interface BarcodeFile {
  v: 1;
  /** The shop lists, in the order the rows below index them. */
  shops: string[];
  /** Barcode (leading zeros stripped) -> [shop index, the shop's product id, label kind 0-4] for every shop list row with it. */
  codes: Record<string, Array<[number, string, number]>>;
  /** The older barcode catalogue: barcode -> indexes into `shops` of the catalogue files (public/groceries/<shop>.json) that hold it. */
  catalogue: { shops: string[]; codes: Record<string, number[]> };
}

export function isBarcodeFile(x: unknown): x is BarcodeFile {
  const f = x as BarcodeFile;
  return !!f && f.v === 1 && Array.isArray(f.shops) && !!f.codes && typeof f.codes === "object" && !!f.catalogue && Array.isArray(f.catalogue.shops)
    && !!f.catalogue.codes && typeof f.catalogue.codes === "object";
}

/**
 * A barcode as typed or read, as the files key it: digits only (spaces and hyphens dropped), 8 to 14 of them (EAN-8, UPC-A, EAN-13, GTIN-14), with the
 * leading zeros stripped, so EAN-13 0012345678905, its GTIN-14 form and the 12-digit UPC-A 012345678905 are one number. null for anything else.
 */
export function normaliseBarcode(raw: string): string | null {
  const d = (raw ?? "").replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(d) ? d.replace(/^0+/, "") : null;
}

/** The check digit of a UPC-A or EAN code's first digits (GS1: weights 3 and 1 from the right). */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * A UPC-E code (8 digits: number system 0 or 1, six digits, check digit) written out as its UPC-A (12 digits), or null when it isn't a valid UPC-E. A scanner
 * may hand over the short form of a code the files hold in full.
 */
export function upcEToA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const n = code[0]!;
  const d = code.slice(1, 7);
  const last = d[5]!;
  let body: string;
  if (last <= "2") body = `${n}${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === "3") body = `${n}${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === "4") body = `${n}${d.slice(0, 4)}00000${d[4]}`;
  else body = `${n}${d.slice(0, 5)}0000${last}`;
  return checkDigit(body) === Number(code[7]) ? `${body}${code[7]}` : null;
}

/** The numbers to look a scanned code up by, best first: the code itself, then (an 8-digit code read as UPC-E) its UPC-A form. */
export function barcodeCandidates(raw: string): string[] {
  const code = normaliseBarcode(raw);
  if (!code) return [];
  const digits = (raw ?? "").replace(/[\s-]/g, "");
  const upcA = digits.length === 8 ? upcEToA(digits) : null;
  const long = upcA ? normaliseBarcode(upcA) : null;
  return long && long !== code ? [code, long] : [code];
}

export interface ShopHit {
  shop: string;
  id: string;
  label: LabelKind;
}

export interface BarcodeHit {
  /** The code as the files key it. */
  code: string;
  /** Every shop list row with it: the person's own shops first, in the order they chose them, then the files' order. */
  shops: ShopHit[];
  /** The catalogue files that hold it (their shop ids), the person's own shops first. */
  catalogue: string[];
}

/** Has the label numbers to log (anything but "none"). */
export const hasLabel = (h: ShopHit): boolean => h.label !== "none";

/** Where a scanned or typed barcode is, or null when no file holds it. `mine`: the person's own supermarkets (Settings), first chosen first. */
export function lookupBarcode(file: BarcodeFile, raw: string, mine: readonly string[] = []): BarcodeHit | null {
  const rank = (shop: string, order: number) => { const i = mine.indexOf(shop); return i < 0 ? mine.length + order : i; };
  for (const code of barcodeCandidates(raw)) {
    const rows = file.codes[code] ?? [];
    const cat = file.catalogue.codes[code] ?? [];
    if (rows.length === 0 && cat.length === 0) continue;
    const shops = rows
      .map(([i, id, k], order) => ({ hit: { shop: file.shops[i] ?? "", id, label: KINDS[k] ?? "none" }, order }))
      .filter((x) => !!x.hit.shop && typeof x.hit.id === "string" && x.hit.id.length > 0)
      .sort((a, b) => rank(a.hit.shop, a.order) - rank(b.hit.shop, b.order))
      .map((x) => x.hit);
    const catalogue = cat
      .map((i, order) => ({ shop: file.catalogue.shops[i] ?? "", order }))
      .filter((x) => !!x.shop)
      .sort((a, b) => rank(a.shop, a.order) - rank(b.shop, b.order))
      .map((x) => x.shop);
    return { code, shops, catalogue };
  }
  return null;
}

/** The shop list row a scan opens: the first of the person's own shops that sells it (BarcodeHit.shops is in that order), else the first shop that does. */
export const scanTarget = (hit: BarcodeHit): ShopHit | null => hit.shops[0] ?? null;

/** The product page in the app for a shop list row. */
export const shopItemHref = (h: Pick<ShopHit, "shop" | "id">): string => `/app/groceries/shop/item?r=${encodeURIComponent(h.shop)}&id=${encodeURIComponent(h.id)}`;

/** The rows whose numbers a page can borrow for the same barcode: a shop's own label, then the same product's label read at another shop (never community or
 *  government figures), `prefer` first among each. */
export function labelledHits(hit: BarcodeHit, prefer?: string | null): ShopHit[] {
  const order = (h: ShopHit) => (h.label === "own" ? 0 : h.label === "same" ? 1 : 2) * 2 + (prefer && h.shop === prefer ? 0 : 1);
  return hit.shops.filter((h) => h.label === "own" || h.label === "same").sort((a, b) => order(a) - order(b));
}

/** The product page in the app for a shop list row, saying it was reached by a scan (the page then puts "Add to my food diary" first). */
export const scannedItemHref = (h: Pick<ShopHit, "shop" | "id">): string => `${shopItemHref(h)}&scan=1`;

// ---- the digits as printed (the design review of 20 November 2026: 01318180 was shown as 1318180)

/** A barcode's digits as printed under it (spaces and hyphens dropped, leading zeros kept), 8 to 14 of them; null for anything else. Look it up by normaliseBarcode. */
export function barcodeDigits(raw: string): string | null {
  const d = (raw ?? "").replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(d) ? d : null;
}

/** A barcode for the screen: the digits as given; one that lost its leading zeros on the way (a link keyed by normaliseBarcode) back at an EAN-8's 8 digits. */
export function barcodeShown(code: string): string {
  const d = (code ?? "").replace(/[\s-]/g, "");
  return /^\d{1,7}$/.test(d) ? d.padStart(8, "0") : d;
}

// ---- a barcode no list of ours holds: Open Food Facts, asked through our own API (GET /api/v1/barcode/{code}, lib/barcodeLookup.ts). Founder 2026-11-20.
// Community data, said so on screen (CLAUDE.md rule 1): every figure is checked here, on the server and again on the phone; a figure that can't be right is left out,
// and when the calories don't roughly agree with the protein, carbs and fat there are no figures to add at all (the person types them from the pack).

/** A label's figures per 100 g or 100 ml, as Open Food Facts holds them, each one checked. */
export interface OffLabel {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  saturates?: number;
  sugars?: number;
  fibre?: number;
  salt?: number;
}

/** What our API answers for a barcode Open Food Facts has. */
export interface OffProduct {
  /** The digits as asked (leading zeros kept). */
  code: string;
  /** "" when the record has no name. */
  name: string;
  brand: string;
  /** The pack size as printed ("500 g", "6 x 330 ml"), or "". */
  quantity: string;
  /** One serving as printed ("30 g", "1 bar (45 g)"), or "". */
  serving: string;
  per: "g" | "ml";
  /** null: no figures we'd add (missing, impossible, or the calories don't agree with the macros). */
  label: OffLabel | null;
  /** The front photo on Open Food Facts' own server (CC BY-SA), or null. */
  image: string | null;
}

export type OffAnswer = { found: false } | { found: true; product: OffProduct };

/** The most kcal 100 g can hold (pure fat is 900). */
export const MAX_KCAL_PER_100 = 900;
const MAX_NAME = 100;
const MAX_TEXT = 60;
/** The Open Food Facts front photo of a product (the same pattern lib/mm/groceries.ts validPhoto keeps). */
const OFF_FRONT = /^https:\/\/images\.openfoodfacts\.org\/images\/products\/[0-9/]{8,40}\/front_[a-z]{2}\.\d+\.(?:400|full)\.jpg$/;
const VOLUME = /\d\s*(?:ml|cl|dl|l|ltr|litres?|liters?)\b/i;

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/** A figure as a number of 0 or more (a plain number, or a number written as text, as Open Food Facts sometimes sends it), else null. */
function figure(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(?:\.\d+)?\s*$/.test(v) ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Do the calories roughly agree with the protein, carbs and fat (4, 4 and 9 kcal a gram; fibre up to 2 more)? Roughly: labels round, and some count fibre or
 * polyols differently, so 20 kcal and a quarter either way. A slip (kJ typed as kcal, a missing digit) doesn't pass.
 */
export function energyAgrees(kcal: number, protein: number, carbs: number, fat: number, fibre = 0): boolean {
  const low = 4 * protein + 4 * carbs + 9 * fat;
  const high = low + 2 * fibre;
  const slack = 20 + 0.25 * Math.max(kcal, high);
  return kcal >= low - slack && kcal <= high + slack;
}

/**
 * The figures to add from a record's per-100 figures, or null when there are none we'd show: calories, protein, carbs and fat must all be there, none negative,
 * none more than 100 g can hold, and the calories must agree with the rest (energyAgrees). Saturates above the fat, sugars above the carbs, or anything else
 * impossible is left out on its own.
 */
export function offLabel(n: unknown, keys: { kcal: string; protein: string; carbs: string; fat: string; saturates: string; sugars: string; fibre: string; salt: string }): OffLabel | null {
  if (!n || typeof n !== "object") return null;
  const r = n as Record<string, unknown>;
  const kcal = figure(r[keys.kcal]);
  const protein = figure(r[keys.protein]);
  const carbs = figure(r[keys.carbs]);
  const fat = figure(r[keys.fat]);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  if (kcal > MAX_KCAL_PER_100 || protein > 100 || carbs > 100 || fat > 100 || protein + carbs + fat > 101) return null;
  const fibreRaw = figure(r[keys.fibre]);
  const fibre = fibreRaw !== null && fibreRaw <= 100 ? fibreRaw : null;
  if (!energyAgrees(kcal, protein, carbs, fat, fibre ?? 0)) return null;
  const out: OffLabel = { kcal: round(kcal, 0), protein: round(protein, 1), carbs: round(carbs, 1), fat: round(fat, 1) };
  const saturates = figure(r[keys.saturates]);
  if (saturates !== null && saturates <= fat + 0.05) out.saturates = round(saturates, 1);
  const sugars = figure(r[keys.sugars]);
  if (sugars !== null && sugars <= carbs + 0.05) out.sugars = round(sugars, 1);
  if (fibre !== null) out.fibre = round(fibre, 1);
  const salt = figure(r[keys.salt]);
  if (salt !== null && salt <= 100) out.salt = round(salt, 2);
  return out;
}

/** Open Food Facts' own names for the per-100 figures. */
const OFF_KEYS = { kcal: "energy-kcal_100g", protein: "proteins_100g", carbs: "carbohydrates_100g", fat: "fat_100g", saturates: "saturated-fat_100g", sugars: "sugars_100g", fibre: "fiber_100g", salt: "salt_100g" };
/** Our API's names for them (OffLabel's own). */
const OUR_KEYS = { kcal: "kcal", protein: "protein", carbs: "carbs", fat: "fat", saturates: "saturates", sugars: "sugars", fibre: "fibre", salt: "salt" };

/** Words from a record: a string, control characters dropped, spaces closed up, at most `max` characters; "" for anything else. */
function words(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // control characters, zero-width and direction marks are dropped
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** "g" or "ml": what the label's per-100 figures are per, from the pack size (or the serving) as printed. */
const perOf = (quantity: string, serving: string): "g" | "ml" => (VOLUME.test(quantity) || (!quantity && VOLUME.test(serving)) ? "ml" : "g");

/** Open Food Facts' answer for a barcode (GET /api/v2/product/{code}.json) as ours: found only when it holds a product with a name or figures. */
export function offAnswerFromOff(code: string, json: unknown): OffAnswer {
  const j = json as { status?: unknown; product?: Record<string, unknown> } | null;
  if (!j || typeof j !== "object" || (j.status !== 1 && j.status !== "1") || !j.product || typeof j.product !== "object") return { found: false };
  const p = j.product;
  const name = words(p.product_name_en, MAX_NAME) || words(p.product_name, MAX_NAME);
  const brand = words(typeof p.brands === "string" ? p.brands.split(",")[0] : "", MAX_TEXT);
  const quantity = words(p.quantity, MAX_TEXT);
  const serving = words(p.serving_size, MAX_TEXT);
  const label = offLabel(p.nutriments, OFF_KEYS);
  const image = typeof p.image_front_url === "string" && OFF_FRONT.test(p.image_front_url) ? p.image_front_url : null;
  if (!name && !label) return { found: false };
  return { found: true, product: { code, name, brand, quantity, serving, per: perOf(quantity, serving), label, image } };
}

/** Our API's answer read back on the phone, checked again (nothing from the network is trusted); null when it isn't one. */
export function offAnswerFrom(json: unknown, code: string): OffAnswer | null {
  const j = json as { found?: unknown; product?: Record<string, unknown> } | null;
  if (!j || typeof j !== "object") return null;
  if (j.found === false) return { found: false };
  const p = j.product;
  if (j.found !== true || !p || typeof p !== "object" || p.code !== code) return null;
  const name = words(p.name, MAX_NAME);
  const label = p.label === null ? null : offLabel(p.label, OUR_KEYS);
  if (p.label !== null && !label) return null;
  if (!name && !label) return { found: false };
  const quantity = words(p.quantity, MAX_TEXT);
  const serving = words(p.serving, MAX_TEXT);
  return {
    found: true,
    product: { code, name, brand: words(p.brand, MAX_TEXT), quantity, serving, per: p.per === "ml" ? "ml" : "g", label, image: typeof p.image === "string" && OFF_FRONT.test(p.image) ? p.image : null },
  };
}
