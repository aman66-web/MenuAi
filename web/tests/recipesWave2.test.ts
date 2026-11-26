import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCAL_PROTEIN_PRODUCTS, SMALL_SHOP_PROTEIN_KINDS } from "../lib/mm/localRangeProtein";
import { LOCAL_SHOP_PRODUCTS } from "../lib/mm/localRange";
import { EVERYDAY_KINDS, PANTRY, PROTEIN_KINDS } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { WAVE2 } from "../lib/mm/recipeBook/wave2";
import { ing, recipeTotals, resolveRecipe, type Recipe } from "../lib/mm/recipes";
import { decodeShopProducts, type ShopManifest, type ShopProduct } from "../lib/mm/shopProducts";

// The second wave of recipes (lib/mm/recipeBook/wave2.ts, founder 2026-11-26: "it needs to suit literally everyone"), on top of the rules every recipe follows
// (tests/recipeBook.test.ts): only everyday kinds and the protein kinds a Sainsbury's Local stocks (founder 2026-11-26: "If it's something that would only be
// available at a massive Sainsbury's and not Sainsbury's local, you'll have to leave it out"); made, with a price, at Sainsbury's and most of the other big
// shops, so Meal plan can use them where people shop; and no near-copy of a recipe already in the book.

const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
const list = (id: string): ShopProduct[] => decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${manifest.retailers.find((r) => r.id === id)!.file}`, "utf8")));
const sainsburys = list("sainsburys");
const OTHERS = ["morrisons", "waitrose", "iceland", "asda"] as const;
const others = new Map(OTHERS.map((id) => [id, list(id)]));

/** The kinds that make a dish what it is (not its seasonings, oils or a squeeze of lemon). */
const mainKinds = (r: Recipe): Set<string> => new Set(r.ingredients.map((i) => i.pantry ?? i.key).filter((k) => !PANTRY.get(k)?.cupboard));
const overlap = (a: Set<string>, b: Set<string>): number => [...a].filter((k) => b.has(k)).length / new Set([...a, ...b]).size;

describe("the second wave of recipes", () => {
  it("has the protein products a small shop stocks, each on the shop's list and in the small-shop range", () => {
    const ids = new Set(sainsburys.map((p) => p.id));
    for (const id of LOCAL_PROTEIN_PRODUCTS) {
      expect(ids.has(id), `${id} is on Sainsbury's list`).toBe(true);
      expect(LOCAL_SHOP_PRODUCTS.has(id), `${id} is in the small-shop range`).toBe(true);
    }
    for (const k of SMALL_SHOP_PROTEIN_KINDS) {
      expect(PROTEIN_KINDS.has(k), `${k} is a protein kind`).toBe(true);
      const kind = PANTRY.get(k)!;
      const probe = resolveRecipe({ id: `probe-${k}`, name: k, blurb: "", servings: 1, minutes: 5, ingredients: [ing(k, kind.unit === "ml" ? 200 : 100)], method: [] }, sainsburys);
      expect(LOCAL_PROTEIN_PRODUCTS, `${k} is bought as a small-shop product at Sainsbury's`).toContain(probe.picks[0]?.product.id);
    }
  });

  it("uses only everyday kinds and the protein kinds a small shop stocks", () => {
    const other = WAVE2.flatMap((r) => r.ingredients.filter((i) => !EVERYDAY_KINDS.has(i.pantry ?? "") && !SMALL_SHOP_PROTEIN_KINDS.has(i.pantry ?? "")).map((i) => `${r.id}: ${i.pantry ?? i.key}`));
    expect(other).toEqual([]);
  });

  it("is made, with a price a serving, at Sainsbury's and at least two of Morrisons, Waitrose, Iceland and Asda", () => {
    const short: string[] = [];
    for (const r of WAVE2) {
      const at = OTHERS.filter((id) => { const x = resolveRecipe(r, others.get(id)!); return x.complete && recipeTotals(x)?.costPerServing != null; });
      if (at.length < 2) short.push(`${r.id}: ${at.join(", ") || "none"}`);
    }
    expect(short).toEqual([]);
  });

  it("copies no recipe already in the book (the same meal and nearly the same main foods)", () => {
    const wave = new Set(WAVE2.map((r) => r.id));
    const near: string[] = [];
    for (const r of WAVE2) {
      const mine = mainKinds(r);
      for (const o of RECIPES) {
        if (o.id === r.id || o.meal !== r.meal || (wave.has(o.id) && o.id < r.id)) continue;
        if (overlap(mine, mainKinds(o)) >= 0.85) near.push(`${r.id} ~ ${o.id}`);
      }
    }
    expect(near).toEqual([]);
  });
});
