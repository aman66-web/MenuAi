import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCAL_SHOP_PRODUCTS } from "../lib/mm/localRange";
import { RECIPES } from "../lib/mm/recipeBook";
import { candidates, fitRecipe, isMeatFree, recipeView, resolveRecipe, type IngredientSpec, type Recipe } from "../lib/mm/recipes";
import { decodeShopProducts, productKey, recipeShopSet, tagShopProducts, type PricedProduct, type ShopManifest, type ShopNutrition, type ShopProduct } from "../lib/mm/shopProducts";

// Founder 2026-11-17: a recipe's ingredients can come from several of the person's shops ("add more stores that they want to source ingredients from, or ...
// remove Sainsbury's. And if they did this, then the ingredients for the recipe would change"). The shop ticked first is used first; another shop fills in only
// an ingredient the first doesn't sell with a usable label; two shops' product ids never mix; and with one shop nothing changes.

const nut = (kcal: number, protein: number, carbs: number, fat: number, full = false): ShopNutrition =>
  ({ kcal, protein, carbs, fat, saturates: full ? 0.2 : null, sugars: full ? 0.1 : null, fibre: full ? 1 : null, salt: full ? 0 : null, kj: null, per: "g", state: "" }) as ShopNutrition;
const product = (id: string, name: string, price: number, unitPrice: number | null, nutrition: ShopNutrition | null): PricedProduct =>
  ({ id, name, price, unitPrice, unit: unitPrice === null ? "each" : "per kg", member: null, category: "Food cupboard", photoId: "", gtin: "", nutrition });

const RICE: IngredientSpec = { key: "rice", label: "Rice", amount: 150, unit: "g", match: { all: ["rice"], any: ["basmati"], kcal: [320, 400] } };
const BEANS: IngredientSpec = { key: "beans", label: "Beans", amount: 240, unit: "g", drained: true, match: { all: ["kidney", "beans"], kcal: [70, 140] } };
const recipe: Recipe = { id: "t", name: "Test", blurb: "", servings: 2, minutes: 10, method: [], ingredients: [RICE, BEANS] };
const drainedBeans = (id: string, price: number) => ({ ...product(id, "Red Kidney Beans in Water 400g (240g*)", price, price * 4.15, { ...nut(105, 8.1, 12.8, 0.6), state: "drained" }) });

const manifest = (ready: string[], other: string[] = []): ShopManifest => ({
  v: 1,
  retailers: [...ready.map((id) => ({ id, name: id, file: `${id}.json`, count: 10, checkedOn: "2026-10-08", sha256: "", nutrition: 5 })), ...other.map((id) => ({ id, name: id, file: `${id}.json`, count: 10, checkedOn: "2026-10-08", sha256: "" }))],
});

describe("which shops a recipe uses", () => {
  const m = manifest(["sainsburys", "tesco"], ["asda"]);
  it("is the person's shops whose labels we've read, in the order they ticked them", () => {
    expect(recipeShopSet(m, null, ["asda", "tesco", "sainsburys"])).toEqual(["tesco", "sainsburys"]);
    expect(recipeShopSet(m, null, ["sainsburys"])).toEqual(["sainsburys"]);
  });
  it("puts a shop the link asks for first, when its labels are read", () => {
    expect(recipeShopSet(m, "sainsburys", ["tesco", "sainsburys"])).toEqual(["sainsburys", "tesco"]);
    expect(recipeShopSet(m, "asda", ["tesco"])).toEqual(["tesco"]);
  });
  it("falls back to the first ready shop when none of theirs is ready, and is empty with no ready shop", () => {
    expect(recipeShopSet(m, null, ["asda"])).toEqual(["sainsburys"]);
    expect(recipeShopSet(m, null, undefined)).toEqual(["sainsburys"]);
    expect(recipeShopSet(null, null, ["sainsburys"])).toEqual([]);
    expect(recipeShopSet(manifest([], ["asda"]), null, ["asda"])).toEqual([]);
  });
});

