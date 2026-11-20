import type { OffProduct } from "./barcodes";
import { forRetailer, photoSources, type ListedProduct, type PhotoSource } from "./groceries";
import { tk } from "./i18n";
import { halfUp } from "./nutrients";
import { toAsciiDigits } from "./numbers";
import { packLabel, shopPhotoSources, type ShopFile, type ShopProduct } from "./shopProducts";
import type { LogMeal, Nutrients } from "./types";

// The "Add food" sheet on Home's meal rows (founder 2026-10-15, on the + beside Breakfast: "a kind of menu vibe sheet should launch where you can
// either type in macros, choose a recipe perhaps, choose a meal from a restaurant or whatever"). Pure rules for what it adds. Nothing here
// invents a number: typed numbers are the person's own, a recipe's are the recipe page's own per-serving figures, a supermarket product's
// are its label scaled by the weight the person says they had (plain arithmetic, like the recipes), a restaurant dish's are the restaurant's.

/** The sheet's title and its button, and the line shown after: one whole sentence per meal so a translation can inflect the meal's name. */
export const ADD_TO: Record<LogMeal, string> = { breakfast: tk("Add to Breakfast"), lunch: tk("Add to Lunch"), dinner: tk("Add to Dinner"), snack: tk("Add to Snacks") };
/** The meal a sheet adds to, said at its top: not the same words as its Add button (usability test 2026-11-19: George saw "Add to Breakfast" twice and tapped the label). */
export const FOR_MEAL: Record<LogMeal, string> = { breakfast: tk("For breakfast"), lunch: tk("For lunch"), dinner: tk("For dinner"), snack: tk("For snacks") };
export const ADDED_TO: Record<LogMeal, string> = {
  breakfast: tk("Added “{name}” to Breakfast."),
  lunch: tk("Added “{name}” to Lunch."),
  dinner: tk("Added “{name}” to Dinner."),
  snack: tk("Added “{name}” to Snacks."),
};

/** The most calories one typed entry can hold, and the most grams of protein, carbs or fat: a slip of the finger (an extra zero) is caught, a big day isn't. */
export const MAX_TYPED_KCAL = 5000;
export const MAX_TYPED_GRAMS = 1000;
/** The longest name kept for an entry. */
export const MAX_NAME_LENGTH = 60;

/**
 * One typed box. Empty = null (not entered), a number written with a point or a comma = that number, anything else = "bad". Digits typed in
 * another numeral system count (an Arabic or Urdu keyboard). A comma is a thousands separator when it groups three digits after a first group
 * that doesn't start with 0 ("1,234" is 1234, as written in the UK); otherwise it is the decimal point ("12,5" is 12.5, "0,125" is 0.125).
 */
export function parseNumber(raw: string): number | null | "bad" {
  let s = toAsciiDigits(raw).replace(/[\s\u00a0]/g, "").replace(/\u066b/g, ".");
  if (s === "") return null;
  s = /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return "bad";
  const n = Number(s);
  return Number.isFinite(n) ? n : "bad";
}

export type TypedField = "calories" | "protein" | "carbs" | "fat";
export interface TypedInput { name: string; calories: string; protein: string; carbs: string; fat: string }
export type TypedResult =
  | { ok: true; name: string; nutrients: Nutrients }
  | { ok: false; field: TypedField; problem: "missing" | "bad" | "toobig" };

/**
 * The numbers a person typed as one entry. Calories are needed (0 is fine: black coffee); protein, carbs and fat may be left empty, and then the
 * entry simply has no figure for them (never 0). `fallbackName` is used when no name was typed.
 */
export function typedEntry(input: TypedInput, fallbackName: string): TypedResult {
  const kcal = parseNumber(input.calories);
  if (kcal === null) return { ok: false, field: "calories", problem: "missing" };
  if (kcal === "bad" || kcal < 0) return { ok: false, field: "calories", problem: "bad" };
  if (kcal > MAX_TYPED_KCAL) return { ok: false, field: "calories", problem: "toobig" };
  const nutrients: Nutrients = { calories: halfUp(kcal) };
  for (const field of ["protein", "carbs", "fat"] as const) {
    const v = parseNumber(input[field]);
    if (v === null) continue;
    if (v === "bad") return { ok: false, field, problem: "bad" };
    if (v > MAX_TYPED_GRAMS) return { ok: false, field, problem: "toobig" };
    nutrients[field] = halfUp(v, 1);
  }
  return { ok: true, name: input.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH) || fallbackName, nutrients };
}

// ---- a supermarket product, by weight

/** The shortest and longest amount (grams or millilitres) that can be added. */
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 5000;

