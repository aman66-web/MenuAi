import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGUAGES_ENABLED } from "../lib/mm/config";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import {
  candidates, drainedSize, fitRecipe, isMeatFree, moreProteinGrams, packSize, recipeForDiet, recipeTotals, recipeView, resolveRecipe, roundedAmountsMatter, scaleMethodMl,
  scaleServings, subSpec, withSubstitutes, type IngredientPick, type MealTarget, type Recipe, type RecipeView,
} from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";

// Cooking for more or fewer people (the Serves − / + on a recipe page, founder 2026-10-16: "the maths doesn't work when you increase the
// servings ... make sure every recipe also works"): the amounts, the packs and the basket follow the people, but a SERVING is the same serving, so
// its numbers (calories, protein, carbs, fat and the rest of the label) and its price are identical for every number of people from 1 to 12.
// Every recipe in the book is checked through the page's own pipeline (recipeView) against the real Sainsbury's list, as written and fitted to a
// small, normal and big meal (with and without a protein aim), with each ingredient's first available substitute chosen one at a time, with the
// halal products, and with the store-cupboard items ticked "I have this".

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const byId = (id: string) => RECIPES.find((r) => r.id === id)!;
const PEOPLE = Array.from({ length: 12 }, (_, i) => i + 1);

interface Variant { label: string; recipe: Recipe; subs: Record<string, string>; target: MealTarget | null }

function variantsOf(recipe: Recipe): Variant[] {
  const out: Variant[] = [{ label: "as written", recipe, subs: {}, target: null }];
  for (const kcal of [400, 600, 800]) {
    out.push({ label: `fitted ${kcal}`, recipe, subs: {}, target: { kcal } });
    out.push({ label: `fitted ${kcal} + protein`, recipe, subs: {}, target: { kcal, protein: moreProteinGrams(kcal) } });
  }
  // each ingredient's first substitute the shop sells (the only ones the page offers), one at a time
  for (const spec of recipe.ingredients) {
    const sub = (spec.subs ?? []).find((s) => { const s2 = subSpec(spec, s, recipe.halal); return !!s2 && candidates(products, s2, isMeatFree(recipe)).length > 0; });
    if (!sub) continue;
    out.push({ label: `${spec.key} -> ${sub.key}`, recipe, subs: { [spec.key]: sub.key }, target: null });
    out.push({ label: `${spec.key} -> ${sub.key}, fitted 600 + protein`, recipe, subs: { [spec.key]: sub.key }, target: { kcal: 600, protein: moreProteinGrams(600) } });
  }
  const halal = recipeForDiet(recipe, { halalOnly: true });
  if (halal) {
    out.push({ label: "halal", recipe: halal, subs: {}, target: null });
    out.push({ label: "halal, fitted 600", recipe: halal, subs: {}, target: { kcal: 600 } });
  }
  return out;
}

const run = (v: Variant, servings: number): RecipeView => recipeView(v.recipe, products, { servings, subs: v.subs, target: v.target });

/** Plain arithmetic on the labels, unrounded: each figure per 100 g or ml × the amount ÷ 100, summed, over the servings. */
const KEYS = ["kcal", "protein", "carbs", "fat", "kj", "saturates", "sugars", "fibre", "salt"] as const;
type Sum = Record<(typeof KEYS)[number], number | null>;
function labelSum(picks: ReadonlyArray<IngredientPick | null>, servings: number): Sum {
  const sum = Object.fromEntries(KEYS.map((k) => [k, 0])) as Sum;
  for (const p of picks as IngredientPick[]) {
    const n = p.product.nutrition;
    if (!n) continue;
    for (const k of KEYS) { const v = n[k]; sum[k] = v === null || sum[k] === null ? null : sum[k]! + (v * p.spec.amount) / 100; }
  }
  for (const k of KEYS) if (sum[k] !== null) sum[k] = sum[k]! / servings;
  return sum;
}
const near = (a: number | null, b: number | null, why: string) => {
  if (a === null || b === null) return expect(a, why).toBe(b);
  expect(Math.abs(a - b), `${why}: ${a} vs ${b}`).toBeLessThanOrEqual(1e-9);
};

