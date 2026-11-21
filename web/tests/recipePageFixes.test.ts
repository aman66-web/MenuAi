import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { candidates, isMeatFree, recipeView, resolveRecipe, scaleServings, scaleSpec, subSpec, type IngredientPick } from "../lib/mm/recipes";
import { PRICE_STEP, type PriceRange } from "../lib/mm/servingPrice";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// The 21 November 2026 meeting's findings on the Recipes screen and the recipe page (Hassan, Isla, Femi). Those screens' files can't be loaded in a test (their
// "@/" imports), so each fix is checked on the real shop lists through the page's own pipeline (lib/mm/recipes.ts), and the screen's code is checked to use it.

const page = readFileSync("app/app/recipes/page.tsx", "utf8");
const detail = readFileSync("app/app/recipes/RecipeDetail.tsx", "utf8");
const priceSheet = readFileSync("app/app/recipes/ServingPrice.tsx", "utf8");
const shop = (id: string) => decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${id}.json`, "utf8")));
const SHOPS = ["sainsburys", "morrisons", "asda"].map((id) => ({ id, products: shop(id) }));

describe("the recipe page's prices (Isla)", () => {
  const picks: IngredientPick[] = SHOPS.flatMap(({ products }) => RECIPES.flatMap((r) => resolveRecipe(r, products).picks.filter((p): p is IngredientPick => !!p)));
  // bought by weight at a price per kg (lib/mm/recipes.ts pickFor); a loose onion priced each is bought whole, at its price each
  const loose = (p: IngredientPick) => /\bloose\b/i.test(p.product.name) && p.product.unit === "per kg" && p.spec.unit === "g" && p.product.price === p.product.unitPrice;

  it("a row and Add all price one of what is bought: a pack's shelf price, or for loose produce the amount used, never its price per kg", () => {
    for (const p of picks.filter((x) => !loose(x))) expect(p.basketCost / p.packs).toBeCloseTo(p.product.price, 9);
    const looseOnes = picks.filter(loose);
    expect(looseOnes.length, "a recipe uses loose produce").toBeGreaterThan(0);
    for (const p of looseOnes) {
      expect(p.basketCost / p.packs).toBeCloseTo(p.usedCost!, 9);
      expect(p.basketCost / p.packs).toBeCloseTo((p.product.unitPrice! * p.spec.amount) / 1000, 9);
    }
    // the shelf price of loose produce is its price per kg, which is not what the amount costs (only 1 kg would)
    expect(looseOnes.some((p) => Math.abs(p.basketCost / p.packs - p.product.price) > 0.005)).toBe(true);
    expect(detail).toContain("formatUsedPrice(p.basketCost / p.packs)");
    expect(detail).toContain("price: p.basketCost / p.packs");
    expect(detail).not.toMatch(/formatPrice\(p\.product\.price\)|price: p\.product\.price/);
  });

  it("the Swap sheet makes no claim about the order: it isn't cheapest first", () => {
    const products = SHOPS[0]!.products;
    const unordered = RECIPES.some((r) => r.ingredients.some((spec) => {
      const priced = candidates(products, spec, isMeatFree(r)).filter((c) => c.usedCost !== null);
      return priced.some((c, i) => i > 0 && c.basketCost < priced[i - 1]!.basketCost - 1e-9);
    }));
    expect(unordered).toBe(true);
    expect(detail).not.toMatch(/t\("[^"]*cheapest to buy/);
  });

  it("'Use something else instead' shows the amount the recipe will have once picked, fitted to the meal like the page", () => {
    const products = SHOPS[0]!.products;
    const target = { kcal: 900, protein: 55 };
    // the old way (the substitute's amount for the recipe as written) is not what a fitted recipe uses
    const differs = RECIPES.some((r) => {
      const scaled = scaleServings(r, 1);
      const original = (scaled.scaledFrom ?? scaled).ingredients;
      return r.ingredients.some((spec, i) => (spec.subs ?? []).some((sub) => {
        const s2 = subSpec(original[i]!, sub, scaled);
        if (!s2) return false;
        const old = scaled.scaledFrom ? scaleSpec(s2, scaled.servings, scaled.scaledFrom.servings) : s2;
        const v = recipeView(r, products, { servings: 1, subs: { [spec.key]: sub.key }, target });
        const at = v.recipe.ingredients.findIndex((x) => x.key === spec.key);
        const pick = v.resolved.picks[at];
        return !!pick && pick.spec.pantry === sub.key && pick.spec.amount !== old.amount;
      }));
    });
    expect(differs).toBe(true);
    // the sheet works each one out through recipeView, with the page's servings, swaps and fit
    expect(detail).toMatch(/recipeView\(recipe, viewProducts, \{ servings, subs: optSubs, chosen: optChosen, target: fitTo \}\)/);
  });

  it("names keep their capitals in the Swap title and the can't-price line, and a plan's 5¼ servings are said so everywhere", () => {
    expect(detail).toContain('t("Swap {name}", { name: lowerFirst(t(swapSpec.label)) })');
    expect(detail).toContain("[lowerFirst(t(p.spec.label))]");
    expect(detail).toContain("{ names: listNames(unpriced) }");
    expect(detail).not.toMatch(/\.label\)\.toLowerCase\(\)/);
    expect(detail).toContain('t("For {n} servings", { n: servingsWords(people) })');
    expect(detail).toContain('t("Full nutrition for {n} servings", { n: servingsWords(people) })');
  });

  it("a serving logged from the page is named like Choose a recipe names it, and counted (Femi)", () => {
    const logIt = detail.slice(detail.indexOf("const logIt = () =>"), detail.indexOf("const logButton"));
    expect(logIt).toContain("halves(logServings)");
    expect(logIt).toContain("NAME_WITH_SERVING");
    expect(logIt).toContain('analytics.track({ name: "mealLogged" })');
    expect(logIt).toContain("countProAction()");
    expect(detail).toContain('const NAME_WITH_SERVING = tk("{name} ({n} serving)")');
  });
});

describe("the Recipes screen (Hassan)", () => {
  it("says it is loading, never \"Show 0 recipes\", while the list is worked out, and keeps the Serving price field", () => {
    expect(page).toContain('{loadingList ? t("Loading recipes") : shown.length === 0 && filtering');
    expect(page).toContain("(loadingList ? null :");
    expect(priceSheet).toContain('n === null ? t("Loading recipes")');
    expect(page).toContain("const priceBounds = freshBounds ?? (cardsReady ? null : keptBounds);");
  });
  it("saves the shop tapped whenever it isn't already the first of the person's shops", () => {
    expect(page).toContain("if (chosenShops[0] !== id) updateSettings({ shops: [id, ...chosenShops.filter((x) => x !== id)] });");
  });
  it("counts each cuisine and occasion with the chosen price, and has a clear button in the search", () => {
    expect(page).toMatch(/nicheCounts\(base\.filter\(\(c\) => !priceRange \|\| inPriceRange\(c\.totals\.costPerServing, priceRange\)\)/);
    expect(page).toContain('aria-label={t("Clear search")}');
    expect(page).toContain("DONE_ROOM_WITH_CLEAR");
  });
});

describe("the Serving price slider (Hassan)", () => {
  // the rule as the sheet has it (its file can't be imported here), run on the four places the handles can meet
  const src = /export function lowHandleOnTop\(now: PriceRange, bounds: PriceRange\): boolean \{\n([\s\S]*?)\n\}/.exec(priceSheet)?.[1];
  const lowOnTop = new Function("now", "bounds", "PRICE_STEP", src ?? "throw new Error('lowHandleOnTop not found')") as (now: PriceRange, bounds: PriceRange, step: number) => boolean;
  const bounds = { min: 1, max: 5 };
  it("never leaves both handles stuck where they meet", () => {
    // both at the top: the low one is on top, so it can come back down (it was stuck there)
    expect(lowOnTop({ min: 5, max: 5 }, bounds, PRICE_STEP)).toBe(true);
    // both at the bottom: the high one is on top, so it can go back up
    expect(lowOnTop({ min: 1, max: 1 }, bounds, PRICE_STEP)).toBe(false);
    // apart: the low one is on top only past the middle
    expect(lowOnTop({ min: 1.5, max: 4 }, bounds, PRICE_STEP)).toBe(false);
    expect(lowOnTop({ min: 3.5, max: 4.5 }, bounds, PRICE_STEP)).toBe(true);
    expect(priceSheet).toContain("style={{ zIndex: lowOnTop ? 2 : 1 }}");
    expect(priceSheet).toContain("style={{ zIndex: lowOnTop ? 1 : 2 }}");
  });
});
