import { describe, expect, it } from "vitest";
import { cheapestRetailer, familyKey, forRetailer, mergeProducts, priceRating, searchProducts, sizeAmount, sizeVariants, unitPrice, type GroceryFile, type GroceryPrice, type GroceryProduct } from "../lib/mm/groceries";

const pr = (amount: number, perUnit?: { amount: number; unit: string }): GroceryPrice => ({ amount, url: "https://shop.example/p", checkedOn: "2026-10-07", ...(perUnit ? { perUnit } : {}) });
const p = (over: Partial<GroceryProduct> & Pick<GroceryProduct, "gtin" | "name">): GroceryProduct => ({ brand: "", size: "", per: "ml", kcal: 50, protein: 3.4, carbs: 4.8, fat: 1.7, allergens: null, category: "dairy-eggs", type: "semi-skimmed-milks", ...over });
const file = (retailer: string, products: GroceryProduct[]): GroceryFile => ({ v: 1, retailer, name: retailer, generatedOn: "2026-10-07", source: "t", products });

describe("sizes", () => {
  it("reads weights and volumes, including multipacks", () => {
    expect(sizeAmount("400g")).toEqual({ amount: 400, unit: "g" });
    expect(sizeAmount("1.5 kg")).toEqual({ amount: 1500, unit: "g" });
    expect(sizeAmount("2 L")).toEqual({ amount: 2000, unit: "ml" });
    expect(sizeAmount("75cl")).toEqual({ amount: 750, unit: "ml" });
    expect(sizeAmount("4 x 125g")).toEqual({ amount: 500, unit: "g" });
    expect(sizeAmount("6 x 330ml")).toEqual({ amount: 1980, unit: "ml" });
    expect(sizeAmount("1,000 g")).toEqual({ amount: 1000, unit: "g" });
    expect(sizeAmount("6 pack")).toBeNull();
    expect(sizeAmount("")).toBeNull();
  });
  it("gives the same family key to the same product in different sizes", () => {
    const a = familyKey({ brand: "Tesco", name: "Semi Skimmed Milk 2L" });
    expect(familyKey({ brand: "Tesco", name: "Semi Skimmed Milk 1L" })).toBe(a);
    expect(familyKey({ brand: "Tesco", name: "Semi Skimmed Milk" })).toBe(a);
    expect(familyKey({ brand: "Tesco", name: "Skimmed Milk 2L" })).not.toBe(a);
    expect(familyKey({ brand: "Tesco", name: "6 Crumpets" })).toBe(familyKey({ brand: "Tesco", name: "12 Crumpets" }));
    expect(familyKey({ brand: "Heinz", name: "Baked Beans 415g" })).not.toBe(familyKey({ brand: "Branston", name: "Baked Beans 410g" }));
  });
  it("lists the other sizes of a product, smallest first, and nothing for a single size", () => {
    const all = mergeProducts([
      file("tesco", [
        p({ gtin: "5000000000001", name: "Semi Skimmed Milk", brand: "Tesco", size: "2L" }),
        p({ gtin: "5000000000002", name: "Semi Skimmed Milk", brand: "Tesco", size: "500ml" }),
        p({ gtin: "5000000000003", name: "Semi Skimmed Milk", brand: "Tesco", size: "1L" }),
        p({ gtin: "5000000000004", name: "Oat Drink", brand: "Tesco", size: "1L" }),
      ]),
    ]);
    const milk = all.find((x) => x.gtin === "5000000000001")!;
    expect(sizeVariants(all, milk).map((x) => x.size)).toEqual(["500ml", "1L", "2L"]);
    expect(sizeVariants(all, all.find((x) => x.gtin === "5000000000004")!)).toEqual([]);
  });
});

describe("unit prices", () => {
  it("uses the shop's own unit price when it gives one", () => {
    expect(unitPrice(pr(1.1, { amount: 2.62, unit: "per kg" }), { size: "420g", per: "g" })).toEqual({ amount: 2.62, unit: "kg" });
    expect(unitPrice(pr(0.86, { amount: 1.91, unit: "per litre" }), { size: "450ml", per: "ml" })).toEqual({ amount: 1.91, unit: "l" });
    expect(unitPrice(pr(1.2, { amount: 0.6, unit: "per 100g" }), { size: "200g", per: "g" })).toEqual({ amount: 6, unit: "kg" });
    expect(unitPrice(pr(1.2, { amount: 0.3, unit: "per 100ml" }), { size: "400ml", per: "ml" })).toEqual({ amount: 3, unit: "l" });
  });
  it("works it out from the pack size otherwise, and refuses drained-weight and unreadable ones", () => {
    expect(unitPrice(pr(1.5), { size: "2L", per: "ml" })).toEqual({ amount: 0.75, unit: "l" });
    expect(unitPrice(pr(2), { size: "500g", per: "g" })).toEqual({ amount: 4, unit: "kg" });
    expect(unitPrice(pr(1.35, { amount: 5.62, unit: "per kg DR.WT" }), { size: "", per: "g" })).toBeNull();
    expect(unitPrice(pr(0.45, { amount: 0.08, unit: "each" }), { size: "", per: "g" })).toBeNull();
  });
});

