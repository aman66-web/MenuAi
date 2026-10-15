import { PANTRY, kindExcluded, kindForDiet, type DietPrefs, type IngredientMatch, type IngredientRole, type PantryKind } from "./pantry";
import { normalizeForSearch } from "./search";
import { hasPrice, type PricedProduct, type ShopProduct } from "./shopProducts";

export type { IngredientMatch } from "./pantry";

// Recipes from the shop you use (founder 2026-10-10: "craft recipes based on where you shop"). Each recipe is ours (the dish, the
// amounts and the method) or written by Pip with AI from the same pantry, but every number shown comes from the supermarket's own listing:
// the price, the price per kg or litre, and the nutrition its product page prints per 100 g or ml. Nothing is estimated: an ingredient is
// matched only to products whose label numbers are for the food as sold, in the recipe's unit, and inside a plausible range for that form
// (dry pasta is not cooked pasta), and totals are plain arithmetic on those labels for the amounts in the recipe. Fitting a recipe to
// someone's calories and protein changes only the amounts (protein and carb ingredients, and what is made in proportion to them, such as the
// milk for porridge oats; rounded to 5 g or to whole pieces); the numbers are then worked out again from the labels. Blurbs describe the dish,
// never make a nutrition or health claim (CLAUDE.md rule 3). Pure and unit-tested.

export interface IngredientSpec {
  key: string;
  label: string;
  amount: number;
  unit: "g" | "ml";
  /** Shown after the amount ("uncooked", "about 4 eggs"). */
  note?: string;
  /** The amount is the drained weight: only products whose label is per 100 g drained (or that are sold ready-drained) count. */
  drained?: boolean;
  match: IngredientMatch;
  /** What it does when the recipe is fitted to someone's numbers (default "other": stays as written). */
  role?: IngredientRole;
  /** When the recipe is fitted, this ingredient moves by the same factor as the one with this key, whatever its own role: the milk for porridge
   *  follows the oats, the egg that binds fishcakes follows the potato, so the dish keeps its proportions. */
  follows?: string;
  /** How far fitting may move it, as a factor of the written amount (default: half to double). [1, 1] keeps it as written. */
  fit?: [number, number];
  /** The pantry kind it comes from (diet checks and halal products use it). */
  pantry?: string;
  /** Kinds that can stand in for it, best first (factor scales the amount). */
  subs?: Array<{ key: string; factor?: number }>;
  /** Set on a substitute: the label of the ingredient it stands in for. */
  subFor?: string;
  /** Set when the person chose this substitute: the ingredient as the recipe has it. */
  original?: IngredientSpec;
  /** A store-cupboard item (spices, oil, salt): the recipe page offers "You may have this already". */
  cupboard?: boolean;
  /** Its label may be one we haven't read: then it is listed and priced but not counted in the nutrition (and named as such). */
  labelOptional?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  blurb: string;
  servings: number;
  minutes: number;
  ingredients: IngredientSpec[];
  method: string[];
  /** Old field, kept for recipes saved before 2026-10-11: everything a recipe uses is now an ingredient (listed, priced and counted). */
  extras?: string[];
  /** Written by Pip with AI (shown with its own caution). */
  ai?: boolean;
  /** Which meal it suits (for browsing). */
  meal?: MealType;
  /** A few words to browse by ("Italian", "Batch cook"). */
  tags?: string[];
  /** Set by recipeForDiet for halal: substitutes use halal-named meat too. */
  halal?: boolean;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export const MEAL_TYPES: ReadonlyArray<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
];

/** An ingredient from the pantry: amount in the kind's unit; role, note, label and substitutes can be changed for this recipe. */
export function ing(key: string, amount: number, opts: IngOpts = {}): IngredientSpec {
  const k = PANTRY.get(key);
  if (!k) throw new Error(`unknown pantry kind ${key}`);
  return specFromKind(k, amount, opts);
}

export interface IngOpts {
  role?: IngredientRole;
  note?: string;
  label?: string;
  /** Replaces the kind's usual substitutes (keys, or [key, factor]); [] for none. */
  subs?: Array<string | [string, number]>;
  /** Moves with this other ingredient when the recipe is fitted (see IngredientSpec.follows). */
  follows?: string;
  /** How far fitting may move it (replaces the kind's own limit). */
  fit?: [number, number];
  /** Words a product's name should have, for this recipe (replaces the kind's own preference: linguine for a linguine recipe). */
  prefer?: string[];
}

