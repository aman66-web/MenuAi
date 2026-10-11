// Compare (founder 2026-10-11: "they should have a compare tool where they can compare various versions of products like beans to see the nutrient
// difference ... stuff like this too"). Groceries are compared per 100 g or ml as each label prints them; restaurant dishes per serving as each restaurant
// publishes them. The two are never mixed in one table. Each item is a copy of the figures shown when it was added (on this device only, mm.v1.compare):
// nothing is worked out except the plain arithmetic shown (price per kg as the shop prints it, grams of protein for £1). Words are neutral: "Highest" and
// "Lowest", never good or bad (CLAUDE.md rule 3).
import { tk } from "./i18n";

export type CompareKind = "food" | "dish";
export const COMPARE_MAX = 6;

export interface CompareNumbers {
  kcal: number;
  protein: number | null;
  carbs: number | null;
  sugars: number | null;
  fat: number | null;
  saturates: number | null;
  fibre: number | null;
  salt: number | null;
}

export interface CompareItem {
  /** "food:<shop>:<id>", "food:gtin:<code>" or "dish:<chain>:<item>": one entry per product or dish. */
  key: string;
  kind: CompareKind;
  name: string;
  /** The shop or restaurant's name, and its id (for its logo). */
  from: string;
  fromId: string;
  /** The product's or dish's own page in the app. */
  href: string;
  /** A picture address (the shop's or chain's own photo), or none. */
  photo?: string;
  /** Food: per 100 g or per 100 ml; dish: per serving. */
  basis: "g" | "ml" | "serving";
  /** Food: the label's own word when its numbers are for the cooked or prepared food; dish: the serving as printed ("1 burger"). */
  note?: string;
  numbers: CompareNumbers;
  /** Food only, as the shop showed them. */
  price?: number;
  unitPrice?: number;
  unit?: string;
  /** Where the figures came from: the shop's own label, the community database, or the restaurant. */
  source: "label" | "community" | "restaurant";
  addedAt: string;
}

const KEY = /^(?:food|dish):[A-Za-z0-9][A-Za-z0-9\-_.%:]{0,160}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,80}$/;
const PHOTO_HOSTS = ["assets.sainsburys-groceries.co.uk", "asdagroceries.scene7.com", "dm.emea.cms.aldi.cx", "imgproxy-retcat.assets.schwarz", "digitalcontent.api.tesco.com",
  "ecom-su-static-prod.wtrecom.com", "groceries.morrisons.com", "assets.iceland.co.uk", "assets.digitalcontent.marksandspencer.app", "images.openfoodfacts.org"];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100_000 ? v : null);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

