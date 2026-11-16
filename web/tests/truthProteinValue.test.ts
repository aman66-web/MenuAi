import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeShopProducts, isShopFile, type ShopProduct } from "../lib/mm/shopProducts";
import { cheapestProtein, comparePair, costOf100gProtein, CURATED_PAIRS, isProteinFood, proteinValue } from "../lib/mm/truth/proteinValue";

const prod = (over: Partial<ShopProduct> & { protein?: number; kcal?: number; per?: "g" | "ml"; state?: string }): ShopProduct => ({
  id: over.id ?? "x",
  name: over.name ?? "X",
  price: over.price === undefined ? 2 : over.price,
  unitPrice: over.unitPrice === undefined ? 10 : over.unitPrice,
  unit: over.unit ?? "per kg",
  member: null,
  category: "Meat & fish",
  photoId: "",
  gtin: "",
  nutrition: over.nutrition === undefined ? { kcal: over.kcal ?? 150, protein: over.protein ?? 25, carbs: 0, fat: 5, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per: over.per ?? "g", state: over.state ?? "" } : over.nutrition,
});

describe("proteinValue: pence for 10 g of protein", () => {
  it("is the price per kg in pence over the protein per 100 g", () => {
    // £6.15 a kg = 615p; 30.6 g protein per 100 g -> 20.1p for 10 g
    expect(proteinValue(prod({ unitPrice: 6.15, protein: 30.6 }))?.pence10g).toBe(20.1);
    // £10 a kg, 15 g per 100 g -> 66.7p
    expect(proteinValue(prod({ unitPrice: 10, protein: 15 }))?.pence10g).toBe(66.7);
  });
  it("works per litre with a label per 100 ml, and never across kg and ml", () => {
    expect(proteinValue(prod({ unit: "per litre", per: "ml", unitPrice: 0.7, protein: 3.6 }))?.pence10g).toBe(19.4);
    expect(proteinValue(prod({ unit: "per litre", per: "g" }))).toBeNull();
    expect(proteinValue(prod({ unit: "per kg", per: "ml" }))).toBeNull();
    expect(proteinValue(prod({ unit: "each" }))).toBeNull();
  });
  it("leaves out whatever it can't work out from published figures", () => {
    expect(proteinValue(prod({ nutrition: null }))).toBeNull();
    expect(proteinValue(prod({ price: null }))).toBeNull();
    expect(proteinValue(prod({ unitPrice: null }))).toBeNull();
    expect(proteinValue(prod({ unitPrice: 0 }))).toBeNull();
    expect(proteinValue(prod({ protein: 0 }))).toBeNull();
    expect(proteinValue(prod({ protein: 140 }))).toBeNull();
    expect(proteinValue(prod({ state: "cooked" }))).toBeNull(); // a label for the cooked food is never used for the food as sold
  });
  it("a protein food has enough protein and enough of its energy from it", () => {
    const v = (protein: number, kcal: number) => proteinValue(prod({ protein, kcal }))!;
    expect(isProteinFood(v(30, 140))).toBe(true);
    expect(isProteinFood(v(15, 340))).toBe(false); // flour
    expect(isProteinFood(v(11, 487))).toBe(false); // instant noodles
    expect(isProteinFood(v(8, 70))).toBe(false); // under 12 g per 100 g
  });
  it("cheapestProtein sorts cheapest first, drops non-protein foods, and breaks ties by name", () => {
    const list = [
      prod({ id: "a", name: "B chicken", unitPrice: 6, protein: 30, kcal: 140 }),
      prod({ id: "b", name: "A chicken", unitPrice: 6, protein: 30, kcal: 140 }),
      prod({ id: "c", name: "Flour", unitPrice: 1, protein: 15, kcal: 340 }),
      prod({ id: "d", name: "Dear bar", unitPrice: 30, protein: 14, kcal: 200 }),
    ];
    expect(cheapestProtein(list).map((r) => r.product.id)).toEqual(["b", "a", "d"]);
    expect(cheapestProtein(list, 1)).toHaveLength(1);
  });
  it("a pair's saving is on every 100 g of protein, in pounds", () => {
    const cheap = proteinValue(prod({ unitPrice: 2.2, protein: 10 }))!; // 22p / 10 g -> £2.20 for 100 g
    const dear = proteinValue(prod({ unitPrice: 4.3, protein: 10 }))!; // 43p / 10 g -> £4.30
    expect(costOf100gProtein(cheap)).toBe(2.2);
    const r = comparePair(dear, cheap);
    expect(r.cheaper).toBe(cheap);
    expect(r.saving).toBe(2.1);
    expect(comparePair(cheap, cheap).saving).toBe(0);
  });
});

const file = JSON.parse(readFileSync(fileURLToPath(new URL("../public/groceries/all/sainsburys.json", import.meta.url)), "utf8"));
const products = decodeShopProducts(file);

describe("proteinValue: Sainsbury's full list", () => {
  it("is a valid shop file with thousands of read labels", () => {
    expect(isShopFile(file)).toBe(true);
    expect(products.filter((p) => p.nutrition).length).toBeGreaterThan(5000);
  });
  it("the leaderboard is sorted, every row is a protein food as sold, and no row is flour, noodles or bread", () => {
    const top = cheapestProtein(products, 60);
    expect(top.length).toBe(60);
    for (let i = 1; i < top.length; i++) expect(top[i].pence10g).toBeGreaterThanOrEqual(top[i - 1].pence10g);
    for (const r of top) {
      expect(isProteinFood(r)).toBe(true);
      expect(r.product.nutrition?.state).toBe("");
      expect(Number.isFinite(r.pence10g)).toBe(true);
    }
    expect(top.some((r) => /(wholemeal|strong|plain|bread|self[- ]raising) flour|noodles/i.test(r.product.name))).toBe(false); // gram (chickpea) flour is 22 g protein per 100 g and does belong
  });
  it("every curated pair resolves to products with a worked-out value, and the 'branded' side costs more per 10 g of protein", () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const pair of CURATED_PAIRS) {
      const a = byId.get(pair.branded);
      const b = byId.get(pair.everyday);
      expect(a, `${pair.id}: ${pair.branded}`).toBeDefined();
      expect(b, `${pair.id}: ${pair.everyday}`).toBeDefined();
      const va = proteinValue(a!);
      const vb = proteinValue(b!);
      expect(va, `${pair.id} value of branded`).not.toBeNull();
      expect(vb, `${pair.id} value of everyday`).not.toBeNull();
      expect(comparePair(va!, vb!).saving, pair.id).toBeGreaterThan(0.5);
      expect(va!.pence10g, pair.id).toBeGreaterThan(vb!.pence10g);
    }
  });
});