export function specFromKind(k: PantryKind, amount: number, opts: IngOpts = {}): IngredientSpec {
  const subs = opts.subs ? opts.subs.map((x) => (typeof x === "string" ? { key: x } : { key: x[0], factor: x[1] })) : k.subs;
  const fit = opts.fit ?? k.fit;
  // a kind used by the piece says how many when the recipe doesn't ("about 2 wraps", "about 1 stock cube")
  const note = opts.note ?? (k.drained ? "drained" : k.note) ?? countNote(k, amount);
  return {
    key: k.key, pantry: k.key, label: opts.label ?? k.label, amount, unit: k.unit, match: opts.prefer ? { ...k.match, prefer: opts.prefer } : k.match, role: opts.role ?? k.role,
    ...(opts.follows ? { follows: opts.follows } : {}),
    ...(fit ? { fit } : {}),
    ...(subs?.length ? { subs } : {}),
    ...(k.drained ? { drained: true } : {}),
    ...(k.cupboard ? { cupboard: true } : {}),
    ...(k.labelOptional ? { labelOptional: true } : {}),
    ...(note ? { note } : {}),
  };
}

/** "about 2 eggs" for an amount of a kind used by the piece; undefined when it has no pieces, or for produce used in parts when the amount isn't
 *  close to a whole number of them (half a cucumber is not "about 1 cucumber"). */
function countNote(k: PantryKind, amount: number): string | undefined {
  if (!k.pieceGrams || !k.pieceName) return undefined;
  const n = Math.round(amount / k.pieceGrams);
  if (n < 1 || (k.cut && Math.abs(amount - n * k.pieceGrams) > k.pieceGrams / 4)) return undefined;
  return `about ${n} ${n === 1 ? k.pieceName[0] : k.pieceName[1]}`;
}

const GLOBAL_NONE = ["meal", "sandwich", "kit", "gift", "hamper", "soup", "chowder", "broth"];
const MEAT_WORDS = ["chicken", "beef", "pork", "lamb", "turkey", "bacon", "ham", "sausage", "salmon", "tuna", "prawn", "fish", "anchov", "chorizo", "pepperoni", "cod"];

// ---- diet

/** The recipe has no meat or fish in it, by its pantry kinds (an ingredient without one can't be known, so the answer is no). */
export function isMeatFree(recipe: Recipe): boolean {
  return recipe.ingredients.every((i) => {
    const k = i.pantry ? PANTRY.get(i.pantry) : undefined;
    return !!k && !k.meat && !k.fish;
  });
}

/** Nothing in the recipe comes from an animal, by the app's own diet rules (the same ones as a vegan diet in Settings). */
export function isVegan(recipe: Recipe): boolean {
  return recipeForDiet(recipe, { veganOnly: true }) !== null;
}

/** "Quick" on the Recipes page: ready in this many minutes or less, as the recipe says, and not left to soak, chill or freeze for a while
 *  first (a recipe's minutes are the time spent making it, so overnight oats take 5). */
export const QUICK_MINUTES = 20;
const WAITS = /\b(?:overnight|chill for|freeze for)\b/i;
export const isQuick = (recipe: Pick<Recipe, "minutes"> & { method?: readonly string[] }): boolean =>
  recipe.minutes <= QUICK_MINUTES && !(recipe.method ?? []).some((step) => WAITS.test(step));

/** The recipe as these preferences need it (halal meat products), or null when one of its ingredients is left out for them. */
export function recipeForDiet(recipe: Recipe, prefs: DietPrefs): Recipe | null {
  const out: IngredientSpec[] = [];
  for (const i of recipe.ingredients) {
    const k = i.pantry ? PANTRY.get(i.pantry) : undefined;
    if (!k) { out.push(i); continue; }
    if (kindExcluded(k, prefs) !== null) return null;
    const d = kindForDiet(k, prefs);
    // substitutes that don't suit the diet are never offered
    const subs = i.subs?.filter((x) => { const sk = PANTRY.get(x.key); return !!sk && kindExcluded(sk, prefs) === null; });
    const spec: IngredientSpec = { ...i, ...(d === k ? {} : { label: d.label, match: d.match }) };
    if (subs?.length) spec.subs = subs;
    else delete spec.subs;
    out.push(spec);
  }
  return { ...recipe, ingredients: out, ...(prefs.halalOnly ? { halal: true } : {}) };
}

