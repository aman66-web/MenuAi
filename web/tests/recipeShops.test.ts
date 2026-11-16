import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { communityNutrition, noZeros, otherShopOptions, recipeCoverage, withCommunityNumbers, type CommunityRecord } from "../lib/mm/recipeShops";
import { candidates, fitRecipe, recipeTotals, recipeView, resolveRecipe, type ForeignChoice, type IngredientPick, type Recipe } from "../lib/mm/recipes";
import { decodeShopProducts, type PricedProduct, type ShopNutrition, type ShopProduct } from "../lib/mm/shopProducts";

// Recipes from any supermarket (RECIPES_ANY_SHOP_ENABLED; docs/RECIPES_ANY_SUPERMARKET_REPORT.md): a recipe from ONE shop's products, appearing only when every ingredient
// resolves there to a product with usable numbers; a product swapped in from another supermarket counts with its own numbers, or (with none usable) stops the
// figures being shown; community numbers only by exact barcode and only when that switch is on. Nothing is ever estimated (CLAUDE.md rule 1).

const SHOPS = ["sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons", "waitrose", "iceland", "marks-and-spencer"] as const;
const listOf = (shop: string): ShopProduct[] => decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${shop}.json`, "utf8")));
const catalogueOf = (shop: string): Map<string, CommunityRecord> => {
  try {
    const f = JSON.parse(readFileSync(`public/groceries/${shop}.json`, "utf8")) as { products: Array<CommunityRecord & { gtin: string }> };
    return new Map(f.products.map((p) => [noZeros(p.gtin), p]));
  } catch {
    return new Map();
  }
};
const sainsburys = listOf("sainsburys");

const n = (kcal: number, protein: number, extra: Partial<ShopNutrition> = {}): ShopNutrition => ({ kcal, protein, carbs: 10, fat: 5, saturates: 1, sugars: 1, fibre: 1, salt: 0.1, kj: kcal * 4.184, per: "g", state: "", ...extra });
const product = (id: string, name: string, extra: Partial<ShopProduct> = {}): ShopProduct => ({ id, name, price: 2, unitPrice: 4, unit: "per kg", member: null, category: "Food", photoId: "", gtin: "", nutrition: null, ...extra });

/** The recipe as Sainsbury's resolves it, and the pick for its first protein ingredient (a meaty or beany one: the ingredient a swap changes most). */
function scene(): { recipe: Recipe; pick: IngredientPick; key: string } {
  for (const recipe of RECIPES) {
    const r = resolveRecipe(recipe, sainsburys);
    const i = recipe.ingredients.findIndex((s) => s.role === "protein");
    const pick = r.picks[i];
    if (r.complete && pick && pick.product.nutrition && !pick.spec.labelOptional) return { recipe, pick, key: recipe.ingredients[i]!.key };
  }
  throw new Error("no recipe with a protein ingredient");
}

describe("community numbers (only by exact barcode, never filled in)", () => {
  const rec: CommunityRecord = { per: "g", kcal: 120, protein: 22, carbs: 0, fat: 3 };
  it("a record needs its four main figures; a missing extra figure stays missing (null), never 0", () => {
    expect(communityNutrition({ ...rec, kcal: Number.NaN })).toBeNull();
    expect(communityNutrition({ ...rec, per: "kg" as never })).toBeNull();
    expect(communityNutrition(rec)).toEqual({ ...rec, saturates: null, sugars: null, fibre: null, salt: null, kj: null, state: "" });
  });
  it("adds numbers only to a product with no label of its own and a barcode in the catalogue (leading zeros ignored), marked as community", () => {
    const list = [product("a", "Chicken", { gtin: "05000000000001" }), product("b", "Own label", { gtin: "5000000000002", nutrition: n(100, 20) }), product("c", "No barcode"), product("d", "Unknown barcode", { gtin: "123" })];
    const cat = new Map([["5000000000001", rec], ["5000000000002", { ...rec, kcal: 999 }]]);
    const out = withCommunityNumbers(list, cat);
    expect(out[0]!.nutrition?.kcal).toBe(120);
    expect(out[0]!.nutritionFrom).toBe("community");
    expect(out[1]!.nutrition?.kcal).toBe(100); // its own label is kept
    expect(out[1]!.nutritionFrom).toBeUndefined();
    expect(out[2]).toBe(list[2]);
    expect(out[3]).toBe(list[3]);
    expect(withCommunityNumbers(list, new Map())).toBe(list); // switch off: the very same list
  });
});

describe("a product from another supermarket in a recipe", () => {
  const { recipe, pick, key } = scene();
  const sameNumbers: ForeignChoice = { shop: "tesco", product: { ...pick.product, id: "tesco-1", name: `${pick.product.name} (Tesco)` } as PricedProduct };
  const noNumbers: ForeignChoice = { shop: "tesco", product: { ...pick.product, id: "tesco-2", nutrition: null } as PricedProduct };

  it("stands for its ingredient as it is: its own price, its own numbers, and the pick says which shop", () => {
    const base = recipeTotals(resolveRecipe(recipe, sainsburys))!;
    const r = resolveRecipe(recipe, sainsburys, {}, { [key]: sameNumbers });
    const p = r.picks.find((x) => x?.spec.key === key)!;
    expect(p.shop).toBe("tesco");
    expect(p.product.id).toBe("tesco-1");
    const t = recipeTotals(r)!;
    expect(t.perServing).toEqual(base.perServing); // the same label gives the same figures
    expect(t.noNumbers).toEqual([]);
  });

  it("without usable numbers, the figures can't be worked out: named in noNumbers (never counted as 0, never left out quietly)", () => {
    const t = recipeTotals(resolveRecipe(recipe, sainsburys, {}, { [key]: noNumbers }))!;
    expect(t.noNumbers).toEqual([pick.spec.label]);
    expect(t.notCounted).not.toContain(pick.spec.label);
    for (const wrong of [{ per: "ml" as const }, { state: "cooked" }]) {
      const odd: ForeignChoice = { shop: "tesco", product: { ...pick.product, id: "tesco-3", nutrition: { ...pick.product.nutrition!, ...wrong } } as PricedProduct };
      expect(recipeTotals(resolveRecipe(recipe, sainsburys, {}, { [key]: odd }))!.noNumbers, JSON.stringify(wrong)).toEqual([pick.spec.label]);
    }
  });

  it("community numbers are counted and named as community data", () => {
    const comm: ForeignChoice = { shop: "tesco", product: { ...pick.product, id: "tesco-4", nutritionFrom: "community" } as PricedProduct };
    const t = recipeTotals(resolveRecipe(recipe, sainsburys, {}, { [key]: comm }))!;
    expect(t.community).toEqual([pick.spec.label]);
    expect(t.noNumbers).toEqual([]);
  });

  it("a serving's numbers and price stay the same for any number of people in a mixed recipe", () => {
    const at = (servings: number) => recipeView(recipe, sainsburys, { servings, foreign: { [key]: sameNumbers } }).totals!;
    const one = at(recipe.servings);
    for (const s of [1, 2, 3, 5, 8, 12]) {
      expect(at(s).perServing, `serves ${s}`).toEqual(one.perServing);
      expect(at(s).costPerServing, `serves ${s}`).toBe(one.costPerServing);
      const p = recipeView(recipe, sainsburys, { servings: s, foreign: { [key]: sameNumbers } }).resolved.picks.find((x) => x?.spec.key === key)!;
      expect(p.shop).toBe("tesco");
    }
  });

  it("fitting keeps the other shop's product; with no usable numbers nothing is fitted (the recipe is shown as written)", () => {
    const target = { kcal: 450, protein: 35 };
    const fitted = fitRecipe(recipe, sainsburys, {}, target, { [key]: sameNumbers })!;
    expect(fitted.resolved.picks.find((x) => x?.spec.key === key)!.product.id).toBe("tesco-1");
    const asWritten = fitRecipe(recipe, sainsburys, {}, target, { [key]: noNumbers })!;
    expect(asWritten.changed).toBe(false);
    expect(asWritten.recipe).toBe(recipe);
    expect(asWritten.totals.noNumbers).toEqual([pick.spec.label]);
  });

  it("with no product from another shop, everything is exactly as before", () => {
    expect(recipeView(recipe, sainsburys, { servings: 3, foreign: {} })).toEqual(recipeView(recipe, sainsburys, { servings: 3 }));
  });
});

describe("other supermarkets' products for one ingredient, most suitable first", () => {
  const { recipe, pick } = scene();
  const spec = pick.spec;
  const name = pick.product.name;
  it("own label first, then community numbers, then products named for it with no numbers; numbers that don't fit are never offered", () => {
    const lists = [
      { shop: "tesco", products: [product("t1", name), product("t2", name, { nutrition: pick.product.nutrition, nutritionFrom: "community" }), product("t3", name, { nutrition: { ...pick.product.nutrition!, state: "cooked" } })] },
      { shop: "asda", products: [product("a1", name, { nutrition: pick.product.nutrition }), product("a2", "Washing up liquid 500ml")] },
    ];
    const out = otherShopOptions(lists, spec);
    expect(out.map((o) => `${o.shop}:${o.pick.product.id}:${o.numbers}`)).toEqual(["asda:a1:label", "tesco:t2:community", "tesco:t1:null"]);
    for (const o of out) expect(o.pick.shop).toBe(o.shop);
  });
  it("among products with no numbers, the name closest to the ingredient comes first (fillets before sausages for 'Chicken breast fillets')", () => {
    const fillets = RECIPES.flatMap((r) => r.ingredients).find((x) => /chicken breast/i.test(x.label))!;
    const out = otherShopOptions([{ shop: "tesco", products: [product("s", "Brand Chicken Breast Sausages 400g", { price: 1 }), product("f", "Tesco British Chicken Breast Fillets 350g", { price: 3 })] }], fillets);
    expect(out.map((o) => o.pick.product.id)).toEqual(["f", "s"]);
  });
  it("a meat-free recipe is never offered a product named for meat", () => {
    const meatFree = RECIPES.find((r) => r.ingredients.every((s) => !/chicken|beef|pork|fish|tuna|salmon|bacon|ham|turkey|lamb|sausage|prawn|cod/.test(s.key)))!;
    const s = meatFree.ingredients[0]!;
    const out = otherShopOptions([{ shop: "tesco", products: [product("x", `Chicken ${s.match.all.join(" ")}`), product("y", s.match.all.join(" "))] }], s, true);
    expect(out.map((o) => o.pick.product.id)).not.toContain("x");
    void recipe;
  });
});

describe("community numbers never change what a shop's own labels already make", () => {
  it("a product with community numbers ranks after one with the shop's own label, even when it is cheaper; alone, it is used", () => {
    const { recipe, pick } = scene();
    const cheapCommunity = { ...pick.product, id: "comm", price: 0.5, unitPrice: 1, nutritionFrom: "community" as const } as ShopProduct;
    const at = (list: ShopProduct[]) => resolveRecipe(recipe, list).picks.find((x) => x?.spec.key === pick.spec.key)!.product;
    const withOwn = at([cheapCommunity, ...sainsburys]);
    expect(withOwn.id).not.toBe("comm"); // the shop's own labels win, however cheap the community one is
    expect(withOwn.nutritionFrom).toBeUndefined();
    const official = new Set(candidates(sainsburys, pick.spec).map((c) => c.product.id));
    expect(at([cheapCommunity, ...sainsburys.filter((p) => !official.has(p.id))]).id).toBe("comm");
  });
  it("with Sainsbury's own community records added, every one of the 117 recipes has the same figures and price as before", () => {
    const withComm = withCommunityNumbers(sainsburys, catalogueOf("sainsburys"));
    expect(withComm.some((p) => p.nutritionFrom === "community")).toBe(true);
    for (const r of RECIPES) {
      const a = recipeTotals(resolveRecipe(r, sainsburys))!;
      const b = recipeTotals(resolveRecipe(r, withComm))!;
      expect(b.perServing, r.id).toEqual(a.perServing);
      expect(b.costPerServing, r.id).toBe(a.costPerServing);
      expect(b.community, r.id).toEqual([]);
    }
  });
});

describe("coverage per shop (real lists, official labels only)", () => {
  it("every recipe is complete at Sainsbury's, the shop whose labels we've read", () => {
    const c = recipeCoverage(RECIPES, sainsburys);
    expect(c.complete).toBe(RECIPES.length);
    expect(c.missing).toEqual([]);
  });
  it("a shop whose labels we haven't read completes no recipe, and says what is missing", () => {
    const c = recipeCoverage(RECIPES, listOf("tesco"));
    expect(c.complete).toBe(0);
    expect(c.mostMissing.length).toBeGreaterThan(5);
    expect(c.mostMissing[0]!.recipes).toBeGreaterThanOrEqual(c.mostMissing[1]!.recipes);
  });
  // COVERAGE=1 COVERAGE_OUT=coverage.txt npx vitest run tests/recipeShops.test.ts writes the table in docs/RECIPES_ANY_SUPERMARKET_REPORT.md
  it.runIf(process.env.COVERAGE === "1")("prints coverage per shop: official labels, and with community numbers added", { timeout: 600_000 }, () => {
    const rows: string[] = [];
    for (const shop of SHOPS) {
      const list = listOf(shop);
      const official = recipeCoverage(RECIPES, list);
      const cat = catalogueOf(shop);
      const withComm = withCommunityNumbers(list, cat);
      const community = recipeCoverage(RECIPES, withComm);
      const added = withComm.filter((p) => p.nutritionFrom === "community").length;
      // recipes that would use at least one community-numbered product, and how many of the official ones would change their figures
      let usesCommunity = 0;
      let changedOfficial = 0;
      for (const r of RECIPES) {
        const res = resolveRecipe(r, withComm);
        if (!res.complete) continue;
        if (res.picks.some((p) => p?.product.nutritionFrom === "community")) usesCommunity++;
        const before = resolveRecipe(r, list);
        if (before.complete && JSON.stringify(recipeTotals(before)!.perServing) !== JSON.stringify(recipeTotals(res)!.perServing)) changedOfficial++;
      }
      rows.push(`${shop} | ${list.length} products | own labels ${list.filter((p) => p.nutrition).length} | community-numbered ${added} | complete official ${official.complete}/${official.total} | with community ${community.complete}/${community.total} | recipes using a community-numbered product ${usesCommunity} | official recipes whose figures would change ${changedOfficial} | most missing (community): ${community.mostMissing.slice(0, 8).map((m) => `${m.label} (${m.recipes})`).join(", ")}`);
    }
    const text = `COVERAGE\n${rows.join("\n")}\n`;
    if (process.env.COVERAGE_OUT) writeFileSync(process.env.COVERAGE_OUT, text);
    else console.log(text);
  });
});
