import { CUSTOM_RETAILER, type ShoppingItem } from "./groceries";
import { itemCovers } from "./listRecipes";
import { PANTRY, kindExcluded, type DietPrefs, type PantryKind } from "./pantry";
import { RECIPES } from "./recipeBook";
import type { ListRecipe } from "./listRecipes";
import { recipeForDiet, recipeView, resolveRecipe, scaleSpec, subSpec, type IngredientSpec, type Recipe } from "./recipes";
import type { ShopProduct } from "./shopProducts";
import { COMMON_KINDS, isStaple, itemAmount, kindOf, LEVEL_SERVINGS, type CupboardItem } from "./cupboardItems";

// "Cook from my cupboard": which recipes a cupboard (lib/mm/cupboardItems.ts) can make, how many people it feeds, and what is still to buy. See that file for
// how an amount is read. Plain arithmetic on the device; every figure on a recipe still comes from the shop's own labels. Pure and unit-tested.

export * from "./cupboardItems";
const MAX_SERVINGS = 12;

let offered: Set<string> | null = null;
/** Pantry kinds a recipe uses, or can use as a substitute: the only ones that can help find a recipe. */
function usefulKinds(): Set<string> {
  if (!offered) {
    offered = new Set<string>();
    for (const r of RECIPES) for (const i of r.ingredients) { if (i.pantry) offered.add(i.pantry); for (const s of i.subs ?? []) offered.add(s.key); }
  }
  return offered;
}

/** The kinds this person can pick: ones a recipe can use, minus what their diet and allergies leave out (a vegan isn't offered cheese). Common ones first, then by name. */
export function pickableKinds(diet: DietPrefs): PantryKind[] {
  const rank = (k: PantryKind) => { const i = COMMON_KINDS.indexOf(k.key); return i < 0 ? COMMON_KINDS.length : i; };
  return [...PANTRY.values()]
    .filter((k) => usefulKinds().has(k.key) && kindExcluded(k, diet) === null)
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "en-GB"));
}

// ---- what the cupboard can make

export type CoverState = "have" | "short" | "swap" | "missing" | "staple";

export interface CupboardIngredient {
  /** Index in the recipe's ingredients. */
  index: number;
  /** have: in the cupboard, enough for the servings shown. short: in the cupboard, but not quite enough. swap: a substitute for it is in the cupboard.
   *  missing: to buy. staple: a store-cupboard kind (salt, oil, spices), counted neither way. */
  state: CoverState;
  /** swap: the substitute's pantry kind (the recipe page's "Use something else instead"). */
  sub?: string;
  /** staple: the person has said they have it. */
  ticked?: boolean;
}

export interface CupboardMatch {
  recipe: Recipe;
  /** How many people the cupboard's amounts allow, as the recipe page's − and + count them (never more than the recipe is written for). */
  servings: number;
  /** 0 to 1: how much of the recipe the cupboard covers, main ingredients (protein and carbs) counting most. */
  score: number;
  ingredients: CupboardIngredient[];
  have: number[];
  short: number[];
  swaps: Array<{ index: number; sub: string }>;
  missing: number[];
  /** Store-cupboard ingredients (never counted). */
  staples: number[];
}

const WEIGHT = { protein: 3, carb: 2, other: 1 } as const;
const CREDIT = { have: 1, swap: 0.6, short: 0.5, missing: 0, staple: 0 } as const;

/** The most people (1 to 12) an amount covers for this ingredient of a recipe written for `written` people; 0 when not even one. */
function covers(spec: IngredientSpec, item: CupboardItem, written: number): number {
  if (item.level) return Math.min(MAX_SERVINGS, LEVEL_SERVINGS[item.level]);
  const have = itemAmount(item);
  if (have === null) return MAX_SERVINGS;
  for (let n = MAX_SERVINGS; n >= 1; n--) if (scaleSpec(spec, n, written).amount <= have + 1e-9) return n;
  return 0;
}

/** Words the person typed, as an item the shopping-list matcher (listRecipes.itemCovers) understands: matched by name only, loosely, like typed list items. */
const asListItem = (item: CupboardItem): ShoppingItem => ({ gtin: "", retailer: CUSTOM_RETAILER, name: item.name, brand: "", size: "", qty: 1, addedAt: "", custom: true });