/** A substitute for an ingredient, as an ingredient of the same recipe (same key, so product choices and fitting follow it). */
export function subSpec(spec: IngredientSpec, sub: { key: string; factor?: number }, halal = false): IngredientSpec | null {
  const kind = PANTRY.get(sub.key);
  if (!kind) return null;
  const k = halal ? kindForDiet(kind, { halalOnly: true }) : kind;
  const amount = Math.max(5, Math.round((spec.amount * (sub.factor ?? 1)) / 5) * 5);
  // it takes the ingredient's place in the dish, so it moves the way the ingredient did when the recipe is fitted
  const place = { role: spec.role, ...(spec.follows ? { follows: spec.follows } : {}), ...(spec.fit ? { fit: spec.fit } : {}) };
  return { ...specFromKind(k, amount, place), key: spec.key, subFor: spec.subFor ?? spec.label };
}

/** The recipe with the person's choices of substitute (ingredient key → substitute kind key) put in. */
export function withSubstitutes(recipe: Recipe, choices: Readonly<Record<string, string>>): Recipe {
  if (!Object.keys(choices).length) return recipe;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((spec) => {
      const sub = spec.subs?.find((x) => x.key === choices[spec.key]);
      const s2 = sub ? subSpec(spec, sub, recipe.halal) : null;
      return s2 ? { ...s2, subs: spec.subs, original: spec } : spec;
    }),
  };
}

// ---- matching ----

const hayCache = new WeakMap<object, string>();
const hay = (p: ShopProduct): string => {
  let h = hayCache.get(p);
  if (h === undefined) {
    h = ` ${normalizeForSearch(p.name)} `;
    hayCache.set(p, h);
  }
  return h;
};
/** A word (or phrase) that starts a word in the name: "ham" is not in "graham", "pea" is in "peas". */
const has = (h: string, word: string) => h.includes(` ${normalizeForSearch(word)}`);

/** The pack's own weight or volume from its name ("320g", "1kg", "1.13L", "4x125g", "1 Pint"), in g or ml; null when the name doesn't say.
 *  A drained weight in brackets ("400g (240g*)", "4x125g (102g Drained)") is skipped here: see drainedSize. */
export function packSize(name: string, unit: "g" | "ml"): number | null {
  const n = name.toLowerCase().replace(/\([^)]*(?:\*|drained)[^)]*\)/g, " ");
  const toBase = (v: number, u: string): number | null => {
    if (unit === "g") return u === "kg" ? v * 1000 : u === "g" ? v : null;
    if (u.startsWith("pint")) return v * 568;
    return u === "l" || u.startsWith("litre") ? v * 1000 : u === "ml" ? v : null;
  };
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres)\b/.exec(n);
  if (multi) {
    const each = toBase(Number(multi[2]), multi[3]!);
    if (each) return Number(multi[1]) * each;
  }
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres|pints?)\b/g)) {
    const v = toBase(Number(m[1]), m[2]!);
    if (v && v > 0) return v;
  }
  return null;
}

/** The drained weight of a can or carton in grams: printed in its name ("(240g*)", "(102g Drained)" per can, "(4x102g Drained)"),
 *  else the quantity the shop's own price per kg is for (the shop prices canned food by drained weight), else the name's pack weight. */
export function drainedSize(product: Pick<PricedProduct, "name" | "price" | "unitPrice" | "unit">): number | null {
  const n = product.name.toLowerCase();
  const d = /\((?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g)\s*(?:\*|drained)\s*\)/.exec(n);
  if (d) {
    const each = Number(d[2]) * (d[3] === "kg" ? 1000 : 1);
    const count = d[1] ? Number(d[1]) : Number(/(\d+)\s*[x×]\s*\d/.exec(n.slice(0, d.index))?.[1] ?? 1);
    return count * each;
  }
  if (product.unit === "per kg" && product.unitPrice) return Math.round((product.price / product.unitPrice) * 1000);
  return packSize(product.name, "g");
}

export interface IngredientPick {
  spec: IngredientSpec;
  product: PricedProduct;
  /** Packs to buy for the recipe's amount (1 when the pack size isn't printed in its name). */
  packs: number;
  /** For a product sold one at a time (a pepper, an onion): how many whole ones the recipe uses. */
  pieces?: number;
  /** What those packs cost at the shelf price. */
  basketCost: number;
  /** What the amount used costs at the shop's own price per kg or litre (null when the shop prints no such price). */
  usedCost: number | null;
}

