import { describe, expect, it } from "vitest";
import { addToList, barcodeQuery, forRetailer, listAsText, mergeProducts, photoCaption, photoSources, productLine, proteinPer100Kcal, sanitizeShoppingList, searchProducts, setQty, type GroceryFile, type GroceryProduct } from "../lib/mm/groceries";

const p = (over: Partial<GroceryProduct> & Pick<GroceryProduct, "gtin" | "name">): GroceryProduct => ({ brand: "", size: "", per: "g", kcal: 100, protein: 10, carbs: 5, fat: 3, allergens: null, category: "other", ...over });
const file = (retailer: string, products: GroceryProduct[]): GroceryFile => ({ v: 1, retailer, name: retailer, generatedOn: "2026-10-07", source: "t", products });

const aldi = file("aldi", [p({ gtin: "5012345678900", name: "Greek Style Yogurt", brand: "Mamia", kcal: 97, protein: 9, category: "dairy-eggs", price: { amount: 1.25, url: "https://x", checkedOn: "2026-10-07" } }), p({ gtin: "4056489000011", name: "Chicken Breast Fillets", kcal: 110, protein: 24, category: "meat" })]);
const tesco = file("tesco", [p({ gtin: "5012345678900", name: "Greek Style Yogurt", brand: "Mamia" }), p({ gtin: "5000000000017", name: "Crunchy Peanut Butter", kcal: 620, protein: 26, category: "cupboard" })]);
const all = mergeProducts([aldi, tesco]);

