import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES, candidates, drainedSize, packSize, pickFor, recipeTotals, resolveRecipe, type IngredientSpec, type Recipe } from "../lib/mm/recipes";
import { addToList, itemCode, listAsText, listTotals, sanitizeShoppingList, setQty } from "../lib/mm/groceries";
import { decodeShopProducts, type ShopNutrition, type ShopProduct } from "../lib/mm/shopProducts";

const nut = (kcal: number, protein: number, carbs: number, fat: number, per: "g" | "ml" = "g", state = ""): ShopNutrition =>
  ({ kcal, protein, carbs, fat, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per, state }) as ShopNutrition;

const product = (id: string, name: string, price: number, unitPrice: number | null, unit: string, nutrition: ShopNutrition | null): ShopProduct =>
  ({ id, name, price, unitPrice, unit, member: null, category: "Food cupboard", photoId: "", gtin: "", nutrition });

const RICE_SPEC: IngredientSpec = { key: "rice", label: "Rice", amount: 150, unit: "g", match: { all: ["rice"], any: ["basmati"], none: ["microwave"], kcal: [320, 400] } };
const BEANS_SPEC: IngredientSpec = { key: "beans", label: "Beans", amount: 240, unit: "g", drained: true, match: { all: ["kidney", "beans"], kcal: [70, 140] } };

describe("pack sizes", () => {
  it("reads the weight or volume printed in the name", () => {
    expect(packSize("Rice 1kg", "g")).toBe(1000);
    expect(packSize("Sainsbury's 320g Chicken Breast Fillets", "g")).toBe(320);
    expect(packSize("Patak's 2 x 70g Korma Curry Paste Pots", "g")).toBe(140);
    expect(packSize("Semi Skimmed Milk 1.13L (2 pint)", "ml")).toBe(1130);
    expect(packSize("Semi Skimmed Milk 1 Pint", "ml")).toBe(568);
    expect(packSize("Medium Noodles Quick To Cook x2 300g", "g")).toBe(300);
    expect(packSize("Eggs, SO Organic x6", "g")).toBeNull();
    expect(packSize("Coconut Milk 400ml", "g")).toBeNull();
  });
  it("skips a bracketed drained weight for the pack size, and reads it for drained amounts", () => {
    expect(packSize("Red Kidney Beans in Water 400g (240g*)", "g")).toBe(400);
    expect(drainedSize({ name: "Red Kidney Beans in Water 400g (240g*)", price: 0.39, unitPrice: 1.62, unit: "per kg" })).toBe(240);
    expect(drainedSize({ name: "John West Tuna Chunks in Brine 4x125g (102g Drained)", price: 4.45, unitPrice: 10.91, unit: "per kg" })).toBe(408);
    expect(drainedSize({ name: "Princes 4x145g in Brine Tuna Chunks (4x102g Drained)", price: 4.25, unitPrice: 10.42, unit: "per kg" })).toBe(408);
    // no drained weight printed: the quantity the shop's own price per kg is for
    expect(drainedSize({ name: "Tuna Chunks in Brine 145g", price: 0.65, unitPrice: 6.37, unit: "per kg" })).toBe(102);
  });
});