function checkVariant(v: Variant, label: string) {
  const s = v.recipe.servings;
  const ref = run(v, s);
  expect(ref.totals, `${label}: the recipe resolves at its own servings`).not.toBeNull();
  expect(ref.resolved.basis, `${label}: no basis at the recipe's own servings`).toBeUndefined();
  const refSum = labelSum(ref.resolved.picks, s);
  // the reference itself is the labels' arithmetic on its own amounts (shown to the nearest kcal, and to 0.1 g: within half a step of the exact sum)
  expect(Math.abs(ref.totals!.perServing.kcal - refSum.kcal!), `${label}: kcal`).toBeLessThanOrEqual(0.5 + 1e-9);
  for (const k of ["protein", "carbs", "fat"] as const) expect(Math.abs(ref.totals!.perServing[k] - refSum[k]!), `${label}: ${k}`).toBeLessThanOrEqual(0.05 + 1e-9);
  const refIds = ref.resolved.picks.map((p) => p!.product.id);
  const have = new Set(ref.recipe.ingredients.filter((i) => i.cupboard && i.pantry).map((i) => i.pantry!));
  let lastPacks: number[] | null = null;
  let lastAmounts: number[] | null = null;
  for (const n of PEOPLE) {
    const w = `${label} for ${n}`;
    const view = n === s ? ref : run(v, n);
    const totals = view.totals;
    expect(totals, `${w}: resolves`).not.toBeNull();
    if (n !== s) {
      expect(view.recipe.servings, w).toBe(n);
      expect(view.recipe.scaledFrom?.servings, `${w}: scaled from the written servings`).toBe(s);
    }

    // 1. a serving: the displayed (rounded) numbers are equal, and so are the exact ones (to 1e-9)
    expect(totals!.perServing, `${w}: per serving`).toEqual(ref.totals!.perServing);
    expect(totals!.label, `${w}: label rows`).toEqual(ref.totals!.label);
    expect(totals!.costPerServing, `${w}: price a serving`).toBe(ref.totals!.costPerServing);
    expect(totals!.notCounted, `${w}: not counted`).toEqual(ref.totals!.notCounted);
    expect(view.fitted, `${w}: fitted or not`).toBe(ref.fitted);
    const basis = view.resolved.basis ?? view.resolved;
    expect(basis.recipe.servings, w).toBe(s);
    const sum = labelSum(basis.picks, basis.recipe.servings);
    for (const k of KEYS) near(sum[k], refSum[k], `${w}: exact ${k}`);

    // 2. the same products as the recipe as written (a different pack size can't switch the product, and so the label)
    expect(view.resolved.picks.map((p) => p!.product.id), `${w}: products`).toEqual(refIds);
    expect(view.resolved.picks.map((p) => p!.spec.key), `${w}: ingredients`).toEqual(ref.resolved.picks.map((p) => p!.spec.key));

    // 3. the amounts follow the people, in sensible units
    view.resolved.picks.forEach((p, i) => {
      const spec = p!.spec;
      const refSpec = ref.resolved.picks[i]!.spec;
      const a = `${w}: ${spec.key} ${spec.amount} ${spec.unit}`;
      expect(spec.unit, a).toBe(refSpec.unit);
      expect(Number.isInteger(spec.amount) && spec.amount >= 1, `${a}: a whole number, at least 1`).toBe(true);
      // the row and the pick say the same amount (unless the shop lacks the kind and a substitute stands in, which has its own amount)
      if (spec.pantry === view.recipe.ingredients[i]!.pantry) expect(spec.amount, `${a}: the recipe's own row`).toBe(view.recipe.ingredients[i]!.amount);
      const kind = spec.pantry ? PANTRY.get(spec.pantry) : undefined;
      const exact = (refSpec.amount * n) / s;
      if (n === s) return;
      if (kind?.pieceGrams && !kind.cut) {
        // eggs, wraps, stock cubes, cloves, biscuits: whole pieces, never fewer than one
        expect(spec.amount % kind.pieceGrams, `${a}: whole ${kind.pieceName?.[1]}`).toBe(0);
        expect(spec.amount, a).toBeGreaterThanOrEqual(kind.pieceGrams);
        // wraps are whole for each person only where the recipe as written gives each person whole wraps (1 or 2 each); one that shares them (half a wrap each)
        // or counts 1.83 a person is counted as a whole number of wraps overall, so its amounts keep their proportions
        const writtenEach = refSpec.amount / kind.pieceGrams / s;
        if (kind.perServing && writtenEach >= 1 - 1e-9 && Math.abs(writtenEach - Math.round(writtenEach)) < 1e-9) expect(spec.amount / kind.pieceGrams % n, `${a}: the same whole number for each person`).toBe(0);
        else expect(Math.abs(spec.amount - exact), a).toBeLessThanOrEqual(Math.max(kind.pieceGrams / 2, kind.pieceGrams - exact) + 1e-9);
      } else {
        expect(spec.amount < 20 || spec.amount % 5 === 0, `${a}: 5 g steps (a pinch to the nearest 1)`).toBe(true);
        expect(Math.abs(spec.amount - exact), `${a}: close to ${exact}`).toBeLessThanOrEqual(2.5 + 1e-9);
      }
      // a count in the note is the count of pieces shown
      const count = /^about (\d+) /.exec(spec.note ?? "")?.[1];
      if (count && kind?.pieceGrams) expect(Number(count), `${a}: note "${spec.note}"`).toBe(Math.round(spec.amount / kind.pieceGrams));
    });

    // amounts never fall as people grow (the same ingredients in the same order at every number of people)
    const amounts = view.resolved.picks.map((p) => p!.spec.amount);
    if (lastAmounts) amounts.forEach((x, i) => expect(x, `${w}: ${view.resolved.picks[i]!.spec.key} never less for more people`).toBeGreaterThanOrEqual(lastAmounts![i]!));
    lastAmounts = amounts;

    // 4. the numbers are arithmetic on the labels for the amounts shown, give or take the rounding of those amounts
    const shown = labelSum(view.resolved.picks, n);
    for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
      let slack = 1e-9;
      view.resolved.picks.forEach((p, i) => {
        const per100 = p!.product.nutrition?.[k] ?? 0;
        slack += (per100 * Math.abs(p!.spec.amount - (ref.resolved.picks[i]!.spec.amount * n) / s)) / 100 / n;
      });
      expect(Math.abs(shown[k]! - refSum[k]!), `${w}: ${k} from the amounts shown (${shown[k]}) vs a serving (${refSum[k]})`).toBeLessThanOrEqual(slack);
    }

    // the amounts shown, added up from the labels, come out close to the serving above them. Where they don't (a whole egg for half an egg, a
    // whole stock cube for a quarter, the 1 g minimum for a pinch of salt, a whole wrap for half a wrap) the page says the amounts are rounded; it never
    // says so at the recipe's own servings, where the amounts are the serving
    const matters = roundedAmountsMatter(view.resolved, totals!);
    const drift = shown.kcal! / refSum.kcal! - 1;
    if (n === s) expect(matters, `${w}: nothing is rounded at the written servings`).toBe(false);
    const driftShown = shown.kcal! / totals!.perServing.kcal - 1; // against the figure the page shows
    if (Math.abs(driftShown) >= 0.03) expect(matters, `${w}: the amounts shown are ${Math.round(driftShown * 1000) / 10}% off the serving, so the page says so`).toBe(true);
    if (Math.abs(shown.protein! / totals!.perServing.protein - 1) >= 0.03 && Math.abs(shown.protein! - totals!.perServing.protein) >= 1) expect(matters, `${w}: protein`).toBe(true);
    // the biggest gaps are a whole egg or stock cube for one person (a half or a quarter is not a thing to buy), and the quesadilla wedges (half a wrap
    // each) for an odd number of people
    const wedges = v.recipe.id === "cheese-bean-quesadilla-wedges";
    const limit = wedges ? (n === 1 ? 0.7 : 0.25) : n === 1 ? 0.25 : 0.15;
    expect(Math.abs(drift), `${w}: the amounts shown add up to about the serving`).toBeLessThanOrEqual(wedges && n % 2 === 0 ? 0.03 : limit);

    // 5. the shopping follows the amounts: whole packs that cover what is shown, never a pack more than the exact need needs, and never fewer as people grow
    const packs = view.resolved.picks.map((p) => p!.packs);
    view.resolved.picks.forEach((p, i) => {
      const spec = p!.spec;
      const a = `${w}: ${spec.key} buy ${p!.packs}`;
      expect(Number.isInteger(p!.packs) && p!.packs >= 1, a).toBe(true);
      const exact = (ref.resolved.picks[i]!.spec.amount * n) / s;
      const kind = spec.pantry ? PANTRY.get(spec.pantry) : undefined;
      if (p!.pieces !== undefined) {
        expect(p!.pieces * kind!.pieceGrams!, `${a}: pieces cover the amount`).toBeGreaterThanOrEqual(spec.amount - 1e-9);
        expect(p!.pieces, `${a}: pieces`).toBeLessThanOrEqual(Math.ceil(exact / kind!.pieceGrams!) + 1);
      } else if (!/\bloose\b/i.test(p!.product.name)) {
        const size = spec.drained ? drainedSize(p!.product) : packSize(p!.product.name, spec.unit);
        if (size) {
          expect(p!.packs * size, `${a}: packs cover the amount`).toBeGreaterThanOrEqual(spec.amount - 1e-9);
          expect(p!.packs, `${a}: at most one pack more than the exact need`).toBeLessThanOrEqual(Math.ceil(exact / size - 1e-9) + 1);
        }
        expect(p!.basketCost, a).toBeCloseTo(p!.packs * p!.product.price, 6);
      }
    });
    if (lastPacks) packs.forEach((x, i) => expect(x, `${w}: ${view.resolved.picks[i]!.spec.key} packs never fall as people grow`).toBeGreaterThanOrEqual(lastPacks![i]!));
    lastPacks = packs;

    // 6. "I have this" on the cupboard items leaves them off the basket and nothing else
    const withHave = recipeTotals(view.resolved, have)!;
    expect(withHave.perServing, `${w}: have, per serving`).toEqual(ref.totals!.perServing);
    expect(withHave.label, `${w}: have, label`).toEqual(ref.totals!.label);
    expect(withHave.costPerServing, `${w}: have, price a serving`).toBe(ref.totals!.costPerServing);
    const left = view.resolved.picks.filter((p) => p!.spec.cupboard && p!.spec.pantry && have.has(p!.spec.pantry)).reduce((x, p) => x + p!.basketCost, 0);
    expect(Math.abs(totals!.basket - left - withHave.basket), `${w}: basket without the cupboard`).toBeLessThanOrEqual(0.011);
    expect(totals!.basket, `${w}: a basket`).toBeGreaterThan(0);
  }
}

