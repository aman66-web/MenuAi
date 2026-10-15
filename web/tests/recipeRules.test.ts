import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { candidates, fitRecipe, ing, isQuick, pickFor, pieceWeight, resolveRecipe, scaleServings, subSpec, type Recipe } from "../lib/mm/recipes";
import { decodeShopProducts, type PricedProduct, type ShopNutrition } from "../lib/mm/shopProducts";

// The rules that keep a recipe the same dish when the app changes its amounts (fitting it to someone's meal, or cooking for more or fewer
// people), and that make the product picked at the shop the one the method means (lib/mm/recipes.ts, lib/mm/pantry.ts).

const nut = (kcal: number, protein: number, carbs: number, fat: number, per: "g" | "ml" = "g", state = ""): ShopNutrition =>
  ({ kcal, protein, carbs, fat, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per, state }) as ShopNutrition;
const product = (id: string, name: string, price: number, unitPrice: number | null, unit: string, nutrition: ShopNutrition | null): PricedProduct =>
  ({ id, name, price, unitPrice, unit, member: null, category: "Food cupboard", photoId: "", gtin: "", nutrition });

const recipe = (ingredients: Recipe["ingredients"], servings = 2): Recipe => ({ id: "t", name: "Test", blurb: "", servings, minutes: 10, method: ["x"], ingredients });
const amountOf = (r: Recipe, key: string) => r.ingredients.find((i) => i.key === key)!.amount;

const SHOP = [
  product("oats", "Scottish Porridge Oats 1kg", 1.25, 1.25, "per kg", nut(362, 11, 60, 8)),
  product("milk", "Semi Skimmed Milk 1 Pint", 0.85, 1.5, "per litre", nut(50, 3.6, 4.8, 1.8, "ml")),
  product("yog", "Greek Style Fat Free Natural Yogurt 500g", 0.95, 1.9, "per kg", nut(51, 10, 4, 0.2)),
  product("eggs", "Free Range Medium Eggs 6 pack 360g", 1.8, 5, "per kg", nut(140, 12.5, 0.5, 9.5)),
  product("pot", "Peeled New Potatoes In Water 560g (360g*)", 1.1, 3.19, "per kg", nut(62, 1.6, 12, 0.2, "g", "drained")),
  product("rice", "Basmati Rice 1kg", 2, 2, "per kg", nut(350, 7, 78, 1)),
  product("chicken", "Chicken Breast Fillets 640g", 4.5, 7, "per kg", nut(110, 24, 0, 1.5)),
];

const sainsburys = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
const byId = (id: string) => RECIPES.find((r) => r.id === id)!;

