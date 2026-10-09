import { describe, expect, it } from "vitest";
import { decodeShopProducts, isShopFile, isShopManifest, possessive, searchShopProducts, shopPageUrl, shopPhotoUrl, type ShopFile } from "../lib/mm/shopProducts";

const file: ShopFile = {
  v: 1, retailer: "sainsburys", name: "Sainsbury's", checkedOn: "2026-10-08", pageBase: "https://www.sainsburys.co.uk/groceries/product/", photoBase: "https://assets.sainsburys-groceries.co.uk/gol/",
  categories: ["Dairy", "Bakery"], schemes: ["Nectar price"],
  products: [
    ["sainsburys-greek-style-natural-yogurt-500g", "Sainsbury's Greek Style Natural Yogurt 500g", 1.15, 2.3, "per kg", null, null, 0, "6325944", "00123456"],
    ["sainsburys-multiseed-loaf-800g", "Sainsbury's Multiseed Loaf 800g", 1.6, 2, "per kg", 1.2, 0, 1, "", ""],
    ["brita-filter-%E2%80%93-3-pack", "Brita Maxtra Filter – 3 pack", 22.5, null, "each", null, null, 1, "123", ""],
    ["bad id with spaces", "x", 1, null, "", null, null, 0, "", ""],
    ["short", "Too short row", 1] as unknown as ShopFile["products"][number],
  ],
};

describe("every-product lists", () => {
  it("decodes rows, keeps card prices with their scheme and drops malformed rows", () => {
    const ps = decodeShopProducts(file);
    expect(ps.map((p) => p.id)).toEqual(["sainsburys-greek-style-natural-yogurt-500g", "sainsburys-multiseed-loaf-800g", "brita-filter-%E2%80%93-3-pack"]);
    expect(ps[1]!.member).toEqual({ amount: 1.2, scheme: "Nectar price" });
    expect(ps[0]!.member).toBeNull();
    expect(ps[0]!.category).toBe("Dairy");
    expect(ps[0]!.gtin).toBe("00123456");
    expect(ps[2]!.unitPrice).toBeNull();
  });
  it("builds the shop's own page and picture addresses (https only)", () => {
    const ps = decodeShopProducts(file);
    expect(shopPageUrl(file, ps[0]!)).toBe("https://www.sainsburys.co.uk/groceries/product/sainsburys-greek-style-natural-yogurt-500g");
    expect(shopPhotoUrl(file, ps[0]!)).toBe("https://assets.sainsburys-groceries.co.uk/gol/6325944/image.jpg");
    expect(shopPhotoUrl(file, ps[1]!)).toBeUndefined();
    expect(shopPhotoUrl({ photoBase: "http://insecure.example/" }, ps[0]!)).toBeUndefined();
  });
  it("writes a possessive without doubling the s", () => {
    expect(possessive("Sainsbury's")).toBe("Sainsbury's");
    expect(possessive("Tesco")).toBe("Tesco's");
    expect(possessive("Morrisons")).toBe("Morrisons'");
    expect(possessive("M&S")).toBe("M&S's");
  });
  it("validates the file and manifest shapes", () => {
    expect(isShopFile(file)).toBe(true);
    expect(isShopFile({ ...file, pageBase: "http://x/" })).toBe(false);
    expect(isShopFile(null)).toBe(false);
    expect(isShopManifest({ v: 1, retailers: [] })).toBe(true);
    expect(isShopManifest({ v: 2, retailers: [] })).toBe(false);
  });
  it("searches by words that start a word of the name, filters by type and card price, and sorts", () => {
    const ps = decodeShopProducts(file);
    expect(searchShopProducts(ps, { query: "greek yog" }).map((p) => p.id)).toEqual(["sainsburys-greek-style-natural-yogurt-500g"]);
    expect(searchShopProducts(ps, { query: "sainsburys" }).length).toBe(2);
    expect(searchShopProducts(ps, { query: "ogurt" }).length).toBe(0);
    expect(searchShopProducts(ps, { category: "Bakery" }).length).toBe(2);
    expect(searchShopProducts(ps, { card: true }).map((p) => p.id)).toEqual(["sainsburys-multiseed-loaf-800g"]);
    expect(searchShopProducts(ps, { sort: "price" }).map((p) => p.price)).toEqual([1.15, 1.6, 22.5]);
    expect(searchShopProducts(ps, { sort: "priceDesc" })[0]!.price).toBe(22.5);
    // unit price: the cheapest per kg first; a product with no unit price goes last
    expect(searchShopProducts(ps, { sort: "unit" }).map((p) => p.unitPrice)).toEqual([2, 2.3, null]);
    expect(searchShopProducts(ps, {}).map((p) => p.name)[0]).toBe("Brita Maxtra Filter – 3 pack");
  });
});