/** How many items a pack of things sold one at a time holds ("Limes x5", "4 x Unwaxed Lemons", "Brown Onions x3"); 1 when the name says none. */
export function itemCount(name: string): number {
  const m = /(?:\bx\s*(\d+)\b|\b(\d+)\s*x\s+(?=[a-z]))/i.exec(name);
  const n = Number(m?.[1] ?? m?.[2] ?? 1);
  return n >= 1 && n <= 48 ? n : 1;
}

/** How many a pack sold by the item holds: as its name says, else the shelf price over the shop's own price each ("Weetabix 12 Original
 *  Cereal Pack": £2 at 17p each is 12). */
function itemsInPack(product: Pick<PricedProduct, "name" | "price" | "unitPrice">): number {
  const named = itemCount(product.name);
  if (named > 1 || !product.unitPrice) return named;
  const n = Math.round(product.price / product.unitPrice);
  return n >= 1 && n <= 96 ? n : 1;
}

/** The weight of one piece of a pack of pieces, from its name: "4x20g" or "6 x Wraps 367g" or "Cubes x12 71g"; null when the name doesn't give both. */
export function pieceWeight(name: string): number | null {
  const n = name.toLowerCase();
  const each = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g)\b/.exec(n);
  if (each) return Number(each[2]) * (each[3] === "kg" ? 1000 : 1);
  const count = itemCount(name);
  const size = packSize(name, "g");
  return count > 1 && size ? Math.round((size / count) * 10) / 10 : null;
}

export function pickFor(spec: IngredientSpec, product: PricedProduct): IngredientPick {
  const size = spec.drained ? drainedSize(product) : packSize(product.name, spec.unit);
  const perKgOrLitre = product.unitPrice !== null && (spec.unit === "g" ? product.unit === "per kg" : product.unit === "per litre");
  // Loose produce is priced by the kilo and you buy only what you use.
  if (perKgOrLitre && /\bloose\b/i.test(product.name) && product.price === product.unitPrice) {
    const used = (product.unitPrice! * spec.amount) / 1000;
    return { spec, product, packs: 1, basketCost: used, usedCost: used };
  }
  // Sold one at a time (a pepper, a cucumber, a pack of 3 onions): the recipe uses whole items, each at the shop's own price each.
  const kind = spec.pantry ? PANTRY.get(spec.pantry) : undefined;
  if (!size && product.unit === "each" && product.unitPrice !== null && kind?.pieceGrams && spec.unit === "g") {
    const pieces = Math.max(1, Math.ceil(spec.amount / kind.pieceGrams - 1e-9));
    const packs = Math.max(1, Math.ceil(pieces / itemsInPack(product)));
    return { spec, product, packs, pieces, basketCost: packs * product.price, usedCost: pieces * product.unitPrice };
  }
  // no weight in the name but a price per kg or litre: the shelf price is for (price ÷ price per kg) of it ("Small Whole Cucumber": 70p at £3.89/kg)
  const sized = size ?? (perKgOrLitre && product.unitPrice! > 0 ? Math.round((product.price / product.unitPrice!) * 1000) : null);
  const packs = sized ? Math.max(1, Math.ceil(spec.amount / sized - 1e-9)) : 1;
  const usedCost = perKgOrLitre ? (product.unitPrice! * spec.amount) / 1000 : sized ? (product.price * spec.amount) / sized : null;
  return { spec, product, packs, basketCost: packs * product.price, usedCost };
}

/** Products at the shop that can stand for this ingredient, cheapest basket first (then price per kg/litre, then name). */
// Which products match a kind depends only on the kind's rules, so it is worked out once per shop list (100 recipes would otherwise scan
// the whole list hundreds of times).
const matchCache = new WeakMap<readonly ShopProduct[], Map<string, PricedProduct[]>>();