/**
 * What this cupboard makes of one recipe (already set for the diet), or null when the shop can't fill it or nothing in it uses the cupboard. Each cupboard
 * item covers one ingredient. The ingredient itself is looked for first (the very same kind; for typed words the shopping list's name matching), then a
 * substitute the recipe allows. `staples`: the store-cupboard kinds the person has said they have.
 */
export function matchRecipe(
  items: readonly CupboardItem[],
  recipe: Recipe,
  products: readonly ShopProduct[],
  retailer: string,
  staples: ReadonlySet<string>,
  byId: ReadonlyMap<string, ShopProduct> = new Map(products.map((p) => [p.id, p])),
): CupboardMatch | null {
  if (!items.length || !products.length) return null;
  if (!resolveRecipe(recipe, products).complete) return null;
  const written = recipe.servings;
  const used = new Set<string>();
  const found: Array<{ item: CupboardItem; sub?: { key: string; factor?: number } } | null> = recipe.ingredients.map(() => null);

  recipe.ingredients.forEach((spec, i) => {
    if (spec.cupboard) return;
    const item = items.find((it) => !used.has(it.id) && (it.kind ? it.kind === spec.pantry : itemCovers(asListItem(it), spec, products, byId, retailer, recipe, false)));
    if (item) { used.add(item.id); found[i] = { item }; }
  });
  // substitutes only after every ingredient has had its own kind: a substitute never takes what another ingredient needs
  recipe.ingredients.forEach((spec, i) => {
    if (spec.cupboard || found[i]) return;
    for (const sub of spec.subs ?? []) {
      const item = items.find((it) => !used.has(it.id) && it.kind === sub.key);
      if (item && subSpec(spec, sub, recipe.halal)) { used.add(item.id); found[i] = { item, sub }; break; }
    }
  });

  // the people the cupboard allows: limited by the main ingredients it holds an amount of (protein and carbs); the rest are "not quite enough" if they fall short
  const allowed = (i: number): number => {
    const f = found[i]!;
    const spec = f.sub ? subSpec(recipe.ingredients[i]!, f.sub, recipe.halal)! : recipe.ingredients[i]!;
    return covers(spec, f.item, written);
  };
  const main = recipe.ingredients.map((_, i) => i).filter((i) => found[i] && (recipe.ingredients[i]!.role ?? "other") !== "other");
  const limit = main.length ? Math.min(...main.map((i) => Math.max(1, allowed(i)))) : written;
  const servings = Math.max(1, Math.min(MAX_SERVINGS, written, limit));

  const ingredients: CupboardIngredient[] = recipe.ingredients.map((spec, index): CupboardIngredient => {
    if (spec.cupboard) return { index, state: "staple", ticked: !!spec.pantry && staples.has(spec.pantry) };
    const f = found[index];
    if (!f) return { index, state: "missing" };
    if (f.sub) return { index, state: "swap", sub: f.sub.key };
    return { index, state: allowed(index) >= servings ? "have" : "short" };
  });

  const real = ingredients.filter((x) => x.state !== "staple");
  if (!real.some((x) => x.state !== "missing")) return null;
  let got = 0;
  let all = 0;
  for (const x of real) {
    const w = WEIGHT[recipe.ingredients[x.index]!.role ?? "other"];
    all += w;
    got += w * CREDIT[x.state];
  }
  const index = (s: CoverState) => ingredients.filter((x) => x.state === s).map((x) => x.index);
  return {
    recipe,
    servings,
    score: all ? got / all : 0,
    ingredients,
    have: index("have"),
    short: index("short"),
    swaps: ingredients.filter((x) => x.state === "swap").map((x) => ({ index: x.index, sub: x.sub! })),
    missing: index("missing"),
    staples: index("staple"),
  };
}

/** The store-cupboard kinds the person has said they have: staples in the cupboard list, plus the ones they ticked "I have this" for on a recipe page. */
export function stapleKeys(items: readonly CupboardItem[], ticked: readonly string[]): Set<string> {
  const out = new Set<string>(ticked);
  for (const i of items) if (i.kind && isStaple(kindOf(i))) out.add(i.kind);
  return out;
}

/**
 * Recipes the cupboard can make, the best cover first. `recipes` are already set for the person's diet and allergies (recipeForDiet), exactly as the
 * Recipes page sets them; a recipe the shop can't fill is left out. More cover first, then more people fed, then fewer things to buy, then name.
 */