describe("groceries", () => {
  it("merges the same barcode across retailers, keeping every retailer and price", () => {
    expect(all).toHaveLength(3);
    const y = all.find((x) => x.gtin === "5012345678900")!;
    expect(y.retailers).toEqual(["aldi", "tesco"]);
    expect(y.prices).toEqual({ aldi: { amount: 1.25, url: "https://x", checkedOn: "2026-10-07" } });
  });
  it("searches by words (each must start a word of the name or brand), accents and case aside", () => {
    expect(searchProducts(all, { query: "greek yog" }).map((x) => x.name)).toEqual(["Greek Style Yogurt"]);
    expect(searchProducts(all, { query: "MAMIA" }).length).toBe(1);
    expect(searchProducts(all, { query: "ogurt" })).toEqual([]); // not the middle of a word
  });
  it("finds a product by barcode, with or without a leading zero", () => {
    expect(barcodeQuery("5 012345-678900")).toBe("5012345678900");
    expect(barcodeQuery("012345678905")).toBe("12345678905");
    expect(barcodeQuery("chicken")).toBeNull();
    expect(barcodeQuery("1234567")).toBeNull();
    expect(searchProducts(all, { query: "4056489000011" })[0]!.name).toBe("Chicken Breast Fillets");
    expect(searchProducts(all, { query: "04056489000011" })[0]!.name).toBe("Chicken Breast Fillets");
  });
  it("filters by retailer, category and having a price; sorts by protein per 100 kcal by default", () => {
    expect(searchProducts(all, { retailer: "tesco" }).length).toBe(2);
    expect(searchProducts(all, { category: "meat" }).map((x) => x.name)).toEqual(["Chicken Breast Fillets"]);
    expect(searchProducts(all, { priced: true }).map((x) => x.name)).toEqual(["Greek Style Yogurt"]);
    expect(searchProducts(all, {}).map((x) => x.name)).toEqual(["Chicken Breast Fillets", "Greek Style Yogurt", "Crunchy Peanut Butter"]);
    expect(searchProducts(all, { sort: "kcal" })[0]!.name).toBe("Greek Style Yogurt");
    expect(searchProducts(all, { sort: "name" })[0]!.name).toBe("Chicken Breast Fillets");
    expect(proteinPer100Kcal({ kcal: 0, protein: 5 })).toBe(0);
  });
  it("pictures come only from the supermarkets' own websites: stored copy, then the shop's own picture, then nothing", () => {
    // photo chain, best first: our stored copy -> the shop's own picture (https only) -> nothing ("no photo"); never Open Food Facts' (founder 2026-10-10)
    const shopImg = "https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg";
    const legacy = { photo: "0123456789ab.webp", retailerImage: shopImg, image: "501/234/567/8900/front_en.12" } as GroceryProduct & { image: string };
    expect(photoSources({ ...legacy, retailers: ["sainsburys"], byRetailer: { sainsburys: legacy } }, "sainsburys")).toEqual([
      { src: "/grocery-images/sainsburys/0123456789ab.webp", from: "stored", shop: "sainsburys" },
      { src: shopImg, from: "retailer", shop: "sainsburys" },
    ]);
    // an old file's Open Food Facts field is ignored: with no shop picture there is nothing to show
    expect(photoSources({ image: "501/234/567/8900/front_en.12", retailers: ["tesco"], byRetailer: { tesco: { image: "501/234/567/8900/front_en.12" } } } as never, "tesco")).toEqual([]);
    expect(photoSources({ retailerImage: "http://insecure.example/x.jpg" }, "tesco")).toEqual([]);
    expect(photoSources({ retailerImage: shopImg })).toEqual([]); // a picture nobody can credit to a named shop is not shown
    expect(photoSources({})).toEqual([]);
    // a stored name that is not our own file-name shape is never turned into a path; Tesco's picture stays a hotlink
    expect(photoSources({ retailers: ["tesco"], byRetailer: { tesco: { photo: "../../x.webp", retailerImage: "https://digitalcontent.api.tesco.com/a.jpeg" } } }).map((x) => x.src)).toEqual(["https://digitalcontent.api.tesco.com/a.jpeg"]);
    // the shop the person came from leads; each picture is credited to the shop it is from
    const both = { retailers: ["tesco", "sainsburys"], byRetailer: { tesco: { retailerImage: "https://digitalcontent.api.tesco.com/a.jpeg" }, sainsburys: { photo: "0123456789ab.webp" } } };
    expect(photoSources(both, "sainsburys").map((x) => [x.from, x.shop])).toEqual([["stored", "sainsburys"], ["retailer", "tesco"]]);
    expect(photoCaption({ src: "x", from: "stored", shop: "sainsburys" })).toBe("Photo from the Sainsbury's website");
    expect(photoCaption({ src: "x", from: "retailer", shop: "tesco" })).toBe("Photo from the Tesco website");
    // one shop's record never borrows another shop's picture
    const merged = mergeProducts([file("tesco", [p({ gtin: "5000000000017", name: "Beans" })]), file("sainsburys", [p({ gtin: "5000000000017", name: "Beans", retailerImage: shopImg })])])[0]!;
    expect(forRetailer(merged, "tesco").retailerImage).toBeUndefined();
    expect(photoSources(merged, "tesco")).toEqual([{ src: shopImg, from: "retailer", shop: "sainsburys" }]);
  });
  it("builds the nutrition line", () => {
    expect(productLine({ kcal: 97.4, protein: 9, carbs: 4.2, fat: 5 })).toBe("97 kcal · 9g protein · 4.2g carbs · 5g fat");
    expect(productLine({ kcal: 620, protein: 26.4, carbs: 12, fat: 51 })).toBe("620 kcal · 26g protein · 12g carbs · 51g fat");
  });
  it("shopping list: same barcode and retailer raises the quantity; zero removes; text groups by retailer", () => {
    let list = addToList([], { gtin: "5012345678900", retailer: "aldi", name: "Greek Style Yogurt", brand: "Mamia", size: "500 g" });
    list = addToList(list, { gtin: "5012345678900", retailer: "aldi", name: "Greek Style Yogurt", brand: "Mamia", size: "500 g" });
    list = addToList(list, { gtin: "5012345678900", retailer: "tesco", name: "Greek Style Yogurt", brand: "Mamia", size: "500 g" });
    expect(list.map((i) => [i.retailer, i.qty])).toEqual([["aldi", 2], ["tesco", 1]]);
    expect(listAsText(list)).toBe("Aldi\n- 2 x Greek Style Yogurt 500 g (5012345678900)\n\nTesco\n- 1 x Greek Style Yogurt 500 g (5012345678900)");
    expect(setQty(list, "5012345678900", "tesco", 0).map((i) => i.retailer)).toEqual(["aldi"]);
    expect(setQty(list, "5012345678900", "aldi", 99)[0]!.qty).toBe(20);
  });
  it("a stored list is cleaned: bad rows dropped, quantities bounded", () => {
    const clean = sanitizeShoppingList([{ gtin: "5012345678900", retailer: "aldi", name: "X", qty: 500 }, { gtin: "bad", retailer: "aldi", name: "Y" }, null, { gtin: "5012345678900", retailer: "tesco", name: "" }]);
    expect(clean).toHaveLength(1);
    expect(clean[0]!.qty).toBe(20);
    expect(sanitizeShoppingList("nope")).toEqual([]);
  });
});