function matching(products: readonly ShopProduct[], spec: IngredientSpec, meatFree: boolean): PricedProduct[] {
  let byRule = matchCache.get(products);
  if (!byRule) { byRule = new Map(); matchCache.set(products, byRule); }
  const rule = JSON.stringify([spec.match, spec.unit, !!spec.drained, meatFree]);
  const cached = byRule.get(rule);
  if (cached) return cached;
  const m = spec.match;
  const list: PricedProduct[] = [];
  for (const p of products) {
    if (!hasPrice(p)) continue; // a recipe prices every ingredient: a product the shop shows no price for can't be used
    const n = p.nutrition;
    const h = hay(p);
    if (n) {
      if (n.per !== spec.unit) continue;
      // the label must be for the food as the recipe weighs it: as sold, or (for a drained amount) per 100 g drained or a product sold ready-drained
      if (!(n.state === "" ? !spec.drained || has(h, "drained") || has(h, "no drain") : spec.drained && n.state === "drained")) continue;
    } else if (!spec.labelOptional) continue; // a pinch of a spice whose label we haven't read may still be listed and priced (not counted)
    if (!m.all.every((w) => has(h, w))) continue;
    if (m.any && !m.any.some((w) => has(h, w))) continue;
    if ([...GLOBAL_NONE, ...(m.none ?? [])].some((w) => has(h, w))) continue;
    if (meatFree && MEAT_WORDS.some((w) => has(h, w))) continue;
    if (n && m.kcal && (n.kcal < m.kcal[0] || n.kcal > m.kcal[1])) continue;
    if (n && m.minProtein !== undefined && n.protein < m.minProtein) continue;
    if (n && m.maxFat !== undefined && n.fat > m.maxFat) continue;
    if (m.pieceWeight) {
      const w = pieceWeight(p.name);
      if (w === null || w < m.pieceWeight[0] || w > m.pieceWeight[1]) continue;
    }
    list.push(p);
  }
  byRule.set(rule, list);
  return list;
}

export function candidates(products: readonly ShopProduct[], spec: IngredientSpec, meatFree = false): IngredientPick[] {
  const out = matching(products, spec, meatFree).map((p) => pickFor(spec, p));
  // Products whose cost for the amount used can be worked out come first (a serving's price needs it), then labels we've read. Among those within
  // 50p of the cheapest basket, a product named the way the kind prefers comes first (spaghetti for spaghetti), then the label that prints the most
  // figures (so the full nutrition table isn't left blank for a few pence); then the cheapest basket.
  const ok = out.filter((c) => c.usedCost !== null && c.product.nutrition);
  const cheapest = ok.length ? Math.min(...ok.map((c) => c.basketCost)) : Infinity;
  const inBand = (c: IngredientPick) => !!c.product.nutrition && c.usedCost !== null && c.basketCost <= cheapest + 0.5;
  const prefer = spec.match.prefer;
  const unpreferred = (c: IngredientPick) => Number(!!prefer && inBand(c) && !prefer.some((w) => has(hay(c.product), w)));
  const gaps = (c: IngredientPick) => {
    const n = c.product.nutrition;
    if (!n || !inBand(c)) return 0;
    return 10 * [n.saturates, n.sugars, n.salt].filter((v) => v === null).length + Number(n.fibre === null);
  };
  return out.sort((a, b) => Number(a.usedCost === null) - Number(b.usedCost === null) || Number(!a.product.nutrition) - Number(!b.product.nutrition) || Number(!inBand(a)) - Number(!inBand(b)) || unpreferred(a) - unpreferred(b) || gaps(a) - gaps(b) || a.basketCost - b.basketCost || (a.product.unitPrice ?? Infinity) - (b.product.unitPrice ?? Infinity) || a.product.name.localeCompare(b.product.name, "en-GB"));
}

/** Whether this product, from the same shop's list, can stand for the ingredient (the very rules recipes use to pick products). */
export function productFits(products: readonly ShopProduct[], spec: IngredientSpec, product: ShopProduct, meatFree = false): boolean {
  return (matching(products, spec, meatFree) as readonly ShopProduct[]).includes(product);
}

/** Whether a name names this ingredient by its words alone (a product from another shop's list, or words the person typed). With `loose`
 *  (typed in: "chicken", "milk") only the ingredient's first word must be there; a product name needs all of them. Never used for numbers. */
export function nameFits(name: string, spec: IngredientSpec, loose = false): boolean {
  const h = ` ${normalizeForSearch(name)} `;
  const m = spec.match;
  if (!m.all.length) return false;
  if (loose ? !has(h, m.all[0]!) : !m.all.every((w) => has(h, w))) return false;
  if (!loose && m.any && !m.any.some((w) => has(h, w))) return false;
  return ![...GLOBAL_NONE, ...(m.none ?? [])].some((w) => has(h, w));
}

export interface ResolvedRecipe {
  recipe: Recipe;
  picks: Array<IngredientPick | null>;
  /** Every ingredient found at this shop. */
  complete: boolean;
}