describe("matching an ingredient", () => {
  const products = [
    product("a", "Basmati Rice 1kg", 1.79, 1.79, "per kg", nut(125, 2.8, 26.5, 0.7, "g", "cooked")), // label per 100 g cooked: never used for an uncooked amount
    product("b", "Basmati Rice 2kg", 3.5, 1.75, "per kg", nut(350, 7.4, 78, 0.6)),
    product("c", "Premium Basmati Rice 1kg", 2.2, 2.2, "per kg", nut(353, 9, 77, 1)),
    product("d", "Microwave Basmati Rice 250g", 1, 4, "per kg", nut(351, 7, 78, 1)),
    product("e", "Basmati Rice 500g", 1, 2, "per kg", nut(130, 3, 28, 0.5)), // a cooked figure under a plain heading: outside the range, left out
    product("f", "Wild Rice Selection 500g", 2, 4, "per kg", nut(350, 7, 78, 1)),
    product("g", "Arborio rice 1kg", 1.5, 1.5, "per kg", null), // nutrition not read
  ];
  it("keeps only labels for the food as sold, in range, with the right words", () => {
    expect(candidates(products, RICE_SPEC).map((c) => c.product.id)).toEqual(["c", "b"]);
  });
  it("matches whole words only", () => {
    const meat = [product("x", "Graham Crackers Basmati Rice 1kg", 2, 2, "per kg", nut(350, 7, 78, 1))];
    expect(candidates(meat, RICE_SPEC, true).length).toBe(1); // "ham" is not a word in "Graham"
    expect(candidates([product("y", "Basmati Rice with Ham 1kg", 2, 2, "per kg", nut(350, 7, 78, 1))], RICE_SPEC, true)).toEqual([]);
  });
  it("uses drained labels for a drained amount, and plain labels only for products sold drained", () => {
    const beans = [
      product("w", "Red Kidney Beans in Water 400g (240g*)", 0.39, 1.62, "per kg", nut(105, 8.1, 12.8, 0.6, "g", "drained")),
      product("v", "Red Kidney Beans 400g", 0.5, 1.25, "per kg", nut(80, 6, 10, 0.5)), // whole can, liquid included
      product("u", "Kidney Beans Drained & Ready 200g", 0.9, 4.5, "per kg", nut(110, 8, 13, 0.6)),
    ];
    expect(candidates(beans, BEANS_SPEC).map((c) => c.product.id)).toEqual(["w", "u"]);
    expect(candidates(beans, { ...BEANS_SPEC, drained: false }).map((c) => c.product.id)).toEqual(["v", "u"]);
  });
  it("works out packs to buy and the cost of the amount used", () => {
    const p = pickFor(RICE_SPEC, product("b", "Basmati Rice 2kg", 3.5, 1.75, "per kg", nut(350, 7.4, 78, 0.6)));
    expect(p.packs).toBe(1);
    expect(p.basketCost).toBe(3.5);
    expect(p.usedCost).toBeCloseTo(0.2625, 6);
    const two = pickFor({ ...BEANS_SPEC, amount: 300 }, product("w", "Red Kidney Beans in Water 400g (240g*)", 0.39, 1.62, "per kg", nut(105, 8.1, 12.8, 0.6, "g", "drained")));
    expect(two.packs).toBe(2);
    expect(two.basketCost).toBeCloseTo(0.78, 6);
    // no price per kg and no size in the name: cost of the amount used is unknown
    expect(pickFor(RICE_SPEC, product("z", "Basmati Rice", 2, null, "each", nut(350, 7, 78, 1))).usedCost).toBeNull();
  });
});

describe("a recipe", () => {
  const recipe: Recipe = {
    id: "t", name: "Test", blurb: "", servings: 2, minutes: 10, method: [], extras: [],
    ingredients: [RICE_SPEC, BEANS_SPEC],
  };
  const products = [
    product("b", "Basmati Rice 2kg", 3.5, 1.75, "per kg", nut(350, 7.4, 78, 0.6)),
    product("c", "Premium Basmati Rice 1kg", 2.2, 2.2, "per kg", nut(353, 9, 77, 1)),
    product("w", "Red Kidney Beans in Water 400g (240g*)", 0.39, 1.62, "per kg", nut(105, 8.1, 12.8, 0.6, "g", "drained")),
  ];
  it("totals the labels for the amounts used, per serving", () => {
    const r = resolveRecipe(recipe, products);
    expect(r.complete).toBe(true);
    expect(r.picks.map((p) => p?.product.id)).toEqual(["c", "w"]);
    const t = recipeTotals(r)!;
    // rice 150 g at 353/9/77/1 + beans 240 g at 105/8.1/12.8/0.6, halved
    expect(t.perServing).toEqual({ kcal: Math.round((353 * 1.5 + 105 * 2.4) / 2), protein: 16.5, carbs: 73.1, fat: 1.5 });
    expect(t.costPerServing).toBe(Math.round(((2.2 * 150) / 1000 + (1.62 * 240) / 1000) / 2 * 100) / 100);
    expect(t.basket).toBe(2.59);
  });
  it("uses a swapped product, and has no totals when an ingredient is missing", () => {
    expect(resolveRecipe(recipe, products, { rice: "b" }).picks[0]?.product.id).toBe("b");
    expect(resolveRecipe(recipe, products, { rice: "nope" }).picks[0]?.product.id).toBe("c");
    const missing = resolveRecipe(recipe, products.slice(0, 2));
    expect(missing.complete).toBe(false);
    expect(recipeTotals(missing)).toBeNull();
  });
});

