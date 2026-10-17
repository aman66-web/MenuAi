import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// "Swap an ingredient for a product from another supermarket" (founder 2026-10-16), engine side: product keys, the rules for another shop's numbers (a label from a
// supermarket page, or Open Food Facts community numbers only while config.RECIPE_COMMUNITY_NUMBERS is on), picking and fitting with another shop's product, the
// totals per shop, the diet guard and shop-internal barcodes. The switch is a build-time constant, so these tests flip it through a mock of lib/mm/config.
const mode = vi.hoisted(() => ({ community: false }));
vi.mock("../lib/mm/config", async (original) => {
  const real = await original<typeof import("../lib/mm/config")>();
  return { ...real, get RECIPE_COMMUNITY_NUMBERS() { return mode.community; } };
});

import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { communityBlockedReason, crossCandidates, isRestrictedCode, othersForDiet, pickSource, swapEffect, withoutRestricted } from "../lib/mm/crossShop";
import {
  candidates, fitRecipe, ing, linesByShop, parseProductKey, pickFor, pickKey, productKey, recipeForDiet, recipeTotals, recipeView, resolveRecipe, scaleServings, withSubstitutes,
  type IngredientPick, type IngredientSpec, type OtherShops, type Recipe,
} from "../lib/mm/recipes";
import { decodeShopProducts, type PricedProduct, type ShopNutrition, type ShopProduct } from "../lib/mm/shopProducts";

afterEach(() => { mode.community = false; });

const home: ShopProduct[] = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));

const nut = (kcal: number, protein: number, carbs: number, fat: number, per: "g" | "ml" = "g", state = "", source?: "community"): ShopNutrition =>
  ({ kcal, protein, carbs, fat, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per, state, ...(source ? { source } : {}) }) as ShopNutrition;
const prod = (id: string, name: string, price: number, unitPrice: number | null, unit: string, nutrition: ShopNutrition | null, extra: Partial<ShopProduct> = {}): PricedProduct =>
  ({ id, name, price, unitPrice, unit, member: null, category: "Food cupboard", photoId: "", gtin: "", nutrition, ...extra });
const shops = (o: Record<string, readonly ShopProduct[]>): OtherShops => new Map(Object.entries(o));

const RICE: IngredientSpec = { key: "rice", label: "Rice", amount: 150, unit: "g", pantry: "rice", match: { all: ["rice"], any: ["basmati"], none: ["microwave"], kcal: [320, 400] } };
const BEANS: IngredientSpec = { key: "beans", label: "Beans", amount: 240, unit: "g", drained: true, pantry: "kidney-beans", match: { all: ["kidney", "beans"], kcal: [70, 140] } };

