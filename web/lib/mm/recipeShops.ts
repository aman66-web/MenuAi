import { candidates, nameFits, namesMeat, pickFor, pieceWeight, resolveRecipe, type IngredientPick, type IngredientSpec, type Recipe } from "./recipes";
import { normalizeForSearch } from "./search";
import { hasPrice, type ShopNutrition, type ShopProduct } from "./shopProducts";

// Recipes from any supermarket (founder's idea, 16 Nov 2026; behind RECIPES_ANY_SHOP_ENABLED, docs/RECIPES_ANY_SUPERMARKET_REPORT.md). A recipe is made from ONE shop's
// products; it is offered at a shop only when every ingredient resolves there to a product with usable numbers (the same rules as Sainsbury's recipes use:
// lib/mm/recipes.ts). Mixing shops happens only inside a recipe, when the person swaps one ingredient for a product from another supermarket. Nothing here
// estimates a number (CLAUDE.md rule 1): a product either has numbers we can use for the amount, or it has none and says so.
// Pure and unit-tested (tests/recipeShops.test.ts).

/** A barcode without leading zeros: 05000157062673 and 5000157062673 are the same product. */
export const noZeros = (code: string): string => code.replace(/^0+/, "");

/** What a community record in a shop's barcode catalogue holds (public/groceries/<shop>.json, Open Food Facts contributors): per 100 g or ml, as sold. */
export interface CommunityRecord {
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
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** The record as the numbers recipes use, or null when its four main figures aren't all there. Never fills in a figure the record doesn't have. */
export function communityNutrition(c: CommunityRecord): ShopNutrition | null {
  if (!finite(c.kcal) || !finite(c.protein) || !finite(c.carbs) || !finite(c.fat) || (c.per !== "g" && c.per !== "ml")) return null;
  const opt = (v: number | undefined) => (finite(v) ? v : null);
  return { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, saturates: opt(c.saturates), sugars: opt(c.sugars), fibre: opt(c.fibre), salt: opt(c.salt), kj: opt(c.kj), per: c.per, state: "" };
}

/**
 * The shop's products with community numbers added where the shop's own page hasn't been read: only for a product the shop's own list ties to a barcode, and
 * only from the record for exactly that barcode (leading zeros ignored), marked `nutritionFrom: "community"`. A product with its own label keeps it. The
 * founder's decision (RECIPE_COMMUNITY_NUMBERS_ENABLED); never used when that is off.
 */
export function withCommunityNumbers(products: readonly ShopProduct[], catalogue: ReadonlyMap<string, CommunityRecord>): ShopProduct[] {
  if (catalogue.size === 0) return products as ShopProduct[];
  return products.map((p) => {
    if (p.nutrition || !p.gtin) return p;
    const c = catalogue.get(noZeros(p.gtin));
    const n = c ? communityNutrition(c) : null;
    return n ? { ...p, nutrition: n, nutritionFrom: "community" as const } : p;
  });
}

export interface RecipeCoverage {
  /** How many recipes could be made from this shop's products alone. */
  complete: number;
  total: number;
  /** For each recipe that can't: the ingredients with no usable product (their labels, recipe order). */
  missing: Array<{ id: string; ingredients: string[] }>;
  /** Ingredient labels most often missing, most first (ties by name). */
  mostMissing: Array<{ label: string; recipes: number }>;
}

/** How many of these recipes resolve completely at this shop, as written, and what stops the rest. */
export function recipeCoverage(recipes: readonly Recipe[], products: readonly ShopProduct[]): RecipeCoverage {
  const missing: RecipeCoverage["missing"] = [];
  const counts = new Map<string, number>();
  let complete = 0;
  for (const r of recipes) {
    const res = resolveRecipe(r, products);
    if (res.complete) { complete++; continue; }
    const labels = r.ingredients.filter((_, i) => !res.picks[i]).map((s) => s.label);
    missing.push({ id: r.id, ingredients: labels });
    for (const l of new Set(labels)) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const mostMissing = [...counts].map(([label, n]) => ({ label, recipes: n })).sort((a, b) => b.recipes - a.recipes || a.label.localeCompare(b.label, "en-GB"));
  return { complete, total: recipes.length, missing, mostMissing };
}

export type NumbersFrom = "label" | "community" | null;

export interface OtherShopOption {
  shop: string;
  /** The product priced for the recipe's amount; `pick.shop` is set. */
  pick: IngredientPick;
  /** Where its numbers come from: its own label, community data, or none (then choosing it means the recipe's figures can't be shown). */
  numbers: NumbersFrom;
}

const numbersFrom = (p: ShopProduct): NumbersFrom => (p.nutrition ? (p.nutritionFrom === "community" ? "community" : "label") : null);
const RANK: Record<string, number> = { label: 0, community: 1, none: 2 };

/**
 * Products at other supermarkets that could stand for an ingredient, most suitable first: those whose numbers pass every rule the recipe's own shop uses
 * (unit, as sold, the plausible range for the form: lib/mm/recipes.ts matching), its own label before community data; then products named for the ingredient
 * (all its words, none of its excluded words) that have no numbers yet. A product whose numbers exist but don't fit is never offered. Within each group, the name
 * with more of the ingredient's own words first, then a price for the amount used before none, the kind's preferred words first, then the cheapest to buy, then by name.
 */
export function otherShopOptions(lists: ReadonlyArray<{ shop: string; products: readonly ShopProduct[] }>, spec: IngredientSpec, meatFree = false): OtherShopOption[] {
  const out: OtherShopOption[] = [];
  for (const { shop, products } of lists) {
    const fit = candidates(products, spec, meatFree);
    const seen = new Set(fit.map((c) => c.product.id));
    for (const c of fit) out.push({ shop, pick: { ...c, shop }, numbers: numbersFrom(c.product) });
    for (const p of products) {
      if (seen.has(p.id) || p.nutrition || !hasPrice(p)) continue;
      if (!nameFits(p.name, spec) || (meatFree && namesMeat(p.name))) continue;
      const w = spec.match.pieceWeight;
      if (w) {
        const pw = pieceWeight(p.name);
        if (pw === null || pw < w[0] || pw > w[1]) continue;
      }
      out.push({ shop, pick: { ...pickFor(spec, p), shop }, numbers: null });
    }
  }
  const prefer = spec.match.prefer;
  const unpreferred = (o: OtherShopOption) => Number(!!prefer && !prefer.some((w) => ` ${normalizeForSearch(o.pick.product.name)} `.includes(` ${normalizeForSearch(w)}`)));
  // how many of the ingredient's own words the name has ("Chicken Breast Fillets" before "Chicken Breast Sausages" for "Chicken breast fillets"): a name is all a
  // product with no numbers can be judged by
  const words = [...new Set(normalizeForSearch(spec.label).split(" ").filter((w) => w.length >= 3).map((w) => w.replace(/s$/, "")))];
  const closeness = (o: OtherShopOption) => {
    const h = ` ${normalizeForSearch(o.pick.product.name)} `;
    return words.filter((w) => h.includes(` ${w}`)).length;
  };
  return out.sort(
    (a, b) =>
      RANK[a.numbers ?? "none"]! - RANK[b.numbers ?? "none"]! ||
      closeness(b) - closeness(a) ||
      Number(a.pick.usedCost === null) - Number(b.pick.usedCost === null) ||
      unpreferred(a) - unpreferred(b) ||
      a.pick.basketCost - b.pick.basketCost ||
      a.pick.product.name.localeCompare(b.pick.product.name, "en-GB") ||
      a.shop.localeCompare(b.shop),
  );
}