/** The cheapest match for each ingredient, or a chosen product where the user swapped one (by product id). */
export function resolveRecipe(recipe: Recipe, products: readonly ShopProduct[], chosen: Readonly<Record<string, string>> = {}): ResolvedRecipe {
  const meatFree = isMeatFree(recipe);
  const picks = recipe.ingredients.map((spec) => {
    let list = candidates(products, spec, meatFree);
    // the shop doesn't sell this kind: use the first substitute it does sell (the pick's spec says which, so the screen can say so)
    for (const sub of list.length ? [] : spec.subs ?? []) {
      const s2 = subSpec(spec, sub, recipe.halal);
      const l2 = s2 ? candidates(products, s2, meatFree) : [];
      if (l2.length) { list = l2; break; }
    }
    return list.find((c) => c.product.id === chosen[spec.key]) ?? list[0] ?? null;
  });
  return { recipe, picks, complete: picks.every(Boolean) };
}

export interface RecipeTotals {
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  /** The rest of the label, per serving: null where any product's label doesn't print that figure (never filled in). */
  label: { kj: number | null; saturates: number | null; sugars: number | null; fibre: number | null; salt: number | null };
  /** The amounts used, at the shop's price per kg or litre, per serving (null if any ingredient has no such price). */
  costPerServing: number | null;
  /** Whole packs to buy (leaving out the cupboard items the person says they have). */
  basket: number;
  /** Ingredients whose label we haven't read: listed and priced, not counted in the nutrition (their labels, in recipe order). */
  notCounted: string[];
}

/** Plain arithmetic on the labels: per-100 figure × amount / 100, summed, divided by servings. Only for a complete recipe. `have` = pantry kinds the
 *  person says they already have (cupboard items): left out of the basket, never out of a serving's price or numbers. */
export function recipeTotals(r: ResolvedRecipe, have: ReadonlySet<string> = new Set()): RecipeTotals | null {
  if (!r.complete) return null;
  const notCounted: string[] = [];
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const more: Record<"kj" | "saturates" | "sugars" | "fibre" | "salt", number | null> = { kj: 0, saturates: 0, sugars: 0, fibre: 0, salt: 0 };
  let used = 0;
  let usedKnown = true;
  let basket = 0;
  for (const p of r.picks as IngredientPick[]) {
    if (p.usedCost === null) usedKnown = false;
    else used += p.usedCost;
    if (!(p.spec.cupboard && p.spec.pantry && have.has(p.spec.pantry))) basket += p.basketCost;
    const n = p.product.nutrition;
    if (!n) { notCounted.push(p.spec.label); continue; }
    const f = p.spec.amount / 100;
    sum.kcal += n.kcal * f;
    sum.protein += n.protein * f;
    sum.carbs += n.carbs * f;
    sum.fat += n.fat * f;
    for (const k of ["kj", "saturates", "sugars", "fibre", "salt"] as const) {
      const v = n[k];
      more[k] = v === null || more[k] === null ? null : more[k]! + v * f;
    }
  }
  const s = r.recipe.servings;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const per = (v: number | null, digits: number) => (v === null ? null : Math.round((v / s) * 10 ** digits) / 10 ** digits);
  return {
    perServing: { kcal: Math.round(sum.kcal / s), protein: round1(sum.protein / s), carbs: round1(sum.carbs / s), fat: round1(sum.fat / s) },
    label: { kj: per(more.kj, 0), saturates: per(more.saturates, 1), sugars: per(more.sugars, 1), fibre: per(more.fibre, 1), salt: per(more.salt, 2) },
    costPerServing: usedKnown ? Math.round((used / s) * 100) / 100 : null,
    basket: Math.round(basket * 100) / 100,
    notCounted,
  };
}

// ---- fitting a recipe to someone's numbers

/** What someone wants per serving: calories, and optionally protein (aim) and carbs or fat (no more than). */
export interface MealTarget {
  kcal: number;
  protein?: number;
  carbsMax?: number;
  fatMax?: number;
}

export interface FittedRecipe {
  /** The recipe with the fitted amounts (protein and carb ingredients moved, everything else as written). */
  recipe: Recipe;
  resolved: ResolvedRecipe;
  totals: RecipeTotals;
  /** False when nothing in the recipe can move (no protein or carb ingredient), so it is shown as written. */
  changed: boolean;
}