describe("every recipe: a serving is the same serving for 1 to 12 people", () => {
  for (const r of RECIPES) {
    it(`${r.id} (written for ${r.servings})`, () => {
      for (const v of variantsOf(r)) checkVariant(v, `${r.id} / ${v.label}`);
    }, 120_000);
  }
  it("covers every recipe in the book and a variety of variants", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(95);
    const all = RECIPES.flatMap((r) => variantsOf(r));
    expect(all.filter((v) => v.label.includes("->")).length, "substitute variants").toBeGreaterThan(100);
    expect(all.filter((v) => v.label.startsWith("halal")).length, "halal variants").toBeGreaterThan(60);
    expect(all.filter((v) => v.label.startsWith("fitted")).length, "fitted variants").toBe(RECIPES.length * 6);
  }, 120_000);
});

describe("the founder's recipe: Chicken chow mein at Sainsbury's", () => {
  const chow = byId("chicken-chow-mein");
  // { kcal: 450, protein: 35 } is the meal the founder's screenshots were taken with (Serves 4 / 3 / 2 showed 451 / 456 / 451 kcal)
  for (const target of [null, { kcal: 450 }, { kcal: 450, protein: 35 }, { kcal: 600 }, { kcal: 600, protein: 45 }] as Array<MealTarget | null>) {
    it(`gives one serving's numbers and price at every Serves value (${target ? `fitted to ${target.kcal} kcal${target.protein ? ` and ${target.protein} g protein` : ""}` : "as written"})`, () => {
      const at = (n: number) => recipeView(chow, products, { servings: n, target });
      const base = at(chow.servings).totals!;
      for (const n of PEOPLE) {
        const t = at(n).totals!;
        expect(t.perServing, `Serves ${n}`).toEqual(base.perServing);
        expect(t.label, `Serves ${n}`).toEqual(base.label);
        expect(t.costPerServing, `Serves ${n}`).toBe(base.costPerServing);
      }
      // the amounts do follow the people (to the nearest 5 g)
      const grams = (n: number, i: number) => at(n).recipe.ingredients[i]!.amount;
      for (const i of [0, 1]) {
        expect(Math.abs(grams(4, i) - grams(2, i) * 2), `4 people, ingredient ${i}`).toBeLessThanOrEqual(2.5);
        expect(Math.abs(grams(1, i) - grams(2, i) / 2), `1 person, ingredient ${i}`).toBeLessThanOrEqual(2.5);
        expect(grams(3, i), `3 people, ingredient ${i}`).toBeGreaterThan(grams(2, i));
      }
    });
  }
});

