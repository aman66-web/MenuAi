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