function safePhoto(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (/^\/(?:menu-images|grocery-images)\/[A-Za-z0-9\-_./]{3,200}$/.test(v) && !v.includes("..")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && PHOTO_HOSTS.includes(u.hostname) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** One stored item, checked field by field; anything malformed is dropped, never repaired. */
export function sanitizeCompareItem(raw: unknown): CompareItem | null {
  const r = raw as Partial<CompareItem> | null;
  if (!r || typeof r !== "object" || (r.kind !== "food" && r.kind !== "dish")) return null;
  const key = typeof r.key === "string" && KEY.test(r.key) && r.key.startsWith(`${r.kind}:`) ? r.key : null;
  const name = text(r.name, 200);
  const from = text(r.from, 80);
  const fromId = typeof r.fromId === "string" && ID.test(r.fromId) ? r.fromId : null;
  const href = typeof r.href === "string" && /^\/app\/[A-Za-z0-9\-_/?=&%.]{1,300}$/.test(r.href) && !r.href.includes("..") ? r.href : null;
  const basis = r.kind === "dish" ? (r.basis === "serving" ? "serving" : null) : r.basis === "g" || r.basis === "ml" ? r.basis : null;
  const n = (r.numbers ?? {}) as Partial<CompareNumbers>;
  const kcal = num(n.kcal);
  const source = r.kind === "dish" ? (r.source === "restaurant" ? "restaurant" : null) : r.source === "label" || r.source === "community" ? r.source : null;
  if (!key || !name || !from || !fromId || !href || !basis || kcal === null || !source || typeof r.addedAt !== "string" || !Number.isFinite(Date.parse(r.addedAt))) return null;
  const photo = safePhoto(r.photo);
  const note = text(r.note, 60);
  const price = num(r.price);
  const unitPrice = num(r.unitPrice);
  const unit = r.unit === "per kg" || r.unit === "per litre" || r.unit === "each" ? r.unit : null;
  return {
    key, kind: r.kind, name, from, fromId, href, basis, source, addedAt: r.addedAt,
    numbers: { kcal, protein: num(n.protein), carbs: num(n.carbs), sugars: num(n.sugars), fat: num(n.fat), saturates: num(n.saturates), fibre: num(n.fibre), salt: num(n.salt) },
    ...(photo ? { photo } : {}),
    ...(note ? { note } : {}),
    ...(r.kind === "food" && price !== null && price > 0 ? { price } : {}),
    ...(r.kind === "food" && unitPrice !== null && unitPrice > 0 && unit ? { unitPrice, unit } : {}),
  };
}

export function sanitizeCompare(raw: unknown): CompareItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CompareItem[] = [];
  for (const r of raw) {
    const item = sanitizeCompareItem(r);
    if (item && !out.some((x) => x.key === item.key) && out.filter((x) => x.kind === item.kind).length < COMPARE_MAX) out.push(item);
  }
  return out;
}

/** Add an item (it replaces an older copy of itself); `full` when that kind already holds COMPARE_MAX others. */
export function addToCompare(list: readonly CompareItem[], item: CompareItem): { list: CompareItem[]; full: boolean } {
  const rest = list.filter((x) => x.key !== item.key);
  if (rest.filter((x) => x.kind === item.kind).length >= COMPARE_MAX) return { list: [...list], full: true };
  const at = list.findIndex((x) => x.key === item.key);
  if (at >= 0) return { list: list.map((x) => (x.key === item.key ? item : x)), full: false };
  return { list: [...rest, item], full: false };
}

export const removeFromCompare = (list: readonly CompareItem[], key: string): CompareItem[] => list.filter((x) => x.key !== key);
export const inCompare = (list: readonly CompareItem[], key: string): boolean => list.some((x) => x.key === key);

export interface CompareRow {
  id: string;
  label: string;
  /** "kcal", "g", "£", "g for £1". */
  unit: string;
  /** Indented under the row above ("of which sugars"). */
  sub?: boolean;
  values: Array<number | null>;
  /** Positions of the highest and lowest value (only when at least two items have a figure and they differ). */
  highest: number[];
  lowest: number[];
}

const NUTRIENT_ROWS: ReadonlyArray<{ id: keyof CompareNumbers; label: string; unit: string; sub?: boolean }> = [
  { id: "kcal", label: tk("Calories"), unit: "kcal" },
  { id: "protein", label: tk("Protein"), unit: "g" },
  { id: "carbs", label: tk("Carbohydrate"), unit: "g" },
  { id: "sugars", label: tk("of which sugars"), unit: "g", sub: true },
  { id: "fat", label: tk("Fat"), unit: "g" },
  { id: "saturates", label: tk("of which saturates"), unit: "g", sub: true },
  { id: "fibre", label: tk("Fibre"), unit: "g" },
  { id: "salt", label: tk("Salt"), unit: "g" },
];

function extremes(values: ReadonlyArray<number | null>): { highest: number[]; lowest: number[] } {
  const known = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  if (known.length < 2) return { highest: [], lowest: [] };
  const max = Math.max(...known.map((x) => x[0]));
  const min = Math.min(...known.map((x) => x[0]));
  if (max === min) return { highest: [], lowest: [] };
  return { highest: known.filter((x) => x[0] === max).map((x) => x[1]), lowest: known.filter((x) => x[0] === min).map((x) => x[1]) };
}

/** Price per kg or litre, as the shop printed it, when it matches the label's basis (per kg for per 100 g, per litre for per 100 ml). */
export function pricePerKgOrLitre(item: Pick<CompareItem, "basis" | "unitPrice" | "unit">): number | null {
  if (item.unitPrice === undefined) return null;
  if ((item.basis === "g" && item.unit === "per kg") || (item.basis === "ml" && item.unit === "per litre")) return item.unitPrice;
  return null;
}

/** Grams of protein £1 buys: protein per 100 g x 10 (per kg) / the shop's price per kg. Only from figures shown; null otherwise. */
export function proteinForAPound(item: Pick<CompareItem, "basis" | "unitPrice" | "unit" | "numbers">): number | null {
  const perKg = pricePerKgOrLitre(item);
  const p = item.numbers.protein;
  if (perKg === null || perKg <= 0 || p === null) return null;
  return Math.round(((p * 10) / perKg) * 10) / 10;
}

/** The rows to show for these items (all of one kind): every nutrient at least one of them has, then, for food, the price rows any of them has. */
export function compareRows(items: readonly CompareItem[]): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const r of NUTRIENT_ROWS) {
    const values = items.map((i) => i.numbers[r.id]);
    if (values.every((v) => v === null)) continue;
    rows.push({ ...r, values, ...extremes(values) });
  }
  if (items.some((i) => i.kind === "food")) {
    const perKg = items.map(pricePerKgOrLitre);
    if (perKg.some((v) => v !== null)) {
      const label = items.every((i) => i.basis === "ml") ? tk("Price per litre") : items.every((i) => i.basis === "g") ? tk("Price per kg") : tk("Price per kg or litre");
      rows.push({ id: "perKg", label, unit: "£", values: perKg, ...extremes(perKg) });
    }
    const pound = items.map(proteinForAPound);
    if (pound.some((v) => v !== null)) rows.push({ id: "proteinPound", label: tk("Protein for £1"), unit: "g", values: pound, ...extremes(pound) });
  }
  return rows;
}

/** True when the foods compared don't share one basis (some per 100 g, some per 100 ml), or some labels are for the cooked food: the screen says so. */
export function mixedBasis(items: readonly CompareItem[]): boolean {
  const foods = items.filter((i) => i.kind === "food");
  return new Set(foods.map((i) => i.basis)).size > 1 || (foods.some((i) => i.note) && foods.some((i) => !i.note));
}