describe("the building blocks, used directly, can't leak rounding or a different product into a serving", () => {
  const pick = ["chicken-chow-mein", "smoked-salmon-eggs", "breakfast-burrito", "chickpea-tomato-salad", "tuna-chickpea-dip", "cottage-pie", "wheat-biscuits-berries"];
  it("resolveRecipe + recipeTotals on a scaled recipe give the recipe as written's serving", () => {
    for (const id of pick) {
      const r = byId(id);
      const base = recipeTotals(resolveRecipe(r, products))!;
      for (const n of PEOPLE) {
        const t = recipeTotals(resolveRecipe(scaleServings(r, n), products))!;
        expect(t.perServing, `${id} for ${n}`).toEqual(base.perServing);
        expect(t.label, `${id} for ${n}`).toEqual(base.label);
        expect(t.costPerServing, `${id} for ${n}`).toBe(base.costPerServing);
      }
    }
  });

  it("scaling a scaled recipe scales the original again, so rounding never builds up, and back to the written servings gives the recipe itself", () => {
    for (const id of pick) {
      const r = byId(id);
      for (const [a, b] of [[5, 3], [12, 1], [1, 7], [3, 11]]) {
        expect(scaleServings(scaleServings(r, a), b), `${id} ${a} then ${b}`).toEqual(scaleServings(r, b));
      }
      expect(scaleServings(scaleServings(r, 5), r.servings)).toBe(r);
    }
  });

  it("fitting a scaled recipe is fitting the recipe as written and then scaling it", () => {
    for (const id of pick) {
      const r = byId(id);
      for (const target of [{ kcal: 450 }, { kcal: 700, protein: 50 }]) {
        const f = fitRecipe(r, products, {}, target)!;
        for (const n of [1, 3, 5, 12]) {
          const g = fitRecipe(scaleServings(r, n), products, {}, target)!;
          expect(g.recipe, `${id} for ${n}`).toEqual(scaleServings(f.recipe, n));
          expect(g.totals.perServing, `${id} for ${n}`).toEqual(f.totals.perServing);
          expect(g.totals.costPerServing, `${id} for ${n}`).toBe(f.totals.costPerServing);
          expect(g.changed).toBe(f.changed);
        }
      }
    }
  });

  it("a substitute and a diet are chosen for the recipe as written and then scaled", () => {
    const r = byId("chicken-chow-mein");
    const sub = { chicken: r.ingredients[0]!.subs![0]!.key };
    for (const n of [1, 3, 5]) {
      expect(withSubstitutes(scaleServings(r, n), sub)).toEqual(scaleServings(withSubstitutes(r, sub), n));
      const halal = recipeForDiet(scaleServings(r, n), { halalOnly: true })!;
      expect(halal.servings).toBe(n);
      expect(halal).toEqual(scaleServings(recipeForDiet(r, { halalOnly: true })!, n));
      expect(recipeForDiet(scaleServings(r, n), { veganOnly: true })).toBeNull();
    }
  });

  it("a chosen product (the Swap sheet) holds at every number of people, and so does the price of a serving with it", () => {
    const r = byId("chicken-chow-mein");
    const noodles = r.ingredients.findIndex((i) => i.key === "noodles");
    const options = candidates(products, r.ingredients[noodles]!);
    expect(options.length).toBeGreaterThan(1);
    const chosen = { noodles: options[options.length - 1]!.product.id };
    const base = recipeView(r, products, { servings: r.servings, chosen });
    expect(base.resolved.picks[noodles]!.product.id).toBe(chosen.noodles);
    for (const n of PEOPLE) {
      const v = recipeView(r, products, { servings: n, chosen });
      expect(v.resolved.picks[noodles]!.product.id, `Serves ${n}`).toBe(chosen.noodles);
      expect(v.totals!.perServing, `Serves ${n}`).toEqual(base.totals!.perServing);
      expect(v.totals!.costPerServing, `Serves ${n}`).toBe(base.totals!.costPerServing);
    }
  });

  it("whole items sold one at a time (peppers, a cucumber, an onion, wheat biscuits) cost a serving the same at every number of people", () => {
    for (const id of ["chickpea-tomato-salad", "tuna-chickpea-dip", "wheat-biscuits-berries", "beef-keema-peas"].filter((x) => RECIPES.some((r) => r.id === x))) {
      const r = byId(id);
      const base = recipeView(r, products, { servings: r.servings }).totals!;
      expect(base.costPerServing, id).not.toBeNull();
      for (const n of PEOPLE) expect(recipeView(r, products, { servings: n }).totals!.costPerServing, `${id} for ${n}`).toBe(base.costPerServing);
    }
    // and the basket is still whole items: 4 people need at least as many peppers as 2
    const bake = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "peppers"))!;
    const two = recipeView(bake, products, { servings: 2 }).resolved.picks.find((p) => p!.spec.pantry === "peppers")!;
    const eight = recipeView(bake, products, { servings: 8 }).resolved.picks.find((p) => p!.spec.pantry === "peppers")!;
    expect(eight.pieces ?? 0).toBeGreaterThanOrEqual(two.pieces ?? 0);
  });
});