describe("the recipes themselves", () => {
  it("have unique ids and keys, sensible amounts, and no health claims in their words", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      expect(new Set(r.ingredients.map((i) => i.key)).size).toBe(r.ingredients.length);
      expect(r.servings).toBeGreaterThan(0);
      expect(r.method.length).toBeGreaterThan(0);
      for (const i of r.ingredients) expect(i.amount).toBeGreaterThan(0);
      const words = `${r.name} ${r.blurb}`.toLowerCase();
      expect(words).not.toMatch(/\b(healthy|healthier|good for you|bad for you|lean|high in|packed with|low in|superfood|guilt)/);
    }
  });

  it("all resolve against Sainsbury's published list, with the expected kind of product", () => {
    const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
    for (const r of RECIPES) {
      const res = resolveRecipe(r, products);
      expect(res.complete, r.id).toBe(true);
      const t = recipeTotals(res)!;
      expect(t.perServing.kcal, r.id).toBeGreaterThan(150);
      expect(t.perServing.kcal, r.id).toBeLessThan(900);
      expect(t.costPerServing, r.id).not.toBeNull();
      res.picks.forEach((p, i) => {
        const spec = r.ingredients[i]!;
        const name = p!.product.name.toLowerCase();
        for (const w of spec.match.all) expect(name, `${r.id}/${spec.key}`).toContain(w);
      });
    }
  });
});

describe("shopping list items from a shop's own list", () => {
  it("are kept by the shop's product id, with the price noted when added", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    let list = addToList([], { gtin: "", shopId: "sainsburys-basmati-rice-1kg", retailer: "sainsburys", name: "Basmati Rice 1kg", brand: "", size: "", price: 1.79, checkedOn: "2026-10-08" }, now, 2);
    list = addToList(list, { gtin: "", shopId: "sainsburys-basmati-rice-1kg", retailer: "sainsburys", name: "Basmati Rice 1kg", brand: "", size: "", price: 1.79, checkedOn: "2026-10-08" }, now);
    list = addToList(list, { gtin: "5012345678900", retailer: "sainsburys", name: "Greek Yogurt", brand: "", size: "500 g" }, now);
    expect(list.map((i) => [itemCode(i), i.qty])).toEqual([["sainsburys-basmati-rice-1kg", 3], ["5012345678900", 1]]);
    expect(listTotals(list)).toEqual({ total: 5.37, priced: 1, count: 2, oldest: "2026-10-08" });
    expect(listAsText(list)).toBe("Sainsbury's\n- 3 x Basmati Rice 1kg\n- 1 x Greek Yogurt 500 g (5012345678900)");
    expect(setQty(list, "sainsburys-basmati-rice-1kg", "sainsburys", 0).length).toBe(1);
    const round = sanitizeShoppingList(JSON.parse(JSON.stringify(list)));
    expect(round).toEqual(list);
    expect(sanitizeShoppingList([{ gtin: "", retailer: "x", name: "No id" }, { gtin: "", shopId: "bad id!", retailer: "x", name: "Bad" }])).toEqual([]);
  });
});