/** A label's figures per 100 g or 100 ml (a ListedProduct has these). */
export interface PerHundred {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  saturates?: number;
  sugars?: number;
  fibre?: number;
  salt?: number;
  kj?: number;
}

/** What the person had, from a label's per-100 figures: figure x amount / 100 (a figure the label doesn't print stays absent). Calories whole, grams to 1 place, salt to 2. */
export function amountNutrients(p: PerHundred, amount: number): Nutrients {
  const f = amount / 100;
  const n: Nutrients = {
    calories: halfUp(p.kcal * f),
    protein: halfUp(p.protein * f, 1),
    carbs: halfUp(p.carbs * f, 1),
    fat: halfUp(p.fat * f, 1),
  };
  if (p.saturates !== undefined) n.saturatedFat = halfUp(p.saturates * f, 1);
  if (p.sugars !== undefined) n.sugar = halfUp(p.sugars * f, 1);
  if (p.fibre !== undefined) n.fiber = halfUp(p.fibre * f, 1);
  if (p.salt !== undefined) n.salt = halfUp(p.salt * f, 2);
  if (p.kj !== undefined) n.energyKj = halfUp(p.kj * f);
  return n;
}

/** The amount typed for a product: a whole or part number of grams or millilitres between MIN_AMOUNT and MAX_AMOUNT, else null. */
export function parseAmount(raw: string): number | null {
  const v = parseNumber(raw);
  return typeof v === "number" && v >= MIN_AMOUNT && v <= MAX_AMOUNT ? v : null;
}

// ---- a recipe, by servings

export const MIN_SERVINGS = 0.5;
export const MAX_SERVINGS = 6;
export const SERVINGS_STEP = 0.5;

/** One step up (+1) or down (-1) in the servings eaten, kept between half a serving and six. */
export function stepServings(current: number, direction: 1 | -1): number {
  const next = Math.round((current + direction * SERVINGS_STEP) / SERVINGS_STEP) * SERVINGS_STEP;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, next));
}

/** The recipe page's per-serving figures (RecipeTotals) for the servings eaten; the rest of the label only where every product printed it. */
export function recipeNutrients(
  totals: { perServing: { kcal: number; protein: number; carbs: number; fat: number }; label: { kj: number | null; saturates: number | null; sugars: number | null; fibre: number | null; salt: number | null } },
  servings: number,
): Nutrients {
  const { perServing: s, label: l } = totals;
  const n: Nutrients = {
    calories: halfUp(s.kcal * servings),
    protein: halfUp(s.protein * servings, 1),
    carbs: halfUp(s.carbs * servings, 1),
    fat: halfUp(s.fat * servings, 1),
  };
  if (l.saturates !== null) n.saturatedFat = halfUp(l.saturates * servings, 1);
  if (l.sugars !== null) n.sugar = halfUp(l.sugars * servings, 1);
  if (l.fibre !== null) n.fiber = halfUp(l.fibre * servings, 1);
  if (l.salt !== null) n.salt = halfUp(l.salt * servings, 2);
  if (l.kj !== null) n.energyKj = halfUp(l.kj * servings);
  return n;
}

// ---- one product shape for "How much did you have?" (founder 2026-11-20: scan a barcode, see the product, add it to the food diary)

/** Where a product's numbers come from, said under them as the product pages say it. */
export type LabelSource =
  | { kind: "shop"; shop: string }
  | { kind: "same"; shop: string }
  | { kind: "community" }
  | { kind: "government"; food: string };

/** A supermarket product as the "How much did you have?" step uses it, whether from a shop's full list or the older barcode catalogue. */
export interface LoggableProduct {
  /** Unique in a list of picks. */
  key: string;
  name: string;
  /** The supermarket it is from (its name goes on Today's row), or null when that isn't known. */
  shop: string | null;
  per: "g" | "ml";
  /** "" when the numbers are for the food as sold; else the word the label's heading adds ("grilled", "prepared"). */
  state: string;
  /** The label's figures per 100 g or ml (a figure the label doesn't print is absent). */
  label: PerHundred;
  source: LabelSource;
  /** The pack size as printed ("400g", "4 x 125g"), or "". */
  size: string;
  /** One portion as the label prints it ("40g", "1 bar (45g)"), or "". */
  portion: string;
  /** Its pictures, best first (the first one fit to keep goes with the entry, as a shopping list item keeps one). */
  photos: PhotoSource[];
  /** The brand, where the record names one (Open Food Facts): said above the name when no shop is known. */
  brand?: string;
  /** Its barcode as printed, where known (the Open Food Facts credit links to its record there). */
  code?: string;
}