describe("several shops' products together", () => {
  const a = [product("x", "Basmati Rice 1kg", 2.2, 2.2, nut(353, 9, 77, 1)), drainedBeans("w", 0.39)];
  const b = [product("x", "Basmati Rice 2kg", 1.5, 0.75, nut(350, 7.4, 78, 0.6)), product("y", "Value Basmati Rice 1kg", 0.9, 0.9, nut(350, 7, 78, 1))];

  it("are copies tagged with their shop and its place, and the shops' own lists are left as they were", () => {
    const merged = tagShopProducts([{ shop: "a", products: a }, { shop: "b", products: b }]);
    expect(merged.map((p) => [p.shop, p.shopRank, p.id])).toEqual([["a", 0, "x"], ["a", 0, "w"], ["b", 1, "x"], ["b", 1, "y"]]);
    expect(merged.map(productKey)).toEqual(["a:x", "a:w", "b:x", "b:y"]);
    expect(a[0]).not.toHaveProperty("shop");
    expect(b[0]).not.toHaveProperty("shopRank");
    expect(productKey(a[0]!)).toBe("x"); // a product from one shop's own list keeps its own id as its key
  });

  it("use the first shop's product when both sell it, even when the other shop's is cheaper", () => {
    const merged = tagShopProducts([{ shop: "a", products: a }, { shop: "b", products: b }]);
    const r = resolveRecipe(recipe, merged);
    expect(r.complete).toBe(true);
    expect(r.picks.map((p) => p && productKey(p.product))).toEqual(["a:x", "a:w"]);
    // the other shop's products are still offered for a swap, after the first shop's
    expect(candidates(merged, RICE).map((c) => productKey(c.product))).toEqual(["a:x", "b:y", "b:x"]);
  });

  it("take an ingredient from the next shop only when the first doesn't sell it with a usable label", () => {
    const noBeans = [a[0]!];
    const beansAtB = [...b, drainedBeans("w", 0.45)];
    const r = resolveRecipe(recipe, tagShopProducts([{ shop: "a", products: noBeans }, { shop: "b", products: beansAtB }]));
    expect(r.complete).toBe(true);
    expect(r.picks.map((p) => p && productKey(p.product))).toEqual(["a:x", "b:w"]);
    // a product the first shop sells without a price per kg or a size in its name has no cost for the amount used: the next shop's usable one comes first
    const unsized = [product("u", "Basmati Rice", 2, null, nut(353, 9, 77, 1)), a[1]!];
    const r2 = resolveRecipe(recipe, tagShopProducts([{ shop: "a", products: unsized }, { shop: "b", products: b }]));
    expect(productKey(r2.picks[0]!.product)).toBe("b:y");
    // and with no shop selling it, the recipe isn't complete
    expect(resolveRecipe(recipe, tagShopProducts([{ shop: "a", products: noBeans }, { shop: "b", products: b }])).complete).toBe(false);
  });

  it("never mix two shops' products that share an id: a swap names its shop", () => {
    const merged = tagShopProducts([{ shop: "a", products: a }, { shop: "b", products: b }]);
    expect(productKey(resolveRecipe(recipe, merged, { rice: "b:x" }).picks[0]!.product)).toBe("b:x");
    expect(productKey(resolveRecipe(recipe, merged, { rice: "a:x" }).picks[0]!.product)).toBe("a:x");
    expect(resolveRecipe(recipe, merged, { rice: "b:x" }).picks[0]!.product.name).toBe("Basmati Rice 2kg");
    // fitting moves the rice and keeps the swapped product of the right shop (it pins products by their key)
    const fitted: Recipe = { ...recipe, ingredients: [{ ...RICE, role: "carb" }, BEANS] };
    const f = fitRecipe(fitted, merged, { rice: "b:x" }, { kcal: 700, protein: 25 })!;
    expect(f.changed).toBe(true);
    expect(productKey(f.resolved.picks[0]!.product)).toBe("b:x");
    expect(f.resolved.picks[0]!.product.shop).toBe("b");
  });

  it("order a shop's own products exactly as they would be on their own (the 50p band is per shop)", () => {
    // on its own, the shop's full label beats a few pence on a label with gaps; a much cheaper product at the second shop must not change that
    const own = [product("full", "Basmati Rice 1kg", 2, 2, nut(353, 9, 77, 1, true)), product("gaps", "Basmati Rice 1kg Bag", 1.9, 1.9, nut(350, 8, 78, 1))];
    const cheapElsewhere = [product("cheap", "Basmati Rice 1kg", 0.5, 0.5, nut(350, 8, 78, 1))];
    const alone = candidates(own, RICE).map((c) => c.product.id);
    expect(alone).toEqual(["full", "gaps"]);
    const merged = tagShopProducts([{ shop: "a", products: own }, { shop: "b", products: cheapElsewhere }]);
    expect(candidates(merged, RICE).map((c) => productKey(c.product))).toEqual(["a:full", "a:gaps", "b:cheap"]);
  });

  it("count a product as a small-shop one only when it's Sainsbury's (the small-shop list names Sainsbury's products)", () => {
    const localId = [...LOCAL_SHOP_PRODUCTS][0]!;
    // at another shop, an id that happens to be on the list gets no head start: the cheaper basket comes first
    const tesco = [product(localId, "Basmati Rice 1kg", 3, 3, nut(353, 9, 77, 1)), product("t2", "Basmati Rice 1kg Value", 2, 2, nut(353, 9, 77, 1))];
    expect(candidates(tagShopProducts([{ shop: "tesco", products: tesco }]), RICE).map((c) => c.product.id)).toEqual(["t2", localId]);
    expect(candidates(tagShopProducts([{ shop: "sainsburys", products: tesco }]), RICE).map((c) => c.product.id)).toEqual([localId, "t2"]);
  });
});