describe("one product at several supermarkets", () => {
  const a = file("aldi", [p({ gtin: "5011111111111", name: "Semi Skimmed Milk (Aldi)", brand: "Cowbelle", size: "2L", price: pr(1.4) })]);
  const t = file("tesco", [p({ gtin: "5011111111111", name: "Cowbelle Semi Skimmed Milk 2 Litres", brand: "Cowbelle", size: "2 litres", price: pr(1.6) })]);
  const s = file("sainsburys", [p({ gtin: "5011111111111", name: "Cowbelle Semi Skimmed Milk", brand: "Cowbelle", size: "2L" })]);
  const all = mergeProducts([a, t, s]);
  const milk = all[0]!;

  it("keeps each supermarket's own name and size", () => {
    expect(all).toHaveLength(1);
    expect(milk.retailers).toEqual(["aldi", "tesco", "sainsburys"]);
    expect(forRetailer(milk, "tesco").name).toBe("Cowbelle Semi Skimmed Milk 2 Litres");
    expect(forRetailer(milk, "tesco").size).toBe("2 litres");
    expect(forRetailer(milk, "aldi").name).toBe("Semi Skimmed Milk (Aldi)");
    expect(forRetailer(milk, "morrisons")).toBe(milk); // not sold there: unchanged
    expect(forRetailer(milk, "tesco").prices).toEqual(milk.prices); // every supermarket's price stays available
  });
  it("finds the product by any supermarket's name for it", () => {
    expect(searchProducts(all, { query: "litres" }).length).toBe(1);
    expect(searchProducts(all, { query: "aldi" }).length).toBe(1);
  });
  it("names the cheapest supermarket, ignoring those with no price yet", () => {
    expect(cheapestRetailer(milk)).toBe("aldi");
    expect(cheapestRetailer({ prices: {} })).toBeNull();
  });
  it("counts a loyalty-card price only when asked, and never instead of the regular price", () => {
    const withCard = { prices: { aldi: pr(1.4), tesco: { ...pr(1.6), member: { amount: 1.2, scheme: "Clubcard Price" } } } };
    expect(cheapestRetailer(withCard)).toBe("aldi"); // regular prices: Aldi
    expect(cheapestRetailer(withCard, true)).toBe("tesco"); // with the card: Tesco
    expect(withCard.prices.tesco.amount).toBe(1.6); // the regular price is still there
  });
});

describe("price rating", () => {
  const mk = (n: number, perLitre: number, extra: Partial<GroceryProduct> = {}) =>
    p({ gtin: `50000000000${String(n).padStart(2, "0")}`, name: `Milk ${n}`, brand: `Brand ${n}`, size: "1L", price: pr(perLitre), ...extra });
  const peers = [0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5].map((v, i) => mk(i + 1, v));
  const mine = (price: number, extra: Partial<GroceryProduct> = {}) => p({ gtin: "5099999999999", name: "Mine", brand: "Mine", size: "1L", price: pr(price), ...extra });
  const rate = (price: number, extra: Partial<GroceryProduct> = {}) => {
    const all = mergeProducts([file("tesco", [...peers, mine(price, extra)])]);
    return priceRating(all, all.find((x) => x.gtin === "5099999999999")!, "tesco");
  };

  it("says how many similar products cost more, and a plain band", () => {
    const cheap = rate(0.95)!;
    expect(cheap.n).toBe(7);
    expect(cheap.cheaperThanPct).toBe(86);
    expect(cheap.band).toBe("lower");
    expect(cheap.unit).toBe("l");
    expect(rate(1.2)!.band).toBe("middle");
    expect(rate(1.6)!.band).toBe("higher");
    expect(rate(1.6)!.median).toBe(1.2);
  });
  it("works out grams of protein per £1", () => {
    expect(rate(1.0, { protein: 5 })!.proteinPerPound).toBe(50);
  });
  it("needs enough similar products with prices, in the same unit, and a type", () => {
    const few = mergeProducts([file("tesco", [...peers.slice(0, 3), mine(1)])]);
    expect(priceRating(few, few.find((x) => x.gtin === "5099999999999")!, "tesco")).toBeNull();
    expect(rate(1, { type: undefined })).toBeNull();
    expect(rate(1, { type: "oat-drinks" })).toBeNull(); // no peers of that type
    const noPrice = mergeProducts([file("tesco", [...peers, { ...mine(1), price: undefined }])]);
    expect(priceRating(noPrice, noPrice.find((x) => x.gtin === "5099999999999")!, "tesco")).toBeNull();
  });
  it("doesn't count other sizes of the same product as peers", () => {
    const sameFamily = [0.5, 0.6, 0.7, 0.8, 0.9].map((v, i) => p({ gtin: `5088888888${String(i).padStart(3, "0")}`, name: "Mine", brand: "Mine", size: `${i + 2}L`, price: pr(v * (i + 2)) }));
    const all = mergeProducts([file("tesco", [...sameFamily, mine(1)])]);
    expect(priceRating(all, all.find((x) => x.gtin === "5099999999999")!, "tesco")).toBeNull();
  });
});