/** A shop list's per-100 figures (null where the page printed none) as a label (absent where not printed). */
export function perHundredFromShop(n: { kcal: number; protein: number; carbs: number; fat: number; saturates: number | null; sugars: number | null; fibre: number | null; salt: number | null; kj: number | null }): PerHundred {
  const out: PerHundred = { kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat };
  if (n.saturates !== null) out.saturates = n.saturates;
  if (n.sugars !== null) out.sugars = n.sugars;
  if (n.fibre !== null) out.fibre = n.fibre;
  if (n.salt !== null) out.salt = n.salt;
  if (n.kj !== null) out.kj = n.kj;
  return out;
}

/** The figures to add, as an amount of a product: grams or millilitres between MIN_AMOUNT and MAX_AMOUNT. */
const asAmount = (n: number, unit: "g" | "ml"): { amount: number; unit: "g" | "ml" } | null => (Number.isFinite(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT ? { amount: Math.round(n * 10) / 10, unit } : null);

/** A printed size or portion in grams or millilitres ("125g", "1.5 kg", "330 ml", "1 bar (45g)"), as one item; null when it gives no weight or volume. */
export function printedAmount(text: string): { amount: number; unit: "g" | "ml" } | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|g|grams?|ml|cl|l|ltr|litres?|liters?)\b/i.exec((text ?? "").replace(/(\d),(\d{3})\b/g, "$1$2"));
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const u = m[2]!.toLowerCase();
  if (u === "kg") return asAmount(n * 1000, "g");
  if (u === "g" || u.startsWith("gram")) return asAmount(n, "g");
  if (u === "ml") return asAmount(n, "ml");
  if (u === "cl") return asAmount(n * 10, "ml");
  return asAmount(n * 1000, "ml");
}

/** A pack size: one item ("400g") or a multipack ("4 x 125g", "6x330ml"), each item's amount and how many; null when the size gives no weight or volume. */
export function packAmounts(size: string): { each: number; count: number; unit: "g" | "ml" } | null {
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?\s*(?:kg|g|ml|cl|l|ltr|litres?|liters?)\b)/i.exec(size ?? "");
  if (multi) {
    const one = printedAmount(multi[2]!);
    const count = Number(multi[1]);
    return one && count >= 2 && count <= 48 ? { each: one.amount, count, unit: one.unit } : null;
  }
  const one = printedAmount(size ?? "");
  return one ? { each: one.amount, count: 1, unit: one.unit } : null;
}

/** The largest single pack offered as "The whole pack": more than this isn't eaten at one sitting (a 2 kg bag of chicken). */
export const MAX_WHOLE_PACK = 1000;

/** A one-tap amount on "How much did you have?". */
export type AmountChoice =
  | { kind: "portion"; amount: number }
  | { kind: "pack"; amount: number }
  | { kind: "item"; amount: number; count: number }
  | { kind: "hundred"; amount: 100 };

/**
 * The one-tap amounts, all from the label and the pack (nothing guessed): one portion where the label prints one in the label's own unit, one item of a multipack
 * ("1 of 4 (125 g)") or the whole of a single pack up to MAX_WHOLE_PACK, and 100 g or ml. Each amount once.
 */
export function amountChoices(p: Pick<LoggableProduct, "per" | "size" | "portion">): AmountChoice[] {
  const out: AmountChoice[] = [];
  const portion = p.portion ? printedAmount(p.portion) : null;
  if (portion && portion.unit === p.per) out.push({ kind: "portion", amount: portion.amount });
  const pack = p.size ? packAmounts(p.size) : null;
  if (pack && pack.unit === p.per) {
    if (pack.count > 1) out.push({ kind: "item", amount: pack.each, count: pack.count });
    else if (pack.each <= MAX_WHOLE_PACK) out.push({ kind: "pack", amount: pack.each });
  }
  out.push({ kind: "hundred", amount: 100 });
  return out.filter((c, i) => out.findIndex((x) => x.amount === c.amount) === i);
}

/** The amount "How much?" starts with: one portion where the label prints one, else one item of a multipack (one sachet of ten), else 100 g or ml. */
export const startAmount = (p: Pick<LoggableProduct, "per" | "size" | "portion">): number => {
  const choices = amountChoices(p);
  return (choices.find((c) => c.kind === "portion") ?? choices.find((c) => c.kind === "item"))?.amount ?? 100;
};

/** "125 g", "37.5 ml": an amount as the entry's name and the screen say it. */
export const amountText = (amount: number, unit: "g" | "ml"): string => `${Math.round(amount * 10) / 10} ${unit}`;

/** What adding `amount` of a product to the food diary adds: its name with the amount, the label's figures times the amount (absent stays absent), the shop. */
export function productEntry(p: Pick<LoggableProduct, "name" | "label" | "per">, amount: number, shopName: string): { chainId: string; chainName: string; name: string; nutrients: Nutrients; source: "product" } {
  return { chainId: "", chainName: shopName, name: `${p.name} (${amountText(amount, p.per)})`, nutrients: amountNutrients(p.label, amount), source: "product" };
}