/** Scales between half and double the written amount, in steps of 5%. */
const SCALES = Array.from({ length: 31 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);
const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);
/** A note that counts pieces ("about 2 eggs", "about half a red onion"): it is worked out again when the amount changes. */
const COUNT_NOTE = /^about /;

/**
 * A new amount for an ingredient (fitted or for more or fewer people) and its note: a kind used by the piece goes to whole pieces (eggs, wraps,
 * stock cubes; never fewer than one), and one served whole to each person (wraps) to the same whole number for every one of `servings`; produce
 * used in parts (a cucumber, an onion) and everything else to the nearest 5 g, or with `small`, an amount under 20 to the nearest 1 (a pinch of
 * spice). A count note ("about 2 eggs") is said again for the new amount, or dropped when the new amount isn't close to a whole number of pieces.
 */
function newAmount(spec: IngredientSpec, raw: number, small: boolean, servings: number): { amount: number; note?: string } {
  const k = spec.pantry ? PANTRY.get(spec.pantry) : undefined;
  const pieces = (g: number) => (k?.perServing ? Math.max(1, Math.round(raw / g / servings)) * servings : Math.max(1, Math.round(raw / g)));
  const amount = k?.pieceGrams && !k.cut ? pieces(k.pieceGrams) * k.pieceGrams : small && raw < 20 ? Math.max(1, Math.round(raw)) : round5(raw);
  const count = k ? countNote(k, amount) : undefined;
  const note = count ?? (spec.note && COUNT_NOTE.test(spec.note) ? undefined : spec.note);
  return { amount, ...(note ? { note } : {}) };
}

/** An ingredient with a new amount and the note that goes with it, in a recipe for `servings` people. */
function withAmount(spec: IngredientSpec, raw: number, small: boolean, servings: number): IngredientSpec {
  const { amount, note } = newAmount(spec, raw, small, servings);
  const out: IngredientSpec = { ...spec, amount };
  if (note) out.note = note;
  else delete out.note;
  return out;
}

/** How each ingredient moves when the recipe is fitted, for a protein factor a and a carb factor b: by its role's factor, or by the factor of the
 *  ingredient it follows; then held inside its own limits. */
function fitFactors(ingredients: readonly IngredientSpec[]): Array<(a: number, b: number) => number> {
  const byKey = new Map(ingredients.map((s) => [s.key, s]));
  const make = (spec: IngredientSpec, depth: number): ((a: number, b: number) => number) => {
    const followed = spec.follows && depth < 5 ? byKey.get(spec.follows) : undefined;
    const base = followed && followed !== spec ? make(followed, depth + 1) : (a: number, b: number) => (spec.role === "protein" ? a : spec.role === "carb" ? b : 1);
    const [lo, hi] = spec.fit ?? [0, Infinity];
    return (a, b) => Math.min(hi, Math.max(lo, base(a, b)));
  };
  return ingredients.map((s) => make(s, 0));
}

/**
 * The amounts that bring one serving closest to the target, worked out from the products' own labels: the protein ingredients move
 * together by one factor and the carb ingredients by another (each between half and double), and an ingredient that follows another (the
 * milk for porridge oats) moves with it; each stays inside its own limits (tinned pulses at most one and a half times), and sauces and the
 * rest stay as written. Calories and protein are aimed at; carbs and fat count only when they go over the limit. Amounts are rounded to 5 g
 * (eggs and wraps to whole ones) and every number is then worked out again from the labels for those rounded amounts. Null when the recipe
 * isn't complete here.
 */