export function recipesFromCupboard(items: readonly CupboardItem[], recipes: readonly Recipe[], products: readonly ShopProduct[], retailer: string, staples: ReadonlySet<string>): CupboardMatch[] {
  if (!items.length || !products.length) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: CupboardMatch[] = [];
  for (const recipe of recipes) {
    const m = matchRecipe(items, recipe, products, retailer, staples, byId);
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.score - a.score || b.servings - a.servings || a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

/** What to count in "You have 5 of 7 ingredients": every ingredient except store-cupboard ones (which are shown on their own line). */
export const countable = (m: CupboardMatch): number => m.ingredients.length - m.staples.length;

/** The substitutes a match has put in, as the recipe page takes them (ingredient key → substitute kind). */
export function matchSubs(m: CupboardMatch): Record<string, string> {
  return Object.fromEntries(m.swaps.map((s) => [m.recipe.ingredients[s.index]!.key, s.sub]));
}

/** What to buy for a match: everything missing, and what the cupboard doesn't quite cover. A swap needs nothing, and a store-cupboard kind is left to the person. */
export const toBuy = (m: CupboardMatch): number[] => [...m.missing, ...m.short].sort((a, b) => a - b);

/** The address of the recipe page with the servings, the swaps and "as the recipe has it" already set, so the amounts there are the ones worked out from the cupboard. */
export function recipeHref(m: CupboardMatch, shop: string): string {
  const subs = Object.entries(matchSubs(m)).map(([a, b]) => `${a}:${b}`).join(",");
  return `/app/recipes/view?id=${m.recipe.id}&r=${shop}&n=${m.servings}&w=1${subs ? `&s=${subs}` : ""}`;
}

/** The whole thing for the screen: the recipe book set for the person's diet and allergies (recipeForDiet, exactly as the Recipes page sets it), then what the
 *  cupboard makes of each. `leftOut` is how many recipes the diet leaves out. `ticked`: the store-cupboard kinds they ticked "I have this" for on a recipe page. */
export function recipesForCupboard(items: readonly CupboardItem[], diet: DietPrefs, products: readonly ShopProduct[], retailer: string, ticked: readonly string[] = []): { matches: CupboardMatch[]; leftOut: number } {
  const recipes: Recipe[] = [];
  let leftOut = 0;
  for (const r of RECIPES) { const d = recipeForDiet(r, diet); if (d) recipes.push(d); else leftOut++; }
  return { matches: recipesFromCupboard(items, recipes, products, retailer, stapleKeys(items, ticked)), leftOut };
}

/** A match as the shopping-list helper (listRecipes.addMissing) takes it, for the servings the cupboard allows and with its swaps put in: "what to buy" is then
 *  the recipe's own pick at the shop, enough packs for those amounts. Nothing the cupboard covers, and no store-cupboard kind, is in it. */
export function listRecipeFor(m: CupboardMatch, products: readonly ShopProduct[]): ListRecipe {
  const view = recipeView(m.recipe, products, { servings: m.servings, subs: matchSubs(m) });
  return { recipe: view.recipe, resolved: view.resolved, have: m.have, missing: toBuy(m) };
}

/** What the recipe page starts with when it is opened from the cupboard: the people the cupboard feeds, the swaps, and "as the recipe has it" (its amounts are
 *  the ones the cupboard was measured against, not amounts fitted to a meal size). */
export interface RecipePreset {
  servings?: number;
  subs?: Record<string, string>;
  asWritten?: boolean;
}
const KEY = /^[a-z0-9-]{1,40}$/;
/** Reads the preset from the recipe page's address (n, s, w), checking every part: anything else is ignored. */
export function parsePreset(get: (name: string) => string | null): RecipePreset | undefined {
  const preset: RecipePreset = {};
  const n = Number(get("n"));
  if (get("n") !== null && Number.isInteger(n) && n >= 1 && n <= MAX_SERVINGS) preset.servings = n;
  const subs: Record<string, string> = {};
  for (const part of (get("s") ?? "").split(",").slice(0, 12)) {
    const [a, b, ...rest] = part.split(":");
    if (a && b && !rest.length && KEY.test(a) && KEY.test(b)) subs[a] = b;
  }
  if (Object.keys(subs).length) preset.subs = subs;
  if (get("w") === "1") preset.asWritten = true;
  return Object.keys(preset).length ? preset : undefined;
}