/** A product from a shop's full list, ready for "How much did you have?"; null when we have no numbers for it (nothing is guessed). */
export function loggableFromShop(file: Pick<ShopFile, "retailer" | "photoBase" | "photoTemplate">, p: ShopProduct): LoggableProduct | null {
  const n = p.nutrition;
  if (!n) return null;
  const source: LabelSource = n.govFood ? { kind: "government", food: n.govFood } : n.community ? { kind: "community" } : n.sameAs ? { kind: "same", shop: n.sameAs } : { kind: "shop", shop: file.retailer };
  return { key: `${file.retailer}:${p.id}`, name: p.name, shop: file.retailer, per: n.per, state: n.state, label: perHundredFromShop(n), source, size: packLabel(p.name) ?? "", portion: "", photos: shopPhotoSources(file, p) };
}

/** A product from the older barcode catalogue, as `prefer`'s record of it where that shop has one: the shop's own page's numbers where it read them, else the
 *  community record for the barcode (said so). */
export function loggableFromListed(listed: ListedProduct, prefer: string | null): LoggableProduct {
  const p = forRetailer(listed, prefer);
  const shop = prefer && listed.retailers.includes(prefer) ? prefer : listed.retailers.length === 1 ? listed.retailers[0]! : null;
  const label: PerHundred = { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat };
  for (const k of ["saturates", "sugars", "fibre", "salt", "kj"] as const) if (typeof p[k] === "number") label[k] = p[k];
  const own = prefer && listed.byRetailer[prefer] ? prefer : listed.retailers[0] ?? "";
  return { key: `code:${listed.gtin}`, name: p.name, shop, per: p.per, state: "", label, source: p.source === "retailer" ? { kind: "shop", shop: own } : { kind: "community" }, size: p.size, portion: p.serving?.size ?? "", photos: photoSources(p, prefer), code: listed.gtin };
}

/**
 * A product Open Food Facts holds and none of our lists does (our API, GET /api/v1/barcode/{code}), ready for "How much did you have?"; null when it has no figures
 * we'd add (lib/mm/barcodes.ts offLabel left them out). Community numbers, said so on screen. `unnamed`: the name to use when the record has none.
 */
export function loggableFromOff(p: OffProduct, unnamed: string): LoggableProduct | null {
  if (!p.label) return null;
  const label: PerHundred = { ...p.label };
  return {
    key: `off:${p.code}`, name: p.name || unnamed, shop: null, per: p.per, state: "", label, source: { kind: "community" }, size: p.quantity, portion: p.serving,
    photos: p.image ? [{ src: p.image, from: "off", shop: "" }] : [], brand: p.brand, code: p.code,
  };
}

/**
 * One tap of − or + on "How much?": 5 at a time below 50, 10 up to 500, 50 above, landing on a round amount (37 then + is 40, − is 35), kept between MIN_AMOUNT and
 * MAX_AMOUNT. From nothing typed, + is the first step and − stays at the least.
 */
export function stepAmount(current: number | null, direction: 1 | -1): number {
  if (current === null || !Number.isFinite(current)) return direction === 1 ? 5 : MIN_AMOUNT;
  const size = (v: number) => (v < 50 ? 5 : v < 500 ? 10 : 50);
  // the step is the one for where the amount is going: down from 50 is 45, up from 45 is 50
  const step = direction === 1 ? size(current) : size(current - 0.001);
  const next = direction === 1 ? Math.floor(current / step + 1e-9) * step + step : Math.ceil(current / step - 1e-9) * step - step;
  return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, next));
}

/** Each macro's share of the grams of protein, carbs and fat (for the ring), 0 to 1, adding to 1; all 0 when there are none. */
export function macroShares(n: Pick<Nutrients, "protein" | "carbs" | "fat">): { protein: number; carbs: number; fat: number } {
  const p = Math.max(0, n.protein ?? 0);
  const c = Math.max(0, n.carbs ?? 0);
  const f = Math.max(0, n.fat ?? 0);
  const all = p + c + f;
  return all > 0 ? { protein: p / all, carbs: c / all, fat: f / all } : { protein: 0, carbs: 0, fat: 0 };
}

/** The same product's numbers from a shop's label, in place of a catalogue record's (2026-11-20: the shop's own label always wins over community numbers). */
export function withShopLabel(p: LoggableProduct, from: LoggableProduct): LoggableProduct {
  return from.source.kind === "shop" || from.source.kind === "same" ? { ...p, per: from.per, state: from.state, label: from.label, source: from.source, portion: from.per === p.per ? p.portion : "" } : p;
}