describe("fitting keeps a dish's proportions", () => {
  it("moves an ingredient that follows another by the same factor (the milk follows the porridge oats)", () => {
    const porridge = recipe([ing("oats", 100), ing("milk", 400, { follows: "oats" }), ing("greek-yogurt", 100, { role: "protein" })]);
    const f = fitRecipe(porridge, SHOP, {}, { kcal: 650 })!;
    const oats = amountOf(f.recipe, "oats") / 100;
    expect(oats).toBeGreaterThan(1.2);
    expect(Math.abs(amountOf(f.recipe, "milk") / 400 - oats)).toBeLessThanOrEqual(0.03);
    // without it, the milk would stay as written while the oats doubled
    const loose = fitRecipe(recipe([ing("oats", 100), ing("milk", 400), ing("greek-yogurt", 100, { role: "protein" })]), SHOP, {}, { kcal: 650 })!;
    expect(amountOf(loose.recipe, "milk")).toBe(400);
    // the totals are the labels for the amounts shown, milk included
    const kcal = (362 * amountOf(f.recipe, "oats") + 50 * amountOf(f.recipe, "milk") + 51 * amountOf(f.recipe, "greek-yogurt")) / 100 / 2;
    expect(f.totals.perServing.kcal).toBe(Math.round(kcal));
  });

  it("keeps an ingredient inside its own limits, and one that follows it inside them too (an omelette in one pan)", () => {
    const omelette = recipe([ing("eggs", 360, { fit: [0.5, 1.5] }), ing("new-potatoes", 300, { follows: "eggs" })], 3);
    const big = fitRecipe(omelette, SHOP, {}, { kcal: 2000 })!;
    expect(amountOf(big.recipe, "eggs")).toBe(540); // 9 eggs, not 12
    expect(amountOf(big.recipe, "new-potatoes")).toBe(450);
    const small = fitRecipe(omelette, SHOP, {}, { kcal: 100 })!;
    expect(amountOf(small.recipe, "eggs")).toBe(180);
    expect(amountOf(small.recipe, "new-potatoes")).toBe(150);
  });

  it("leaves an ingredient held at [1, 1] as written (rice cooked in the method's own water), and a recipe with nothing else to move unchanged", () => {
    const onePot = recipe([ing("chicken", 300), ing("rice", 200, { fit: [1, 1] })]);
    for (const kcal of [300, 600, 1200]) expect(amountOf(fitRecipe(onePot, SHOP, {}, { kcal })!.recipe, "rice")).toBe(200);
    const riceOnly = fitRecipe(recipe([ing("rice", 200, { fit: [1, 1] })]), SHOP, {}, { kcal: 1200 })!;
    expect(riceOnly.changed).toBe(false);
  });

  it("moves tinned pulses at most one and a half times (the pantry's own limit), in every recipe in the book", () => {
    for (const r of RECIPES) {
      if (r.meal === "snack") continue; // snacks are shown as written
      const f = fitRecipe(r, sainsburys, {}, { kcal: 1000, protein: 75 });
      r.ingredients.forEach((spec, i) => {
        if (spec.pantry !== "chickpeas" && spec.pantry !== "kidney-beans") return;
        expect(f!.recipe.ingredients[i]!.amount, `${r.id}/${spec.key}`).toBeLessThanOrEqual(spec.amount * 1.5 + 2.5);
      });
    }
  }, 30_000);

  it("gives a substitute the place of the ingredient it stands in for: what it follows and its limits", () => {
    const milk = ing("milk", 400, { follows: "oats" });
    expect(subSpec(milk, { key: "oat-drink" })).toMatchObject({ key: "milk", pantry: "oat-drink", follows: "oats", amount: 400 });
    const potatoes = ing("new-potatoes", 300, { fit: [0.5, 1.5] });
    expect(subSpec(potatoes, { key: "pasta-shapes", factor: 0.5 })).toMatchObject({ key: "new-potatoes", fit: [0.5, 1.5], amount: 150 });
  });
});