export function fitRecipe(recipe: Recipe, products: readonly ShopProduct[], chosen: Readonly<Record<string, string>>, target: MealTarget): FittedRecipe | null {
  const base = resolveRecipe(recipe, products, chosen);
  if (!base.complete) return null;
  const picks = base.picks as IngredientPick[];
  // the same products after fitting, even if a different pack size would be cheaper for the new amount
  const pinned: Record<string, string> = { ...chosen };
  for (const p of picks) pinned[p.spec.key] = p.product.id;
  const s = recipe.servings;
  // the picks' specs (a substitute in an ingredient's place) say how each one moves
  const factors = fitFactors(picks.map((p) => p.spec));
  const per = picks.map((p, i) => {
    const n = p.product.nutrition ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }; // a label we haven't read adds nothing (and is named as not counted)
    const g = p.spec.amount / 100 / s;
    return { f: factors[i]!, kcal: n.kcal * g, protein: n.protein * g, carbs: n.carbs * g, fat: n.fat * g };
  });
  // which of the two factors can move anything (an ingredient held at [1, 1] can't)
  const hasP = per.some((x) => x.f(0.5, 1) !== 1 || x.f(2, 1) !== 1);
  const hasC = per.some((x) => x.f(1, 0.5) !== 1 || x.f(1, 2) !== 1);
  if (!hasP && !hasC) return { recipe, resolved: base, totals: recipeTotals(base)!, changed: false };
  let best = { a: 1, b: 1, score: Infinity };
  for (const a of hasP ? SCALES : [1]) {
    for (const b of hasC ? SCALES : [1]) {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      for (const x of per) {
        const f = x.f(a, b);
        t.kcal += x.kcal * f; t.protein += x.protein * f; t.carbs += x.carbs * f; t.fat += x.fat * f;
      }
      let score = (t.kcal / target.kcal - 1) ** 2;
      if (target.protein) score += (t.protein / target.protein - 1) ** 2;
      if (target.carbsMax && t.carbs > target.carbsMax) score += 3 * (t.carbs / target.carbsMax - 1) ** 2;
      if (target.fatMax && t.fat > target.fatMax) score += 3 * (t.fat / target.fatMax - 1) ** 2;
      score += 0.01 * ((a - 1) ** 2 + (b - 1) ** 2); // between equal fits, stay nearer the recipe as written
      if (score < best.score - 1e-12) best = { a, b, score };
    }
  }
  // the picks line up with the recipe's ingredients, so each written amount moves by the factor its pick was fitted with
  const ingredients = recipe.ingredients.map((spec, i) => {
    const f = factors[i]!(best.a, best.b);
    return f === 1 ? spec : withAmount(spec, spec.amount * f, false, s);
  });
  const fitted: Recipe = { ...recipe, ingredients };
  const resolved = resolveRecipe(fitted, products, pinned);
  const totals = recipeTotals(resolved);
  if (!totals) return null;
  return { recipe: fitted, resolved, totals, changed: ingredients.some((x, i) => x.amount !== recipe.ingredients[i]!.amount) };
}

/**
 * The recipe for a different number of people (the − / + on a recipe page): every amount times servings ÷ the recipe's own, rounded the way
 * fitting rounds them (eggs, wraps and stock cubes to whole ones, wraps to the same number for each person, grams and millilitres to 5, so part of a cucumber stays a part; small amounts
 * such as a pinch of spice to the nearest 1, never below 1). A serving's figures stay as they were, give or take the rounding; the packs to
 * buy follow the new amounts. 1 to 12 people.
 */
export function scaleServings(recipe: Recipe, servings: number): Recipe {
  const n = Math.max(1, Math.min(12, Math.round(servings)));
  if (n === recipe.servings) return recipe;
  const f = n / recipe.servings;
  return { ...recipe, servings: n, ingredients: recipe.ingredients.map((spec) => withAmount(spec, spec.amount * f, true, n)) };
}

/** How far a serving is from the target (0 = spot on): used to put the closest recipes first. */
export function fitDistance(t: RecipeTotals["perServing"], target: MealTarget): number {
  let d = Math.abs(t.kcal / target.kcal - 1);
  if (target.protein) d += Math.abs(t.protein / target.protein - 1);
  if (target.carbsMax && t.carbs > target.carbsMax) d += t.carbs / target.carbsMax - 1;
  if (target.fatMax && t.fat > target.fatMax) d += t.fat / target.fatMax - 1;
  return d;
}

// ---- simple choices for the meal (Recipes screen and Pip's recipe maker)

export type MealSize = "small" | "normal" | "big";

/** Three meal sizes from the person's daily calories: a normal meal is about 30% of the day (to the nearest 50 kcal, 300-1,200), small and big 200 kcal either side. */
export function mealSizes(dailyCalories: number): Record<MealSize, number> {
  const normal = Math.min(1200, Math.max(300, Math.round((dailyCalories * 0.3) / 50) * 50));
  return { small: Math.max(200, normal - 200), normal, big: normal + 200 };
}

/** "More protein": a protein aim of 30% of the meal's calories, at 4 kcal per gram (the labelling factor), to the nearest 5 g. A target the person picks, never a figure shown as nutrition. */
export const moreProteinGrams = (kcal: number): number => Math.max(10, Math.round((kcal * 0.3) / 4 / 5) * 5);