describe("product keys", () => {
  it("a plain id is the recipe's own shop, shop:id another supermarket's, and a key reads back to exactly its parts", () => {
    expect(productKey(null, "abc-123")).toBe("abc-123");
    expect(productKey(undefined, "abc-123")).toBe("abc-123");
    expect(productKey("asda", "6021")).toBe("asda:6021");
    expect(parseProductKey("abc-123")).toEqual({ shop: null, id: "abc-123" });
    expect(parseProductKey("asda:6021")).toEqual({ shop: "asda", id: "6021" });
    expect(parseProductKey("marks-and-spencer:C-12.5%25")).toEqual({ shop: "marks-and-spencer", id: "C-12.5%25" });
    for (const [shop, id] of [[null, "a1"], ["tesco", "281000"], ["waitrose", "123-456_789.x%2F"]] as const) expect(parseProductKey(productKey(shop, id))).toEqual({ shop, id });
  });

  it("refuses anything that is not a key: more than one colon, upper-case or odd shop ids, empty parts, '..', hostile or over-long strings and non-strings", () => {
    const bad: unknown[] = [
      "a:b:c", "Tesco:1", ":1", "asda:", "..", ".", "asda:..", "asda:a..b", "a..b", "", ":", "::", "1asda:1", "a:1", "as da:1", "asda:a b", "asda:a/b", "asda:a?b", "asda:<b>", "-asda:1",
      "__proto__", "asda:__proto__", "_x", "asda:_x", "constructor:1x:2", `asda:${"x".repeat(121)}`, "x".repeat(161), `${"s".repeat(32)}:1`,
      123, null, undefined, {}, [], ["asda:1"], true,
    ];
    for (const key of bad) expect(parseProductKey(key), String(key)).toBeNull();
    // the longest real id (Sainsbury's slugs are up to 120 characters) is fine
    expect(parseProductKey(`asda:${"x".repeat(120)}`)).not.toBeNull();
    expect(parseProductKey("x".repeat(120))).not.toBeNull();
  });

  it("every real product id of every published list is a valid plain key and a valid key under its shop", () => {
    const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as { retailers: Array<{ id: string; file: string }> };
    for (const r of manifest.retailers) {
      const file = JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8"));
      for (const p of decodeShopProducts(file)) {
        expect(parseProductKey(p.id), `${r.id}:${p.id}`).toEqual({ shop: null, id: p.id });
        expect(parseProductKey(productKey(r.id, p.id)), `${r.id}:${p.id}`).toEqual({ shop: r.id, id: p.id });
      }
    }
  });

  it("a pick's key is its shop and id, so the same id at two shops is two products", () => {
    const a = pickFor(RICE, prod("100", "Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1)));
    expect(pickKey(a)).toBe("100");
    expect(pickKey({ ...a, shop: "asda" })).toBe("asda:100");
    expect(pickKey({ ...a, shop: "tesco" })).not.toBe(pickKey({ ...a, shop: "asda" }));
  });
});

describe("another shop's numbers: only a supermarket label, or community numbers while the switch is on", () => {
  const label = prod("b1", "Laila Basmati Rice 2kg", 3.54, 1.77, "per kg", nut(375, 8.1, 84, 0.5)); // the recipe shop's page label for the identical barcode: no source marker
  const community = prod("c1", "Tilda Pure Original Basmati Rice 500g", 3, 6, "per kg", nut(351, 7.8, 77.7, 0.8, "g", "", "community"));
  const list: readonly ShopProduct[] = [community, label];

  it("with the switch off a community product is refused everywhere, a supermarket label is not", () => {
    mode.community = false;
    expect(candidates(list, RICE).map((c) => c.product.id)).toEqual(["b1"]);
    expect(candidates([community], RICE)).toEqual([]);
  });

  it("with the switch on both are offered, each marked by where its numbers come from", () => {
    mode.community = true;
    const c = candidates(list, RICE);
    expect(c.map((x) => x.product.id).sort()).toEqual(["b1", "c1"]);
    expect(pickSource(c.find((x) => x.product.id === "c1")!)).toBe("community");
    expect(pickSource({ ...c.find((x) => x.product.id === "b1")!, shop: "asda" })).toBe("sameBarcode");
    expect(pickSource(c.find((x) => x.product.id === "b1")!)).toBe("own");
  });

  it("the same list gives the answer for the switch as it is now (nothing cached across a change)", () => {
    mode.community = false;
    expect(candidates(list, RICE)).toHaveLength(1);
    mode.community = true;
    expect(candidates(list, RICE)).toHaveLength(2);
    mode.community = false;
    expect(candidates(list, RICE)).toHaveLength(1);
  });

  it("community numbers are never used for a drained amount, whatever the name says; a label that says drained still is", () => {
    const named = prod("d1", "Kidney Beans Drained 400g (240g*)", 0.5, 2, "per kg", nut(105, 8.1, 12.8, 0.6, "g", "", "community"));
    const plain = prod("d2", "Red Kidney Beans in Water 400g (240g*)", 0.39, 1.62, "per kg", nut(105, 8.1, 12.8, 0.6, "g", "", "community"));
    const page = prod("d3", "Red Kidney Beans in Water 400g (240g*)", 0.4, 1.7, "per kg", nut(105, 8.1, 12.8, 0.6, "g", "drained")); // Sainsbury's own page label, state kept
    for (const on of [false, true]) {
      mode.community = on;
      expect(candidates([named, plain, page], BEANS).map((c) => c.product.id), `switch ${on}`).toEqual(["d3"]);
    }
    // for an amount that is not drained, a community product is fine (when on)
    mode.community = true;
    expect(candidates([plain], { ...BEANS, drained: false }).map((c) => c.product.id)).toEqual(["d2"]);
  });

  it("community numbers are never used for a kind with no kcal range, a supermarket label is", () => {
    const paste = ing("curry-paste", 50);
    expect(paste.match.kcal).toBeUndefined();
    const fromCommunity = prod("p1", "Patak's Tikka Curry Paste 283g", 2, 7, "per kg", nut(0, 0, 0, 0, "g", "", "community")); // an Old El Paso style record with 0 kcal would pass a kind with no range
    const fromLabel = prod("p2", "Patak's Madras Curry Paste 283g", 2, 7, "per kg", nut(180, 3, 9, 14));
    for (const on of [false, true]) {
      mode.community = on;
      expect(candidates([fromCommunity, fromLabel], paste).map((c) => c.product.id), `switch ${on}`).toEqual(["p2"]);
    }
    expect(communityBlockedReason(paste)).toBe("noRange");
    expect(communityBlockedReason(BEANS)).toBe("drained");
    expect(communityBlockedReason(RICE)).toBeNull();
  });

  it("community numbers still pass every other rule: kcal range, unit, price, protein and fat limits, words", () => {
    mode.community = true;
    const out = prod("o1", "Basmati Rice 1kg", 2, 2, "per kg", nut(180, 4, 38, 0.4, "g", "", "community")); // cooked-rice calories: outside the dry range
    const ml = prod("o2", "Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1, "ml", "", "community"));
    const unpriced = { ...prod("o3", "Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1, "g", "", "community")), price: null } as ShopProduct;
    const micro = prod("o4", "Microwave Basmati Rice 250g", 1, 4, "per kg", nut(350, 8, 77, 1, "g", "", "community"));
    const ok = prod("o5", "Basmati Rice 2kg", 3.5, 1.75, "per kg", nut(350, 8, 77, 1, "g", "", "community"));
    expect(candidates([out, ml, unpriced, micro, ok], RICE).map((c) => c.product.id)).toEqual(["o5"]);
    const chicken = ing("chicken", 300);
    const fatty = prod("m1", "Chicken Breast Fillets 600g", 4, 6.7, "per kg", nut(160, 22, 0, 8, "g", "", "community")); // over the kind's fat limit
    const lean = prod("m2", "Chicken Breast Fillets 600g", 4, 6.7, "per kg", nut(124, 27, 0.5, 1.3, "g", "", "community"));
    expect(candidates([fatty, lean], chicken).map((c) => c.product.id)).toEqual(["m2"]);
  });

  it("every kind of the pantry: a product built for it is accepted as a supermarket label, and as community numbers only when on, not drained and with a kcal range", () => {
    let built = 0;
    for (const kind of PANTRY.values()) {
      const spec = ing(kind.key, 100);
      const m = kind.match;
      const words = [...m.all, ...(m.any ? [m.any[0]!] : [])].join(" ");
      const pack = m.pieceWeight ? (kind.key === "wraps" ? "6 x 62g" : "12 x 6g") : kind.unit === "ml" ? "1l" : "500g";
      const base = { name: `Brand ${words} ${pack}`, price: 1.5, unitPrice: 3, unit: kind.unit === "ml" ? "per litre" : "per kg" };
      const protein = (m.minProtein ?? 0) + 1;
      const fat = Math.min(m.maxFat ?? 3, 1);
      const kcal = m.kcal ? (m.kcal[0] + m.kcal[1]) / 2 : 120;
      const asLabel = prod("l1", base.name, base.price, base.unitPrice, base.unit, nut(kcal, protein, 5, fat, kind.unit, kind.drained ? "drained" : ""));
      const asCommunity = prod("c1", base.name, base.price, base.unitPrice, base.unit, nut(kcal, protein, 5, fat, kind.unit, "", "community"));
      const labelOk = candidates([asLabel], spec).length === 1;
      if (labelOk) built++;
      for (const on of [false, true]) {
        mode.community = on;
        const got = candidates([asCommunity], spec).length === 1;
        expect(got, `${kind.key}, switch ${on}`).toBe(labelOk && on && !kind.drained && !!kind.match.kcal);
        expect(candidates([asLabel], spec).length === 1, `${kind.key} label, switch ${on}`).toBe(labelOk); // a supermarket label never depends on the switch
      }
    }
    expect(built).toBeGreaterThanOrEqual(125); // the loop really exercised the kinds
  });

  it("a recipe never needs the switch for its own shop: the recipe shop's products are unchanged either way", () => {
    const rice = ing("rice", 150);
    mode.community = false;
    const off = candidates(home, rice).map((c) => c.product.id);
    mode.community = true;
    const on = candidates(home, rice).map((c) => c.product.id);
    expect(on).toEqual(off);
    expect(off.length).toBeGreaterThan(3);
  });
});

// ---- a synthetic other shop, made from the recipe shop's own products so every kind has candidates

const round2 = (v: number) => Math.round(v * 100) / 100;
let serial = 0;
/** Clones of the recipe shop's best products for every kind, as another supermarket's products: new ids, cheaper, numbers 3% apart where that stays in range. */
function shopFrom(source: "community" | "sameBarcode", perKind = 3, opts: { prefix?: string; skip?: ReadonlySet<string> } = {}): PricedProduct[] {
  const out: PricedProduct[] = [];
  const seen = new Set<string>();
  for (const kind of PANTRY.values()) {
    if (opts.skip?.has(kind.key)) continue;
    const spec = ing(kind.key, 100);
    for (const c of candidates(home, spec, false).slice(0, perKind)) {
      const p = c.product;
      if (!p.nutrition || seen.has(p.id)) continue;
      seen.add(p.id);
      const n = p.nutrition;
      const make = (f: number): PricedProduct => ({
        ...p, id: `${opts.prefix ?? "x"}${++serial}`, price: round2(p.price * 0.9), unitPrice: p.unitPrice === null ? null : round2(p.unitPrice * 0.9), gtin: "",
        nutrition: { ...n, kcal: round2(n.kcal * f), protein: round2(n.protein * f), carbs: round2(n.carbs * f), fat: round2(n.fat * f), kj: n.kj === null ? null : Math.round(n.kj * f), state: source === "community" ? "" : n.state, ...(source === "community" ? { source: "community" as const } : {}) },
      });
      let q = make(1.03);
      mode.community = true; // the clone is only kept if the kind accepts it (the range is checked by the very rules under test)
      if (!candidates([q], spec, false).length) q = make(1);
      mode.community = false;
      out.push(q);
    }
  }
  return out;
}
const asdaLabels = shopFrom("sameBarcode", 3, { prefix: "a" });
const asdaCommunity = shopFrom("community", 3, { prefix: "c" });

const recipeById = (id: string) => RECIPES.find((r) => r.id === id)!;
const nonCupboard = (r: Recipe) => r.ingredients.filter((i) => !i.cupboard);

describe("choosing another shop's product", () => {
  const recipe = recipeById("chicken-chow-mein");
  const others = shops({ asda: asdaLabels });

  it("an ingredient takes the product chosen at another shop (its own price, pack and numbers); everything else is as before", () => {
    const base = resolveRecipe(recipe, home);
    const key = recipe.ingredients.find((i) => i.pantry === "chicken")?.key ?? nonCupboard(recipe)[0]!.key;
    const i = recipe.ingredients.findIndex((s) => s.key === key);
    const alt = crossCandidates(others, base.picks[i]!.spec)[0]!.picks[0]!;
    const res = resolveRecipe(recipe, home, { [key]: pickKey(alt) }, others);
    expect(res.stale).toBeUndefined();
    expect(res.complete).toBe(true);
    const pick = res.picks[i]!;
    expect(pick.shop).toBe("asda");
    expect(pick.product).toBe(alt.product);
    expect(pick.packs).toBe(pickFor(base.picks[i]!.spec, alt.product).packs);
    expect(pick.basketCost).toBe(pickFor(base.picks[i]!.spec, alt.product).basketCost);
    res.picks.forEach((p, j) => { if (j !== i) expect(p, recipe.ingredients[j]!.key).toEqual(base.picks[j]); });
    // the serving: the difference is exactly the difference of the two labels for the amount (swapEffect), to rounding
    const a = recipeTotals(base)!;
    const b = recipeTotals(res)!;
    const effect = swapEffect(base.picks[i]!, pick, recipe.servings)!;
    expect(Math.abs(b.perServing.kcal - a.perServing.kcal - effect.kcal)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.perServing.protein - a.perServing.protein - effect.protein)).toBeLessThanOrEqual(0.15);
  });

  it("a plain id still means the recipe's own shop, exactly as before", () => {
    const base = resolveRecipe(recipe, home);
    const i = 1;
    const other = candidates(home, base.picks[i]!.spec, false)[1];
    if (!other) return;
    const res = resolveRecipe(recipe, home, { [base.picks[i]!.spec.key]: other.product.id }, others);
    expect(res.picks[i]!.product.id).toBe(other.product.id);
    expect(res.picks[i]!.shop).toBeUndefined();
    expect(res.stale).toBeUndefined();
    expect(resolveRecipe(recipe, home, { [base.picks[i]!.spec.key]: other.product.id })).toEqual(res);
  });

  it("a choice that is no longer there is stale and shows the usual product; a shop whose list is not loaded yet is ignored without a word", () => {
    const base = resolveRecipe(recipe, home);
    const key = nonCupboard(recipe)[0]!.key;
    const gone = resolveRecipe(recipe, home, { [key]: "asda:does-not-exist" }, others);
    expect(gone.stale).toEqual([key]);
    expect(gone.picks).toEqual(base.picks);
    const notYet = resolveRecipe(recipe, home, { [key]: "tesco:12345" }, others); // tesco's list isn't in `others`
    expect(notYet.stale).toBeUndefined();
    expect(notYet.picks).toEqual(base.picks);
    expect(resolveRecipe(recipe, home, { [key]: "asda:does-not-exist" }).stale).toBeUndefined(); // no `others` at all
    // a product of the shop that doesn't fit this ingredient is stale too: it must pass the ingredient's own rules there
    const wrong = asdaLabels.find((p) => !candidates([p], base.picks[0]!.spec, false).length)!;
    expect(resolveRecipe(recipe, home, { [recipe.ingredients[0]!.key]: `asda:${wrong.id}` }, others).stale).toEqual([recipe.ingredients[0]!.key]);
  });

  it("a recipe the recipe shop can't complete is completed by another shop's product", () => {
    const noodles = ing("egg-noodles", 100, { subs: [] });
    const rice = ing("rice", 150);
    const r: Recipe = { id: "test-noodles", name: "T", blurb: "", servings: 2, minutes: 10, ingredients: [rice, noodles], method: [] };
    const mini = [prod("r1", "Basmati Rice 2kg", 3.5, 1.75, "per kg", nut(350, 7.4, 78, 0.6))];
    const theirs = prod("n1", "Dried Egg Noodles 250g", 1.2, 4.8, "per kg", nut(360, 12, 70, 3));
    const lists = shops({ asda: [theirs] });
    expect(resolveRecipe(r, mini, {}, lists).complete).toBe(false);
    expect(recipeTotals(resolveRecipe(r, mini, {}, lists))).toBeNull();
    const res = resolveRecipe(r, mini, { [noodles.key]: "asda:n1" }, lists);
    expect(res.complete).toBe(true);
    expect(res.picks[1]).toMatchObject({ shop: "asda", packs: 1 });
    const t = recipeTotals(res)!;
    expect(t.perServing.kcal).toBe(Math.round((350 * 1.5 + 360) / 2));
    expect(t.byShop.map((s) => s.shop)).toEqual([null, "asda"]);
  });

  it("choices coming from storage can't reach into the object's own properties", () => {
    const hostile = JSON.parse('{"__proto__":"asda:a1","constructor":"asda:a1","toString":"asda:a1","hasOwnProperty":"a1"}') as Record<string, string>;
    const res = resolveRecipe(recipe, home, hostile, others);
    expect(res.picks).toEqual(resolveRecipe(recipe, home).picks);
    expect(res.stale).toBeUndefined();
    // an ingredient whose key is a name every object inherits finds nothing in choices that don't own it
    const r2: Recipe = { ...recipe, ingredients: recipe.ingredients.map((i, n) => (n === 0 ? { ...i, key: "constructor" } : i)) };
    expect(() => resolveRecipe(r2, home, {}, others)).not.toThrow();
    expect(resolveRecipe(r2, home, {}, others)).toEqual(resolveRecipe(r2, home));
    expect(resolveRecipe(r2, home, { rice: "asda:a1" }, others).stale).toBeUndefined();
  });
});

describe("fitting a recipe keeps the product chosen at another shop (the pin must carry the shop)", () => {
  const targets = [{ kcal: 400 }, { kcal: 600 }, { kcal: 800 }, { kcal: 600, protein: 45 }, { kcal: 500, protein: 30, carbsMax: 60, fatMax: 20 }];
  const others = shops({ asda: asdaLabels });

  it("for several targets and several recipes, every product chosen elsewhere is still the one used, with its own numbers", () => {
    let checked = 0;
    for (const recipe of RECIPES.filter((r) => ["dinner", "lunch"].includes(r.meal ?? "")).slice(0, 14)) {
      const id = recipe.id;
      const base = resolveRecipe(recipe, home);
      if (!base.complete) continue;
      // choose another shop's first product for every ingredient it has one for
      const chosen: Record<string, string> = {};
      base.picks.forEach((p, i) => {
        const alt = crossCandidates(others, p!.spec)[0]?.picks[0];
        if (alt && !recipe.ingredients[i]!.cupboard) chosen[p!.spec.key] = pickKey(alt);
      });
      expect(Object.keys(chosen).length, id).toBeGreaterThan(1);
      for (const target of targets) {
        const f = fitRecipe(recipe, home, chosen, target, others);
        expect(f, `${id} ${JSON.stringify(target)}`).not.toBeNull();
        expect(f!.resolved.stale, id).toBeUndefined();
        for (const [key, value] of Object.entries(chosen)) {
          const p = f!.resolved.picks.find((x) => x!.spec.key === key)!;
          expect(pickKey(p), `${id} ${key} after fitting`).toBe(value);
          expect(p.shop).toBe("asda");
        }
        // the numbers shown are the arithmetic on those very labels, for the fitted amounts
        const labelKcal = f!.resolved.picks.reduce((x, p) => x + (p!.product.nutrition!.kcal * p!.spec.amount) / 100, 0) / recipe.servings;
        expect(Math.abs(f!.totals.perServing.kcal - labelKcal)).toBeLessThanOrEqual(0.5 + 1e-9);
        // and it is the same answer as resolving the fitted recipe with the same choices
        expect(recipeTotals(resolveRecipe(f!.recipe, home, chosen, others))).toEqual(f!.totals);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it("without `others` the choice is quietly ignored and the recipe is fitted with the usual products (as it would be before the lists arrive)", () => {
    const recipe = recipeById("chicken-chow-mein");
    const key = nonCupboard(recipe)[0]!.key;
    const f = fitRecipe(recipe, home, { [key]: "asda:a1" }, { kcal: 600 });
    expect(f).not.toBeNull();
    expect(f!.resolved.picks.every((p) => p!.shop === undefined)).toBe(true);
    expect(f!.resolved.stale).toBeUndefined();
  });

  it("a stale choice is still reported after fitting, and the ingredient shows the usual product", () => {
    const recipe = recipeById("chicken-chow-mein");
    const key = nonCupboard(recipe)[0]!.key;
    const f = fitRecipe(recipe, home, { [key]: "asda:does-not-exist" }, { kcal: 600, protein: 40 }, others)!;
    expect(f.resolved.stale).toEqual([key]);
    expect(f.resolved.picks.every((p) => p!.shop === undefined)).toBe(true);
    // through the page's pipeline, for more people too
    const view = recipeView(recipe, home, { servings: 6, chosen: { [key]: "asda:does-not-exist" }, target: { kcal: 600 }, others });
    expect(view.resolved.stale).toEqual([key]);
    expect(view.resolved.basis?.stale).toEqual([key]);
    expect(recipeView(recipe, home, { servings: 6, chosen: { [key]: "asda:does-not-exist" }, others }).resolved.stale).toEqual([key]);
  });
});

describe("a serving is the same serving for 1 to 12 people with a product from another shop", () => {
  const PEOPLE = Array.from({ length: 12 }, (_, i) => i + 1);

  function check(label: string, otherShops: OtherShops, expectCross: boolean) {
    let withCross = 0;
    for (const recipe of RECIPES) {
      const base = resolveRecipe(recipe, home);
      if (!base.complete) continue;
      const chosen: Record<string, string> = {};
      base.picks.forEach((p, i) => {
        if (recipe.ingredients[i]!.cupboard) return;
        for (const alt of crossCandidates(otherShops, p!.spec).flatMap((c) => c.picks)) { chosen[p!.spec.key] = pickKey(alt); break; }
      });
      for (const target of [null, { kcal: 600, protein: 40 }]) {
        const ref = recipeView(recipe, home, { servings: recipe.servings, chosen, target, others: otherShops });
        expect(ref.totals, `${label} ${recipe.id}`).not.toBeNull();
        const crossKeys = ref.resolved.picks.filter((p) => p!.shop).map((p) => p!.spec.key);
        expect(crossKeys.length > 0, `${label} ${recipe.id} has a product from another shop`).toBe(expectCross && Object.keys(chosen).length > 0);
        if (crossKeys.length) withCross++;
        const refKeys = ref.resolved.picks.map((p) => pickKey(p!));
        for (const n of PEOPLE) {
          const view = recipeView(recipe, home, { servings: n, chosen, target, others: otherShops });
          const w = `${label} ${recipe.id} for ${n}${target ? " fitted" : ""}`;
          expect(view.totals, w).not.toBeNull();
          expect(view.totals!.perServing, w).toEqual(ref.totals!.perServing);
          expect(view.totals!.label, w).toEqual(ref.totals!.label);
          expect(view.totals!.costPerServing, w).toBe(ref.totals!.costPerServing);
          expect(view.totals!.community, w).toEqual(ref.totals!.community);
          expect(view.totals!.communityShare, w).toBe(ref.totals!.communityShare);
          expect(view.resolved.picks.map((p) => pickKey(p!)), `${w}: products`).toEqual(refKeys);
          expect(view.resolved.picks.map((p) => p!.shop), `${w}: shops`).toEqual(ref.resolved.picks.map((p) => p!.shop));
          // the shopping: whole lines per shop whose rounded baskets add up to the headline
          const t = view.totals!;
          expect(t.basket, w).toBe(Math.round(t.byShop.reduce((x, s) => x + Math.round(s.basket * 100), 0)) / 100);
          expect(new Set(t.byShop.map((s) => s.shop)).size, `${w}: one line a shop`).toBe(t.byShop.length);
          expect(t.byShop[0]!.shop === null || t.byShop.every((s) => s.shop !== null), `${w}: the recipe's shop first`).toBe(true);
          const lines = linesByShop(view.resolved);
          expect(lines.map((l) => l.shop), w).toEqual(t.byShop.map((s) => s.shop));
          expect(lines.reduce((x, l) => x + l.picks.length, 0), w).toBe(view.resolved.picks.length);
          // the people only change the amounts and the basket, never the labels used
          expect(view.resolved.stale, w).toBeUndefined();
        }
      }
    }
    return withCross;
  }

  it("a supermarket label from another shop: all recipes, as written and fitted", () => {
    mode.community = false;
    expect(check("labels", shops({ asda: asdaLabels }), true)).toBeGreaterThan(150);
  });

  it("community numbers, switch on: all recipes (drained kinds and kinds with no range stay at the recipe's own shop)", () => {
    mode.community = true;
    expect(check("community", shops({ asda: asdaCommunity }), true)).toBeGreaterThan(150);
    // no community product was chosen for a drained or range-less kind
    for (const recipe of RECIPES) {
      for (const spec of recipe.ingredients.filter((i) => i.drained || !i.match.kcal)) {
        for (const c of crossCandidates(shops({ asda: asdaCommunity }), spec).flatMap((x) => x.picks)) expect(c.product.nutrition?.source, `${recipe.id} ${spec.key}`).toBeUndefined();
      }
    }
  });

  it("community numbers, switch off: a choice of a community product is stale and the recipe shows the usual products at every number of people", () => {
    mode.community = false;
    const recipe = recipeById("chicken-chow-mein");
    mode.community = true;
    const chosen: Record<string, string> = {};
    const base = resolveRecipe(recipe, home);
    base.picks.forEach((p, i) => { const alt = crossCandidates(shops({ asda: asdaCommunity }), p!.spec)[0]?.picks[0]; if (alt && !recipe.ingredients[i]!.cupboard) chosen[p!.spec.key] = pickKey(alt); });
    expect(Object.keys(chosen).length).toBeGreaterThan(0);
    mode.community = false;
    for (const n of PEOPLE) {
      const view = recipeView(recipe, home, { servings: n, chosen, others: shops({ asda: asdaCommunity }) });
      expect(view.resolved.stale?.sort(), `for ${n}`).toEqual(Object.keys(chosen).sort());
      expect(view.resolved.picks.every((p) => p!.shop === undefined), `for ${n}`).toBe(true);
      expect(view.totals!.community).toEqual([]);
    }
    expect(crossCandidates(shops({ asda: asdaCommunity }), base.picks[0]!.spec)).toEqual([]);
  });
});

describe("totals shop by shop", () => {
  // rice at the recipe shop; chicken and olive oil (a store-cupboard item) at another shop; everything priced by the kilo or litre so every figure can be done by hand
  const rice = { ...ing("rice", 150), cupboard: false };
  const chicken = ing("chicken", 300);
  const oil: IngredientSpec = { key: "oil", label: "Olive oil", amount: 15, unit: "ml", pantry: "olive-oil", cupboard: true, match: { all: ["olive", "oil"], kcal: [800, 900] } };
  const recipe: Recipe = { id: "test-by-shop", name: "T", blurb: "", servings: 2, minutes: 10, ingredients: [rice, chicken, oil], method: [] };
  const homeList = [prod("h1", "Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1))];
  const asda = [
    prod("a1", "ASDA Chicken Breast Fillets 600g", 4.5, 7.5, "per kg", nut(124, 27, 0.5, 1.3, "g", "", "community")),
    prod("a2", "ASDA Extra Virgin Olive Oil 500ml", 3, 6, "per litre", nut(884, 0, 0, 100, "ml", "", "community")),
  ];
  const chosen = { chicken: "asda:a1", oil: "asda:a2" };

  it("one line per shop in the order the recipe uses them, the recipe's own shop first; the headline is the sum of the rounded lines; 'I have this' is in no shop's basket", () => {
    mode.community = true;
    const res = resolveRecipe(recipe, homeList, chosen, shops({ asda }));
    expect(res.stale).toBeUndefined();
    const t = recipeTotals(res)!;
    expect(t.byShop).toEqual([
      { shop: null, basket: 2, used: 0.15, products: 1 },
      { shop: "asda", basket: 7.5, used: 1.17, products: 2 },
    ]);
    expect(t.basket).toBe(9.5);
    expect(t.costPerServing).toBe(1.32); // (0.30 + 2.25 + 0.09) / 2
    const withOil = recipeTotals(res, new Set(["olive-oil"]))!;
    expect(withOil.byShop).toEqual([
      { shop: null, basket: 2, used: 0.15, products: 1 },
      { shop: "asda", basket: 4.5, used: 1.17, products: 1 },
    ]);
    expect(withOil.basket).toBe(6.5);
    expect(withOil.costPerServing).toBe(1.32); // "I have this" never changes a serving's price
    expect(withOil.perServing).toEqual(t.perServing);
    // when everything at a shop is "I have this" the shop has nothing to buy and no line
    const cupboardOnly = resolveRecipe({ ...recipe, ingredients: [rice, oil] }, homeList, { oil: "asda:a2" }, shops({ asda }));
    expect(recipeTotals(cupboardOnly, new Set(["olive-oil"]))!.byShop).toEqual([{ shop: null, basket: 2, used: 0.15, products: 1 }]);
    expect(recipeTotals(cupboardOnly, new Set(["olive-oil"]))!.basket).toBe(2);
  });

  it("calories, protein and the rest are plain arithmetic on the labels, and the community ones are named, with their share of the calories", () => {
    mode.community = true;
    const t = recipeTotals(resolveRecipe(recipe, homeList, chosen, shops({ asda })))!;
    // rice 150 g x 350 = 525, chicken 300 g x 124 = 372, oil 15 ml x 884 = 132.6: 1029.6 kcal for 2
    expect(t.perServing.kcal).toBe(515);
    expect(t.perServing.protein).toBe(Math.round(((8 * 1.5 + 27 * 3) / 2) * 10) / 10);
    expect(t.community).toEqual(["Chicken breast fillets", "Olive oil"]);
    expect(t.communityShare).toBe(Math.round(((372 + 132.6) / 1029.6) * 100) / 100); // 0.49
    expect(t.communityShare).toBe(0.49);
    // with no product from another shop nothing is community, and the totals are what they were
    const alone = recipeTotals(resolveRecipe(recipe, [...homeList, prod("h2", "Chicken Breast Fillets 640g", 4.62, 7.22, "per kg", nut(137, 30.6, 0, 1.6)), prod("h3", "Olive Oil 500ml", 3.5, 7, "per litre", nut(900, 0, 0, 100, "ml"))]))!;
    expect(alone.community).toEqual([]);
    expect(alone.communityShare).toBe(0);
    expect(alone.byShop).toHaveLength(1);
    expect(alone.byShop[0]!.shop).toBeNull();
    expect(alone.basket).toBe(alone.byShop[0]!.basket);
  });

  it("a single-shop recipe has one line and the same basket and price it always had", () => {
    for (const id of ["chicken-chow-mein", "egg-fried-rice", "beef-chilli"]) {
      const r = recipeById(id);
      const res = resolveRecipe(r, home);
      const t = recipeTotals(res)!;
      expect(t.byShop).toHaveLength(1);
      expect(t.byShop[0]!.shop).toBeNull();
      const sum = res.picks.reduce((x, p) => x + p!.basketCost, 0);
      expect(t.basket).toBe(Math.round(sum * 100) / 100);
      expect(t.byShop[0]).toMatchObject({ basket: t.basket, products: r.ingredients.length });
      expect(t.community).toEqual([]);
      expect(t.communityShare).toBe(0);
    }
  });

  it("the price a serving is unknown while any product has no price per kg or litre", () => {
    mode.community = true;
    const noUnit = [prod("a3", "ASDA Chicken Breast Fillets 600g", 4.5, null, "", nut(124, 27, 0.5, 1.3, "g", "", "community"))];
    const t = recipeTotals(resolveRecipe(recipe, homeList, { chicken: "asda:a3", oil: "asda:a2" }, shops({ asda: [...noUnit, asda[1]!] })))!;
    // 600 g pack, 300 g used: the price comes from the pack size in the name instead (price x amount / size), so it IS known
    expect(t.costPerServing).not.toBeNull();
    const bare = prod("a4", "ASDA Chicken Breast Fillets", 4.5, null, "", nut(124, 27, 0.5, 1.3, "g", "", "community")); // no size, no unit price
    const u = recipeTotals(resolveRecipe(recipe, homeList, { chicken: "asda:a4", oil: "asda:a2" }, shops({ asda: [bare, asda[1]!] })))!;
    expect(u.costPerServing).toBeNull();
    expect(u.byShop.find((s) => s.shop === "asda")!.used).toBeNull();
    expect(u.byShop.find((s) => s.shop === null)!.used).toBe(0.15);
    expect(u.basket).toBe(2 + 4.5 + 3);
  });

  it("a recipe for more people: the baskets follow the amounts shown, a serving stays the same", () => {
    mode.community = true;
    const view = recipeView(recipe, homeList, { servings: 8, chosen, others: shops({ asda }) });
    const ref = recipeView(recipe, homeList, { servings: 2, chosen, others: shops({ asda }) });
    expect(view.totals!.perServing).toEqual(ref.totals!.perServing);
    expect(view.totals!.costPerServing).toBe(ref.totals!.costPerServing);
    // 8 people: rice 600 g (1 pack of 1 kg = £2), chicken 1,200 g (2 packs of 600 g = £9), oil 60 ml (1 bottle = £3)
    expect(view.totals!.byShop).toEqual([
      { shop: null, basket: 2, used: 0.15, products: 1 },
      { shop: "asda", basket: 12, used: 1.17, products: 2 },
    ]);
    expect(view.totals!.basket).toBe(14);
    expect(view.resolved.picks.map((p) => p!.shop)).toEqual([undefined, "asda", "asda"]);
  });

  it("the shopping list lines: the recipe's shop first, the others in the order the recipe first uses them, never a cupboard item the person has", () => {
    mode.community = true;
    const tesco = [prod("t1", "Tesco Basmati Rice 1kg", 1.9, 1.9, "per kg", nut(350, 8, 77, 1, "g", "", "community"))];
    const two = shops({ asda, tesco });
    const withOil = [...homeList, prod("h4", "Olive Oil 500ml", 3.5, 7, "per litre", nut(900, 0, 0, 100, "ml"))];
    const res = resolveRecipe(recipe, withOil, { rice: "tesco:t1", chicken: "asda:a1" }, two);
    expect(linesByShop(res).map((l) => [l.shop, l.picks.map((p) => p.spec.key)])).toEqual([[null, ["oil"]], ["tesco", ["rice"]], ["asda", ["chicken"]]]);
    expect(linesByShop(res, new Set(["olive-oil"])).map((l) => l.shop)).toEqual(["tesco", "asda"]);
    expect(recipeTotals(res)!.byShop.map((s) => s.shop)).toEqual([null, "tesco", "asda"]);
  });
});

describe("swapEffect", () => {
  const spec = { ...ing("rice", 150) };
  const cur = pickFor(spec, prod("h1", "Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1)));
  const alt = pickFor(spec, prod("a1", "Tilda Basmati Rice 500g", 3, 6, "per kg", nut(375, 8.4, 84, 0.5)));
  it("is the difference of the two labels for the amount, per serving", () => {
    expect(swapEffect(cur, alt, 2)).toEqual({ kcal: 19, protein: 0.3 }); // (375 - 350) x 1.5 / 2 = 18.75; (8.4 - 8) x 1.5 / 2 = 0.3
    expect(swapEffect(cur, alt, 1)).toEqual({ kcal: 38, protein: 0.6 });
    expect(swapEffect(alt, cur, 2)).toEqual({ kcal: -19, protein: -0.3 });
  });
  it("is zero (never -0) for the same numbers, and null when a label or the servings are missing", () => {
    const same = swapEffect(cur, cur, 2)!;
    expect(Object.is(same.kcal, 0) && Object.is(same.protein, 0)).toBe(true);
    const tiny = swapEffect(cur, pickFor(spec, prod("a2", "Rice 1kg", 2, 2, "per kg", nut(349.9, 7.99, 77, 1))), 2)!;
    expect(Object.is(tiny.kcal, 0) && Object.is(tiny.protein, 0)).toBe(true);
    expect(swapEffect(cur, { product: prod("n", "Rice", 1, 1, "per kg", null) }, 2)).toBeNull();
    expect(swapEffect({ ...cur, product: prod("n", "Rice", 1, 1, "per kg", null) }, alt, 2)).toBeNull();
    expect(swapEffect(cur, alt, 0)).toBeNull();
    expect(swapEffect(cur, alt, -2)).toBeNull();
    expect(swapEffect(cur, alt, Number.NaN)).toBeNull();
  });
});

describe("crossCandidates", () => {
  it("lists each shop's products for the ingredient in the Map's order, with the shop on each pick, and leaves out a shop with none", () => {
    const rice = ing("rice", 150);
    const asda = [prod("a1", "Tilda Basmati Rice 500g", 3, 6, "per kg", nut(351, 7.8, 77.7, 0.8)), prod("a2", "Laila Basmati Rice 2kg", 3.54, 1.77, "per kg", nut(375, 8.1, 84, 0.5))];
    const tesco = [prod("t1", "Tesco Chicken Breast 500g", 3, 6, "per kg", nut(110, 23, 0, 1.2))]; // no rice
    const morrisons = [prod("m1", "Kohinoor Basmati Rice 2kg", 5, 2.5, "per kg", nut(356, 9.4, 77, 1.2))];
    const out = crossCandidates(shops({ morrisons, tesco, asda }), rice);
    expect(out.map((s) => s.shop)).toEqual(["morrisons", "asda"]);
    expect(out[1]!.picks.map((p) => p.product.id)).toEqual(candidates(asda, rice).map((p) => p.product.id));
    expect(out.every((s) => s.picks.every((p) => p.shop === s.shop))).toBe(true);
    expect(crossCandidates(shops({ tesco }), rice)).toEqual([]);
    expect(crossCandidates(new Map(), rice)).toEqual([]);
    // an id a choice couldn't be kept under is never offered
    expect(crossCandidates(shops({ "Bad_Shop": asda, "x": asda }), rice)).toEqual([]);
  });

  it("offers a halal recipe only the products its shop calls halal", () => {
    const halal = recipeForDiet(recipeById("chicken-chow-mein"), { halalOnly: true });
    if (!halal) return;
    const spec = halal.ingredients.find((i) => i.pantry === "chicken")!;
    const list = [prod("p1", "Asda Chicken Breast Fillets 600g", 4.5, 7.5, "per kg", nut(124, 27, 0.5, 1.3)), prod("p2", "Tariq Halal Chicken Breast Fillets 1kg", 7, 7, "per kg", nut(110, 24, 0, 1.4))];
    expect(crossCandidates(shops({ asda: list }), spec).flatMap((s) => s.picks.map((p) => p.product.id))).toEqual(["p2"]);
  });
});

describe("the diet guard on another shop's products", () => {
  const items = [
    prod("1", "Asda Chicken Breast Fillets 600g", 4.5, 7.5, "per kg", nut(124, 27, 0.5, 1.3)),
    prod("2", "Quorn Vegetarian Chicken Style Pieces 300g", 3, 10, "per kg", nut(100, 14, 4, 2)),
    prod("3", "Asda British Semi Skimmed Milk 2L", 1.5, 0.75, "per litre", nut(47, 3.6, 4.8, 1.7, "ml")),
    prod("4", "Asda Smoked Salmon 100g", 3, 30, "per kg", nut(170, 21, 0, 9)),
    prod("5", "Asda Pork Sausages 400g", 2, 5, "per kg", nut(260, 13, 4, 21)),
    prod("6", "Tariq Halal Chicken Breast Fillets 1kg", 7, 7, "per kg", nut(110, 24, 0, 1.4)),
    prod("7", "Asda Beef Mince 500g", 3.5, 7, "per kg", nut(176, 20, 0, 10)),
    prod("8", "Asda Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1)),
    prod("9", "Asda Plant Based Oat Drink 1L", 1.1, 1.1, "per litre", nut(40, 1, 7, 1, "ml")),
  ];
  const names = (o: OtherShops) => (o.get("asda") ?? []).map((p) => p.id);
  const lists = shops({ asda: items, tesco: items.slice(0, 2) });

  it("removes what a name plainly says doesn't suit, and nothing else", () => {
    expect(names(othersForDiet(lists, { vegetarianOnly: true }))).toEqual(["2", "3", "8", "9"]);
    expect(names(othersForDiet(lists, { veganOnly: true }))).toEqual(["2", "8", "9"]);
    expect(names(othersForDiet(lists, { pescatarianOnly: true }))).toEqual(["2", "3", "4", "8", "9"]);
    expect(names(othersForDiet(lists, { noPork: true }))).not.toContain("5");
    expect(names(othersForDiet(lists, { noBeef: true }))).not.toContain("7");
    expect(names(othersForDiet(lists, { halalOnly: true }))).toEqual(["2", "3", "4", "6", "8", "9"]); // fish isn't meat: nothing here says it isn't halal, the pack still has to be checked
    expect(othersForDiet(lists, { vegetarianOnly: true }).get("tesco")!.map((p) => p.id)).toEqual(["2"]);
  });

  it("only ever removes: every product kept is one of the originals, in the same order", () => {
    for (const diet of [{ vegetarianOnly: true }, { veganOnly: true }, { halalOnly: true }, { noPork: true, noBeef: true }, { pescatarianOnly: true }]) {
      const got = names(othersForDiet(lists, diet));
      const original = names(lists);
      expect(got.every((id) => original.includes(id))).toBe(true);
      expect(got).toEqual(original.filter((id) => got.includes(id)));
    }
  });

  it("returns the very same Map and arrays for the same input (the engine caches per array), and the input itself when no diet applies", () => {
    expect(othersForDiet(lists, {})).toBe(lists);
    expect(othersForDiet(lists, { avoidAllergens: ["milk"] })).toBe(lists); // allergens of these products are not read: never applied here
    const a = othersForDiet(lists, { vegetarianOnly: true });
    expect(othersForDiet(lists, { vegetarianOnly: true })).toBe(a);
    expect(othersForDiet(lists, { vegetarianOnly: true }).get("asda")).toBe(a.get("asda"));
    const b = othersForDiet(lists, { veganOnly: true });
    expect(b).not.toBe(a);
    // a new Map holding the same arrays shares the filtered arrays
    expect(othersForDiet(new Map(lists), { vegetarianOnly: true }).get("asda")).toBe(a.get("asda"));
  });

  it("a choice the diet no longer allows is stale and the recipe shows the usual product", () => {
    const recipe = recipeById("chicken-chow-mein");
    const spec = recipe.ingredients.find((i) => i.pantry === "chicken");
    if (!spec) return;
    const chicken = prod("c9", "Asda Chicken Breast Fillets 600g", 4.5, 7.5, "per kg", nut(124, 27, 0.5, 1.3));
    const raw = shops({ asda: [chicken] });
    expect(resolveRecipe(recipe, home, { [spec.key]: "asda:c9" }, raw).picks[recipe.ingredients.indexOf(spec)]!.shop).toBe("asda");
    const vegetarian = resolveRecipe(recipe, home, { [spec.key]: "asda:c9" }, othersForDiet(raw, { vegetarianOnly: true }));
    expect(vegetarian.stale).toEqual([spec.key]);
    expect(vegetarian.picks[recipe.ingredients.indexOf(spec)]!.shop).toBeUndefined();
  });
});

describe("shop-internal barcodes", () => {
  // the pipeline's own rule (tools/groceries/build_groceries.py restricted_code), checked against the table its Python function gives
  const table: Array<[string, boolean]> = [
    ["5000168001173", false], ["5054781025702", false], ["2000000000017", true], ["2999999999999", true], ["0200000000007", true], ["0400000000005", true], ["0300000000009", false], ["0500000000009", false],
    ["4000000000000", false], ["5", true], ["12345", true], ["1234567", true], ["12345678", false], ["20000000", true], ["29999999", true], ["00012345", true], ["00000000", false], ["0000000012", true],
    ["3000000", true], ["30000000", false], ["50000000", false], ["0000020", true], ["0000000000002", true], ["000000000000", false], ["abcd", false], ["", false], [" 5000168001173 ", false],
    ["20123456", true], ["02345678", true], ["0123456", true], ["96385074", false], ["80042556", false], ["5010061001613", false], ["5020580441210", false], ["8901047039034", false],
    ["04000000000012", false], ["0400000000012", true], ["040000000012", false], ["000000000000000", false], ["22222222222222", true], ["1234567890123", false], ["1234567890128", false], ["02000000000019", true],
  ];
  it("recognises exactly what the pipeline does", () => {
    for (const [code, restricted] of table) expect(isRestrictedCode(code), JSON.stringify(code)).toBe(restricted);
  });
  it("a recipe list never offers a product with one", () => {
    const rows = [
      prod("ok", "Tilda Basmati Rice 500g", 3, 6, "per kg", nut(351, 7.8, 77.7, 0.8), { gtin: "5011157630113" }),
      prod("own", "Asda Own Basmati Rice 1kg", 2, 2, "per kg", nut(350, 8, 77, 1), { gtin: "2000000000017" }),
      prod("short", "Asda Smart Price Rice 1kg", 1, 1, "per kg", nut(350, 8, 77, 1), { gtin: "00012345" }),
      prod("none", "Asda Basmati Rice 2kg", 3, 1.5, "per kg", nut(350, 8, 77, 1)),
    ];
    expect(withoutRestricted(rows).map((p) => p.id)).toEqual(["ok", "none"]);
  });
});

describe("the recipe is unchanged when no other shop is involved", () => {
  it("resolving, fitting and the totals give what they gave before for every recipe, with or without an (empty) others", () => {
    const empty: OtherShops = new Map();
    for (const recipe of RECIPES) {
      const a = resolveRecipe(recipe, home);
      expect(resolveRecipe(recipe, home, {}, empty)).toEqual(a);
      expect(a.stale).toBeUndefined();
      if (!a.complete) continue;
      expect(a.picks.every((p) => p!.shop === undefined)).toBe(true);
      expect(fitRecipe(recipe, home, {}, { kcal: 600 })).toEqual(fitRecipe(recipe, home, {}, { kcal: 600 }, empty));
      const scaled = scaleServings(withSubstitutes(recipe, {}), 5);
      expect(recipeTotals(resolveRecipe(scaled, home))!.perServing).toEqual(recipeTotals(a)!.perServing);
    }
  });
});