describe("food bought and used as whole pieces", () => {
  it("reads one piece's weight from the pack's name", () => {
    expect(pieceWeight("Oxo Vegetable Stock Cubes x12 71g")).toBeCloseTo(5.9, 1);
    expect(pieceWeight("Oxo Stock Pots Garden Vegetables 4x20g")).toBe(20);
    expect(pieceWeight("Mission 6 x Original Tortilla Wraps 367g")).toBeCloseTo(61.2, 1);
    expect(pieceWeight("Sainsbury's 320g Wholewheat Tortilla Wraps")).toBeNull();
  });

  it("matches only wraps of about 60 g, whose count and weight the name gives (the book's amounts are one large wrap each)", () => {
    const wraps = [
      product("taco", "Sainsbury's 10 x Soft Taco Wraps 300g", 1.3, 4.33, "per kg", nut(314, 8, 52, 7)),
      product("regular", "Sainsbury's Wheat & Corn Tortilla Wraps x8 320g", 1.5, 4.69, "per kg", nut(314, 8, 52, 7)),
      product("nocount", "Sainsbury's 320g Wholewheat Tortilla Wraps", 1.45, 4.53, "per kg", nut(299, 9, 46, 7)),
      product("large", "Mission 6 x Original Tortilla Wraps 367g", 1.85, 0.31, "each", nut(313, 8, 52, 7)),
      product("protein", "Mission 6 x Protein Tortilla Wraps 367g", 1.85, 0.31, "each", nut(277, 15, 40, 7)),
    ];
    const spec = ing("wraps", 120);
    expect(spec.note).toBe("about 2 wraps");
    expect(candidates(wraps, spec).map((c) => c.product.id)).toEqual(["large", "protein"]); // the plain "Original" first at the same price
  });

  it("uses a 6 g stock cube, one per recipe, and never a pot (every method crumbles or dissolves the cube)", () => {
    for (const id of ["chicken-mushroom-pasta", "cottage-pie", "bean-tomato-soup", "moroccan-chickpea-stew"]) {
      const r = byId(id);
      const i = r.ingredients.findIndex((x) => x.pantry === "stock-cube");
      const pick = resolveRecipe(r, sainsburys).picks[i]!;
      expect(pick.product.name, id).toMatch(/stock cubes/i);
      expect(pick.product.name, id).not.toMatch(/\bpots?\b/i);
      expect(pick.spec.note, id).toBe("about 1 stock cube");
      expect(r.method.some((m) => /\bstock cube\b/.test(m)), id).toBe(true);
    }
  });

  it("uses two stock cubes in the soups made with 700 ml of water or more, and says so in the method", () => {
    for (const id of ["chicken-sweetcorn-soup", "minestrone-beans-pasta", "sweetcorn-potato-soup"]) {
      const r = byId(id);
      const i = r.ingredients.findIndex((x) => x.pantry === "stock-cube");
      expect(resolveRecipe(r, sainsburys).picks[i]!.spec.note, id).toBe("about 2 stock cubes");
      expect(r.method.some((m) => /\bstock cubes\b/.test(m)), id).toBe(true);
      expect(r.method.some((m) => /\bstock cube\b/.test(m)), id).toBe(false);
    }
  });

  it("never leaves fewer wraps than people when a recipe is fitted to a small meal", () => {
    for (const r of RECIPES) {
      if (r.meal === "snack") continue; // snacks are shown as written
      const i = r.ingredients.findIndex((x) => x.pantry === "wraps");
      if (i < 0) continue;
      const f = fitRecipe(r, sainsburys, {}, { kcal: 250 })!;
      expect(f.recipe.ingredients[i]!.amount, r.id).toBeGreaterThanOrEqual(r.servings * 60);
    }
  }, 30_000);

  it("counts wheat biscuits by the biscuit, priced at the shop's own price each, and a pack that doesn't print its count by price over price each", () => {
    const r = byId("wheat-biscuits-berries");
    const pick = resolveRecipe(r, sainsburys).picks[0]!;
    expect(pick.product.name).toMatch(/wheat biscuits/i);
    expect(pick.spec.note).toBe("about 2 biscuits");
    expect(pick.pieces).toBe(2);
    expect(pick.usedCost).toBeCloseTo(2 * pick.product.unitPrice!, 6);
    const twelve = product("w12", "Weetabix 12 Original Cereal Pack", 2, 0.17, "each", nut(354, 11, 68, 2));
    expect(pickFor(ing("wheat-biscuits", 38), twelve).packs).toBe(1); // 12 biscuits in it, not 1
  });

  it("puts a product named the way the kind prefers first at the same price (spaghetti for spaghetti)", () => {
    const pasta = [
      product("lin", "De Cecco Linguine Pasta 500g", 2, 4, "per kg", nut(351, 13, 70, 1.5)),
      product("spa", "De Cecco Spaghetti Pasta 500g", 2, 4, "per kg", nut(351, 13, 70, 1.5)),
    ];
    expect(candidates(pasta, ing("pasta-long", 320))[0]!.product.id).toBe("spa");
    // one recipe can prefer another word (linguine for a linguine recipe)
    expect(candidates(pasta, ing("pasta-long", 320, { prefer: ["linguine"] }))[0]!.product.id).toBe("lin");
  });
});