describe("wraps: whole for each person only where the recipe gives each person whole wraps", () => {
  const wraps = (id: string, n: number, target: MealTarget | null = null) => {
    const v = recipeView(byId(id), products, { servings: n, target });
    return v.resolved.picks.find((p) => p!.spec.pantry === "wraps")!.spec.amount / 60;
  };
  it("quesadilla wedges (written for 4 with 2 wraps, half a wrap each) count wraps overall: more people never get fewer, and the count follows them", () => {
    expect(PEOPLE.map((n) => wraps("cheese-bean-quesadilla-wedges", n))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it("a recipe with one or two wraps each keeps the same whole number for every person", () => {
    for (const id of ["cheesy-egg-wraps", "chicken-fajitas", "chicken-shawarma-wraps"]) {
      const r = byId(id);
      const each = r.ingredients.find((i) => i.pantry === "wraps")!.amount / 60 / r.servings;
      for (const n of PEOPLE) expect(wraps(id, n), `${id} for ${n}`).toBe(each * n);
    }
  });
});

describe("the water in a method step goes with the people", () => {
  const soup = byId("chicken-sweetcorn-soup");
  const stockStep = soup.method.find((m) => /\d ml/.test(m))!;
  it("scales a millilitre amount, to 25 ml (50 ml from 250 ml), and leaves the rest of the step alone", () => {
    expect(soup.servings).toBe(2);
    expect(stockStep).toContain("800 ml");
    const at = (n: number) => scaleMethodMl(stockStep, n, soup.servings);
    expect(at(2)).toBe(stockStep);
    expect([1, 3, 6, 12].map((n) => /(\d[\d,]*) ml/.exec(at(n))![1])).toEqual(["400", "1,200", "2,400", "4,800"]);
    expect(at(6)).toBe(stockStep.replace("800 ml", "2,400 ml"));
    expect(scaleMethodMl("Simmer for 20 minutes at 180 degrees.", 6, 2)).toBe("Simmer for 20 minutes at 180 degrees.");
    expect(scaleMethodMl("Add 150 ml of water.", 1, 4)).toBe("Add 50 ml of water."); // 37.5 ml is below the smallest step
    expect(scaleMethodMl("Add 300 ml of water and 90 ml of milk.", 2, 4)).toBe("Add 150 ml of water and 50 ml of milk.");
    expect(scaleMethodMl("Add 300 ml of water.", 3, 0)).toBe("Add 300 ml of water.");
  });
  const withMl = RECIPES.filter((r) => r.method.some((m) => /\d ml\b/.test(m)));
  it("every recipe that names millilitres in its method changes them for another number of people, and only them", () => {
    expect(withMl.length).toBeGreaterThanOrEqual(11);
    for (const r of withMl) {
      for (const m of r.method) {
        expect(scaleMethodMl(m, r.servings, r.servings), r.id).toBe(m);
        const other = r.servings === 12 ? 6 : r.servings + 1;
        if (/\d ml\b/.test(m)) expect(scaleMethodMl(m, other, r.servings), `${r.id}: ${m}`).not.toBe(m);
        else expect(scaleMethodMl(m, other, r.servings), r.id).toBe(m);
        // twice the people, twice the water
        const amountOf = (x: string) => Number(/(\d[\d,]*) ml/.exec(x)![1]!.replace(",", ""));
        if (/\d ml\b/.test(m) && r.servings <= 6) expect(Math.abs(amountOf(scaleMethodMl(m, r.servings * 2, r.servings)) - 2 * amountOf(m)), r.id).toBeLessThanOrEqual(25);
      }
    }
  });
  // (only while the app has languages: it is English only since 2026-10-16, and the new detailed steps are not translated)
  it.skipIf(!LANGUAGES_ENABLED)("works in every language: each translated step keeps one 'N ml' with the same number", () => {
    for (const code of ["ar", "bn", "es", "gu", "it", "pa", "pl", "pt", "ro", "ur"]) {
      const dict = JSON.parse(readFileSync(`lib/mm/locales/${code}.json`, "utf8")) as Record<string, string>;
      for (const r of withMl) {
        for (const m of r.method.filter((x) => /\d ml\b/.test(x))) {
          const tr = dict[m];
          expect(tr, `${code}: ${m}`).toBeTruthy();
          const found = [...tr!.matchAll(/\b(\d+) ml\b/g)].map((x) => x[1]);
          expect(found, `${code}: ${r.id}`).toEqual([/(\d+) ml/.exec(m)![1]]);
          expect(scaleMethodMl(tr!, r.servings + (r.servings === 12 ? -1 : 1), r.servings), `${code}: ${r.id}`).not.toBe(tr);
        }
      }
    }
  });
});

describe("the note that amounts are rounded shows only when the amounts shown differ from the serving", () => {
  it("is never true at the recipe's own servings, and is true for half an egg at one person", () => {
    for (const r of RECIPES) {
      const v = recipeView(r, products, { servings: r.servings });
      expect(roundedAmountsMatter(v.resolved, v.totals!), r.id).toBe(false);
    }
    const soup = byId("chicken-sweetcorn-soup"); // half an egg a person, so one egg for one person is half as much again
    const one = recipeView(soup, products, { servings: 1 });
    expect(roundedAmountsMatter(one.resolved, one.totals!)).toBe(true);
    const six = recipeView(soup, products, { servings: 6 });
    expect(roundedAmountsMatter(six.resolved, six.totals!)).toBe(false);
  });
});