describe("one shop alone, against Sainsbury's published list", () => {
  const raw = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
  const tagged = tagShopProducts([{ shop: "sainsburys", products: raw }]);
  // the same view, with the tags taken off (the only difference a tagged list can make)
  const plain = (v: unknown) => JSON.stringify(v, (k, val: unknown) => (k === "shop" || k === "shopRank" ? undefined : val));

  it("gives exactly the same recipe page as before for every recipe, as written, fitted and for more people", () => {
    for (const r of RECIPES) {
      for (const opts of [{ servings: r.servings }, { servings: 1, target: { kcal: 600, protein: 45 } }, { servings: 3, target: { kcal: 450 } }]) {
        const before = recipeView(r, raw, opts);
        const after = recipeView(r, tagged, opts);
        expect(plain(after), `${r.id} ${JSON.stringify(opts)}`).toBe(plain(before));
      }
    }
  });

  it("keeps a swap: the same product chosen by its own id before and by its shop-qualified key now", () => {
    const r = RECIPES[0]!;
    const i = r.ingredients.findIndex((spec) => candidates(raw, spec, isMeatFree(r)).length > 1);
    const spec = r.ingredients[i]!;
    const second = candidates(raw, spec, isMeatFree(r))[1]!.product;
    const before = recipeView(r, raw, { servings: r.servings, chosen: { [spec.key]: second.id } });
    const after = recipeView(r, tagged, { servings: r.servings, chosen: { [spec.key]: productKey({ ...second, shop: "sainsburys" }) } });
    expect(after.resolved.picks[i]!.product.id).toBe(second.id);
    expect(plain(after)).toBe(plain(before));
  });

  it("with a second shop after it, Sainsbury's products are used wherever Sainsbury's sells them, and the second fills an ingredient Sainsbury's lacks", () => {
    const r = RECIPES.find((x) => x.ingredients.length >= 4)!;
    const base = resolveRecipe(r, raw);
    // an ingredient Sainsbury's sells as written (not through a substitute)
    const i = base.picks.findIndex((p) => !!p && !p.spec.subFor && !!p.product.nutrition);
    const spec = r.ingredients[i]!;
    const pick = base.picks[i]!.product;
    // a second shop selling the very same product for less: never used while Sainsbury's sells it
    const cheaper: ShopProduct = { ...pick, id: "other-shop-1", price: Math.max(0.01, (pick.price ?? 1) / 2), unitPrice: pick.unitPrice === null ? null : pick.unitPrice / 2 };
    const both = resolveRecipe(r, tagShopProducts([{ shop: "sainsburys", products: raw }, { shop: "tesco", products: [cheaper] }]));
    expect(both.picks.map((p) => p && p.product.id)).toEqual(base.picks.map((p) => p && p.product.id));
    expect(both.picks.every((p) => p?.product.shop === "sainsburys")).toBe(true);
    // without any product for that ingredient at Sainsbury's, the second shop's is used for it
    const lacking = raw.filter((p) => !candidates(raw, spec, false).some((c) => c.product === p));
    const filled = resolveRecipe(r, tagShopProducts([{ shop: "sainsburys", products: lacking }, { shop: "tesco", products: [cheaper] }]));
    expect(filled.picks[i]!.product.shop).toBe("tesco");
    expect(filled.picks[i]!.product.id).toBe("other-shop-1");
    expect(filled.picks.every((p, j) => j === i || !p || p.product.shop === "sainsburys")).toBe(true);
  });
});