describe("the products picked at Sainsbury's are the ones the methods mean", () => {
  const RULES: Array<[string, RegExp]> = [
    ["cheddar", /\bslice/i], // every method grates it
    ["raisins", /cranberr|snack|panettone|pain aux|cake/i],
    ["sweet-chilli", /stir fry|garlic/i],
    ["rice", /\b\d+\s*x\s*\d|\bx\d/i], // portion bags can't be cooked loose or in one pot
    ["ham", /wafer/i], // it tears when rolled or spread
    ["stock-cube", /\bpots?\b/i],
    ["wheat-biscuits", /choco|crunch|bran/i],
  ];
  it("for every recipe in the book", () => {
    for (const r of RECIPES) {
      resolveRecipe(r, sainsburys).picks.forEach((p, i) => {
        const rule = RULES.find(([k]) => k === r.ingredients[i]!.pantry);
        if (rule) expect(p!.product.name, `${r.id}/${rule[0]}`).not.toMatch(rule[1]);
      });
    }
    const linguine = byId("bacon-tomato-linguine");
    const pasta = resolveRecipe(linguine, sainsburys).picks[linguine.ingredients.findIndex((x) => x.pantry === "pasta-long")]!;
    expect(pasta.product.name).toMatch(/linguine/i);
    const wrapsRecipe = byId("breakfast-burrito");
    const wrap = resolveRecipe(wrapsRecipe, sainsburys).picks[wrapsRecipe.ingredients.findIndex((x) => x.pantry === "wraps")]!;
    expect(pieceWeight(wrap.product.name)).toBeGreaterThanOrEqual(50);
  }, 30_000);
});

describe("cooking for more or fewer people", () => {
  it("keeps part of a cucumber or an onion a part, and eggs and stock cubes whole", () => {
    const one = scaleServings(byId("tuna-chickpea-dip"), 1); // 120 g of cucumber for 3
    const cucumber = one.ingredients.find((i) => i.pantry === "cucumber")!;
    expect(cucumber.amount).toBe(40);
    expect(cucumber.note).toBeUndefined();
    const salad = byId("chickpea-tomato-salad"); // half a red onion for 2
    const four = scaleServings(salad, 4).ingredients.find((i) => i.pantry === "red-onion")!;
    expect(four).toMatchObject({ amount: 150, note: "about 1 red onion" });
    const one2 = scaleServings(salad, 1).ingredients.find((i) => i.pantry === "red-onion")!;
    expect(one2.amount).toBe(40);
    expect(one2.note).toBeUndefined(); // a quarter of an onion: not "about half a red onion" any more, and not near a whole one
    const pie = scaleServings(byId("cottage-pie"), 2); // one stock cube for 4
    expect(pie.ingredients.find((i) => i.pantry === "stock-cube")).toMatchObject({ amount: 6, note: "about 1 stock cube" });
    const eggs = scaleServings(byId("smoked-salmon-eggs"), 3).ingredients.find((i) => i.pantry === "eggs")!;
    expect(eggs).toMatchObject({ amount: 360, note: "about 6 eggs" });
  });
});

describe("quick recipes", () => {
  it("are ready in 20 minutes or less and aren't left overnight, to chill or to freeze first", () => {
    expect(isQuick({ minutes: 15, method: ["Mix everything together."] })).toBe(true);
    expect(isQuick({ minutes: 5, method: ["Mix the oats and milk.", "Cover and chill overnight."] })).toBe(false);
    expect(isQuick({ minutes: 15, method: ["Roll into balls.", "Chill for 30 minutes."] })).toBe(false);
    expect(isQuick({ minutes: 15, method: ["Spread on a tray.", "Freeze for at least 3 hours."] })).toBe(false);
    for (const id of ["overnight-oats", "bircher-muesli", "peanut-butter-oat-bites", "frozen-yogurt-berry-bark"]) expect(isQuick(byId(id)), id).toBe(false);
    expect(isQuick(byId("greek-yogurt-granola"))).toBe(true);
  });
});
