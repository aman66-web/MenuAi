import { describe, expect, it } from "vitest";
import { MIN_RECIPE_SHOP_PRODUCTS, decodeShopProducts, isShopFile, isShopManifest, nutritionBasis, otherRecipeShops, possessive, recipeListOf, recipeShops, searchShopProducts, shopPageUrl, shopPhotoUrl, type ShopFile } from "../lib/mm/shopProducts";

const file: ShopFile = {
  v: 1, retailer: "sainsburys", name: "Sainsbury's", checkedOn: "2026-10-08", pageBase: "https://www.sainsburys.co.uk/groceries/product/", photoBase: "https://assets.sainsburys-groceries.co.uk/gol/",
  categories: ["Dairy", "Bakery"], schemes: ["Nectar price"],
  products: [
    ["sainsburys-greek-style-natural-yogurt-500g", "Sainsbury's Greek Style Natural Yogurt 500g", 1.15, 2.3, "per kg", null, null, 0, "6325944", "00123456"],
    ["sainsburys-multiseed-loaf-800g", "Sainsbury's Multiseed Loaf 800g", 1.6, 2, "per kg", 1.2, 0, 1, "", "", [250, 9.5, 41, 4.2, 0.6, 3.1, 7, 1.1, 1060, "g"]],
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
  it("carries the numbers read from a product's own page, and ranks only products that have them", () => {
    const ps = decodeShopProducts(file);
    expect(ps[1]!.nutrition).toEqual({ kcal: 250, protein: 9.5, carbs: 41, fat: 4.2, saturates: 0.6, sugars: 3.1, fibre: 7, salt: 1.1, kj: 1060, per: "g", state: "" });
    expect(ps[0]!.nutrition).toBeNull();
    // a malformed nutrition array is ignored, never half-used
    const odd = decodeShopProducts({ ...file, products: [["x-1", "Odd", 1, null, "", null, null, 0, "", "", [1, 2, 3] as never]] });
    expect(odd[0]!.nutrition).toBeNull();
    expect(searchShopProducts(ps, { nutrition: true }).map((p) => p.id)).toEqual(["sainsburys-multiseed-loaf-800g"]);
    expect(searchShopProducts(ps, { sort: "density" })[0]!.id).toBe("sainsburys-multiseed-loaf-800g");
    expect(searchShopProducts(ps, { sort: "protein" }).map((p) => p.id)[0]).toBe("sainsburys-multiseed-loaf-800g");
    // the products with no numbers come after, in name order: nothing is guessed for them
    expect(nutritionBasis(ps[1]!.nutrition!)).toBe("per 100 g");
    // numbers for the grilled food are labelled and never ranked against food as sold
    const grilled = decodeShopProducts({ ...file, products: [["bacon-1", "Bacon", 2, null, "", null, null, 0, "", "", [365, 27.5, 1, 27.7, null, null, null, null, 1514, "g", "grilled"]], ["milk-1", "Milk", 1, null, "", null, null, 0, "", "", [50, 3.4, 4.8, 1.7, null, null, null, null, null, "ml", ""]], ["odd-1", "Odd", 1, null, "", null, null, 0, "", "", [50, 3.4, 4.8, 1.7, null, null, null, null, null, "ml", "Bad<state"]]] });
    expect(nutritionBasis(grilled[0]!.nutrition!)).toBe("per 100 g (grilled)");
    expect(grilled[2]!.nutrition!.state).toBe("");
    expect(searchShopProducts(grilled, { sort: "density" }).map((p) => p.id)).toEqual(["milk-1", "odd-1", "bacon-1"]);
    expect(searchShopProducts(ps, { sort: "density" }).slice(1).map((p) => p.name)).toEqual(["Brita Maxtra Filter – 3 pack", "Sainsbury's Greek Style Natural Yogurt 500g"]);
  });
  it("sorts A to Z with names that start with a number or a sign after the letters", () => {
    const row = (id: string, name: string) => [id, name, 1, null, "", null, null, 0, "", ""] as ShopFile["products"][number];
    const ps = decodeShopProducts({ ...file, products: [row("a-1", "-196 Lemon Shochu 330ml"), row("b-1", "1000 Stories Bourbon 75cl"), row("c-1", "apple Juice 1l"), row("d-1", "Banana Bread 400g")] });
    expect(searchShopProducts(ps, { sort: "name" }).map((p) => p.id)).toEqual(["c-1", "d-1", "a-1", "b-1"]);
  });
  it("keeps a product whose price is only in store (Lidl's everyday range), with no unit or card price, and sorts it last by price", () => {
    const row = (id: string, price: number | null, member: number | null = null) => [id, `Item ${id}`, price, 2, "per kg", member, member === null ? null : 0, 0, "", ""] as ShopFile["products"][number];
    const ps = decodeShopProducts({ ...file, products: [row("a-1", null, 0.5), row("b-1", 1.5), row("c-1", 0.8), row("d-1", -1 as never), row("e-1", "1" as never)] });
    expect(ps.map((p) => p.id)).toEqual(["a-1", "b-1", "c-1"]); // a negative or non-number price is a malformed row
    expect(ps[0]).toMatchObject({ price: null, unitPrice: null, member: null });
    expect(searchShopProducts(ps, { sort: "price" }).map((p) => p.id)).toEqual(["c-1", "b-1", "a-1"]);
    expect(searchShopProducts(ps, { sort: "priceDesc" }).map((p) => p.id)).toEqual(["b-1", "c-1", "a-1"]);
    expect(searchShopProducts(ps, { sort: "unit" }).map((p) => p.id)).toEqual(["b-1", "c-1", "a-1"]);
  });
  it("by protein per 100 kcal, a product with under 1 g of protein goes after the others", () => {
    const row = (id: string, kcal: number, protein: number) => [id, `Item ${id}`, 1, null, "", null, null, 0, "", "", [kcal, protein, 1, 0, null, null, null, null, null, "ml", ""]] as ShopFile["products"][number];
    const ps = decodeShopProducts({ ...file, products: [row("drink-1", 2, 0.5), row("milk-1", 50, 3.4), row("shake-1", 70, 10)] });
    expect(searchShopProducts(ps, { sort: "density" }).map((p) => p.id)).toEqual(["shake-1", "milk-1", "drink-1"]);
    expect(searchShopProducts(ps, { sort: "protein" }).map((p) => p.id)).toEqual(["shake-1", "milk-1", "drink-1"]);
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

describe("other shops' lists: photo templates, page paths, search links", () => {
  const base = { v: 1 as const, checkedOn: "2026-10-08", categories: ["Chilled Food"], schemes: [], products: [] };
  it("puts a safe picture id into the shop's template and rejects anything else", () => {
    const asda: ShopFile = { ...base, retailer: "asda", name: "Asda", pageBase: "https://www.asda.com/groceries/search/", pageSearch: true,
      photoBase: "https://asdagroceries.scene7.com/is/image/asdagroceries/", photoTemplate: "https://asdagroceries.scene7.com/is/image/asdagroceries/{photo}?wid=400",
      products: [["165468", "ASDA Semi Skimmed Milk 4 Pints", 1.65, 0.726, "per litre", null, null, 0, "20337087", ""], ["2", "Bad", 1, null, "", null, null, 0, "../evil", ""]] };
    const [milk, bad] = decodeShopProducts(asda);
    expect(shopPhotoUrl(asda, milk!)).toBe("https://asdagroceries.scene7.com/is/image/asdagroceries/20337087?wid=400");
    expect(bad!.photoId).toBe("");
    expect(shopPhotoUrl(asda, bad!)).toBeUndefined();
    expect(shopPageUrl(asda, milk!)).toBe("https://www.asda.com/groceries/search/ASDA%20Semi%20Skimmed%20Milk%204%20Pints");
  });
  it("uses the row's page path when there is one (Aldi, Lidl), and keeps Sainsbury's as it was", () => {
    const aldi: ShopFile = { ...base, retailer: "aldi", name: "Aldi", pageBase: "https://www.aldi.co.uk/product/",
      photoBase: "https://dm.emea.cms.aldi.cx/", photoTemplate: "https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/{photo}/image",
      products: [["340660002", "NATURE'S PICK Apple + Grape Snack Pack", 0.39, null, "", null, null, 0, "b55a9555-b044-484b-b1a0-9b4490319df5", "", null, "nature-s-pick-apple-grape-snack-pack-000000000340660002"],
        ["3", "Odd page", 1, null, "", null, null, 0, "", "", null, "../../x"]] };
    const [p, odd] = decodeShopProducts(aldi);
    expect(shopPageUrl(aldi, p!)).toBe("https://www.aldi.co.uk/product/nature-s-pick-apple-grape-snack-pack-000000000340660002");
    expect(shopPhotoUrl(aldi, p!)).toBe("https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/b55a9555-b044-484b-b1a0-9b4490319df5/image");
    expect(odd!.page).toBe("");
    expect(shopPageUrl(aldi, odd!)).toBe("https://www.aldi.co.uk/product/3");
    // no template: Sainsbury's numeric picture ids only
    const sb: ShopFile = { ...base, retailer: "sainsburys", name: "Sainsbury's", pageBase: "https://www.sainsburys.co.uk/groceries/product/", photoBase: "https://assets.sainsburys-groceries.co.uk/gol/",
      products: [["milk-2l", "Milk", 1.5, null, "", null, null, 0, "777", ""], ["x", "X", 1, null, "", null, null, 0, "abc", ""]] };
    const [m, x] = decodeShopProducts(sb);
    expect(shopPhotoUrl(sb, m!)).toBe("https://assets.sainsburys-groceries.co.uk/gol/777/image.jpg");
    expect(x!.photoId).toBe("");
  });
  it("Iceland: an encoded picture path and the /p/x/<id>.html page; Morrisons: a two-part picture id and the shop's search", () => {
    const ice: ShopFile = { ...base, retailer: "iceland", name: "Iceland", pageBase: "https://www.iceland.co.uk/p/x/", photoBase: "https://assets.iceland.co.uk/i/",
      photoTemplate: "https://assets.iceland.co.uk/i/{photo}?w=400&h=400",
      products: [["89177", "Slimming World Salt & Pepper Chow Mein 550g", 4, 7.27, "per kg", null, null, 0, "iceland/slimming_world_salt_%26_pepper_550g_89177.jpg", "", null, "89177.html"]] };
    const [chow] = decodeShopProducts(ice);
    expect(shopPhotoUrl(ice, chow!)).toBe("https://assets.iceland.co.uk/i/iceland/slimming_world_salt_%26_pepper_550g_89177.jpg?w=400&h=400");
    expect(shopPageUrl(ice, chow!)).toBe("https://www.iceland.co.uk/p/x/89177.html");
    const mor: ShopFile = { ...base, retailer: "morrisons", name: "Morrisons", pageBase: "https://groceries.morrisons.com/search?entry=", pageSearch: true,
      photoBase: "https://groceries.morrisons.com/images-v3/", photoTemplate: "https://groceries.morrisons.com/images-v3/{photo}/300x300.jpg",
      products: [["115455355", "Fyffes Bananas 5 Pack", 0.78, 0.156, "each", null, null, 0, "4b85987b-1398-4173-a0c1-3546047c9d74/b41f9f6e-707e-4e0a-8296-8981b52f8d62", ""]] };
    const [bananas] = decodeShopProducts(mor);
    expect(shopPhotoUrl(mor, bananas!)).toBe("https://groceries.morrisons.com/images-v3/4b85987b-1398-4173-a0c1-3546047c9d74/b41f9f6e-707e-4e0a-8296-8981b52f8d62/300x300.jpg");
    expect(shopPageUrl(mor, bananas!)).toBe("https://groceries.morrisons.com/search?entry=Fyffes%20Bananas%205%20Pack");
  });
  it("M&S: the everyday range has no price, a '<hash>.jpg' picture and its own page under /food/; its priced rows keep the search link", () => {
    const hash = "5202e37a68b76b677fcb077d8e419d0b";
    const ms: ShopFile = { ...base, retailer: "marks-and-spencer", name: "M&S", categories: ["Food to order", "Fruit & Vegetables"],
      pageBase: "https://www.marksandspencer.com/search?searchTerm=", pageSearch: true, pageRoot: "https://www.marksandspencer.com/food/", priceNote: "stores",
      photoBase: "https://assets.digitalcontent.marksandspencer.app/image/upload/", photoTemplate: "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/{photo}",
      products: [["fdp60064368", "Baby Rainbow Carrots 200 g", null, 2, "per kg", 1.5, 0, 1, `${hash}.jpg`, "", null, "baby-rainbow-carrots/p/fdp60064368"],
        ["ckp60095316", "M&S Rainbow Cake (Serves 12)", 35, null, "", null, null, 0, "SD_FD_F09A_00346825_NC_X_EC_0", ""],
        ["fdp60000009", "Odd Page 100 g", null, null, "", null, null, 1, "", "", null, "../../evil"]] };
    expect(isShopFile(ms)).toBe(true);
    const [carrots, cake, odd] = decodeShopProducts(ms);
    expect(carrots).toMatchObject({ price: null, unitPrice: null, member: null, photoId: `${hash}.jpg`, page: "baby-rainbow-carrots/p/fdp60064368", category: "Fruit & Vegetables" });
    expect(shopPhotoUrl(ms, carrots!)).toBe(`https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/${hash}.jpg`);
    expect(shopPhotoUrl(ms, cake!)).toBe("https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/SD_FD_F09A_00346825_NC_X_EC_0");
    expect(shopPageUrl(ms, carrots!)).toBe("https://www.marksandspencer.com/food/baby-rainbow-carrots/p/fdp60064368");
    expect(shopPageUrl(ms, cake!)).toBe("https://www.marksandspencer.com/search?searchTerm=M%26S%20Rainbow%20Cake%20(Serves%2012)");
    expect(odd!.page).toBe("");                                                         // an unsafe page path is dropped, never joined to the root
    expect(shopPageUrl(ms, odd!)).toBe("https://www.marksandspencer.com/search?searchTerm=Odd%20Page%20100%20g");
    expect(searchShopProducts([carrots!, cake!], { sort: "price" }).map((p) => p.id)).toEqual(["ckp60095316", "fdp60064368"]);        // unpriced last
    expect(searchShopProducts([carrots!, cake!], { sort: "priceDesc" }).map((p) => p.id)).toEqual(["ckp60095316", "fdp60064368"]);
    // a shop without pageRoot (every other shop) reads page paths against pageBase, as before
    expect(shopPageUrl({ pageBase: "https://www.aldi.co.uk/product/" }, { id: "1", name: "x", page: "x-1" })).toBe("https://www.aldi.co.uk/product/x-1");
  });
  it("pageRoot and priceNote are checked: https only, and only the two known price notes", () => {
    expect(isShopFile({ ...file, pageRoot: "https://www.marksandspencer.com/food/", priceNote: "stores" })).toBe(true);
    expect(isShopFile({ ...file, priceNote: "offers" })).toBe(true);
    expect(isShopFile({ ...file, pageRoot: "http://www.marksandspencer.com/food/" })).toBe(false);
    expect(isShopFile({ ...file, pageRoot: 7 })).toBe(false);
    expect(isShopFile({ ...file, priceNote: "x" })).toBe(false);
  });
  it("a template that isn't https or has no {photo} gives no picture", () => {
    const f = { photoBase: "https://x/", photoTemplate: "http://x/{photo}" };
    expect(shopPhotoUrl(f, { photoId: "abc" })).toBeUndefined();
    expect(shopPhotoUrl({ photoBase: "https://x/", photoTemplate: "https://x/fixed.jpg" }, { photoId: "abc" })).toBeUndefined();
  });
  it("recipes only use shops whose labels we have read", () => {
    const m = { v: 1 as const, retailers: [
      { id: "asda", name: "Asda", file: "asda.json", count: 11839, checkedOn: "2026-10-08", sha256: "", nutrition: 0 },
      { id: "aldi", name: "Aldi", file: "aldi.json", count: 3400, checkedOn: "2026-10-08", sha256: "" },
      { id: "sainsburys", name: "Sainsbury's", file: "sainsburys.json", count: 17036, checkedOn: "2026-10-08", sha256: "", nutrition: 12741 }] };
    expect(recipeShops(m).map((r) => r.id)).toEqual(["sainsburys"]);
    expect(recipeShops(null)).toEqual([]);
  });
});

describe("borrowed photos for list rows without one (founder 2026-10-11)", () => {
  it("accepts another supermarket's or Open Food Facts' own image server only, and credits it", async () => {
    const { shopPhotoSources } = await import("../lib/mm/shopProducts");
    const row = (other: unknown) => ["x-1", "Hovis Bread 800g", 1.25, null, "", null, null, 0, "", "", null, "", other] as unknown as ShopFile["products"][number];
    const decode = (other: unknown) => decodeShopProducts({ ...file, products: [row(other)] })[0]!;
    const asda = decode(["asda", "https://asdagroceries.scene7.com/is/image/asdagroceries/5010044000046?wid=400"]);
    expect(shopPhotoSources(file, asda)).toEqual([{ src: "https://asdagroceries.scene7.com/is/image/asdagroceries/5010044000046?wid=400", from: "retailer", shop: "asda" }]);
    const off = decode(["off", "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.633.400.jpg"]);
    expect(shopPhotoSources(file, off)[0]).toMatchObject({ from: "off", shop: "" });
    for (const bad of [["asda", "http://asdagroceries.scene7.com/x.jpg"], ["asda", "https://evil.example/x.jpg"], ["off", "https://asdagroceries.scene7.com/x"], ["asda", "https://images.openfoodfacts.org/x.jpg"], "nope"]) {
      expect(decode(bad).otherPhoto).toBeUndefined();
    }
    // the shop's own photo always comes first
    expect(shopPhotoSources(file, { ...asda, photoId: "6325944" })[0]).toMatchObject({ shop: "sainsburys" });
  });
});

describe("recipe lists: another supermarket's products for a recipe (founder 2026-10-16)", () => {
  const row = (id: string, n: unknown) => [id, `Item ${id}`, 1, null, "", null, null, 0, "", "", n] as unknown as ShopFile["products"][number];
  const decode = (...n: unknown[]) => decodeShopProducts({ ...file, products: n.map((x, i) => row(`r-${i}`, x)) });

  it("reads element 12 'c' as community numbers and nothing else as a source", () => {
    const [community, own, empty, odd, upper, long, other] = decode(
      [250, 9, 41, 4, null, null, null, null, null, "g", "", "c"],
      [250, 9, 41, 4, null, null, null, null, null, "g", ""],
      [250, 9, 41, 4, null, null, null, null, null, "g"],
      [250, 9, 41, 4, null, null, null, null, null, "g", "", "s"], // a marker we don't know is ignored, never trusted
      [250, 9, 41, 4, null, null, null, null, null, "g", "", "C"],
      [250, 9, 41, 4, null, null, null, null, null, "g", "", "community"],
      [250, 9, 41, 4, null, null, null, null, null, "g", "", 1],
    );
    expect(community!.nutrition).toEqual({ kcal: 250, protein: 9, carbs: 41, fat: 4, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per: "g", state: "", source: "community" });
    for (const p of [own, empty, odd, upper, long, other]) {
      expect(p!.nutrition).not.toBeNull();
      expect(p!.nutrition).not.toHaveProperty("source");
    }
    // rows without the marker decode exactly as they always did
    expect(own!.nutrition).toEqual({ kcal: 250, protein: 9, carbs: 41, fat: 4, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per: "g", state: "" });
  });

  it("keeps the state word next to the marker, and a bad state is still ignored", () => {
    const [drained, bad] = decode([105, 8.1, 12.8, 0.6, null, null, null, null, null, "g", "drained"], [105, 8.1, 12.8, 0.6, null, null, null, null, null, "g", "Bad<state", "c"]);
    expect(drained!.nutrition!.state).toBe("drained");
    expect(bad!.nutrition).toMatchObject({ state: "", source: "community" });
  });

  describe("which shops a recipe can borrow from", () => {
    const entry = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, file: `${id}.json`, count: 5000, checkedOn: "2026-10-08", sha256: `full-${id}`, ...extra });
    const manifest = {
      v: 1 as const,
      retailers: [
        entry("sainsburys", "Sainsbury's", { nutrition: 12712 }),
        entry("tesco", "Tesco", { nutrition: 0, recipe: { file: "tesco.json", count: 116, sha256: "r-tesco" } }),
        entry("asda", "Asda", { nutrition: 0, recipe: { file: "asda.json", count: 476, sha256: "r-asda" } }),
        entry("morrisons", "Morrisons", { recipe: { file: "morrisons.json", count: 159, sha256: "r-mor" } }),
        entry("waitrose", "Waitrose", { recipe: { file: "waitrose.json", count: 99, sha256: "r-wait" } }), // under the threshold
        entry("iceland", "Iceland", { recipe: { file: "iceland.json", count: 100, sha256: "r-ice" } }), // exactly the threshold
        entry("aldi", "Aldi"), // no recipe list, no labels
        entry("lidl", "Lidl", { nutrition: 0 }),
        entry("evil", "Evil", { recipe: { file: "../../etc/passwd", count: 500, sha256: "x" } }), // not a plain file name
      ],
    };

    it("offers shops with at least MIN_RECIPE_SHOP_PRODUCTS products, never the home shop, never a shop with no list or a bad file name", () => {
      expect(MIN_RECIPE_SHOP_PRODUCTS).toBe(100);
      expect(otherRecipeShops(manifest, "sainsburys").map((r) => r.id)).toEqual(["asda", "morrisons", "tesco", "iceland"]);
      // a shop that is not the home shop but has its own labels read counts by its labelled products, and the home shop moves out of the list
      expect(otherRecipeShops(manifest, "asda").map((r) => r.id)).toEqual(["sainsburys", "morrisons", "tesco", "iceland"]);
      expect(otherRecipeShops(null, "sainsburys")).toEqual([]);
      expect(otherRecipeShops({ v: 1, retailers: [] }, null)).toEqual([]);
    });

    it("puts the person's own supermarkets first, in their order, then the rest by size and name", () => {
      expect(otherRecipeShops(manifest, "sainsburys", ["iceland", "tesco"]).map((r) => r.id)).toEqual(["iceland", "tesco", "asda", "morrisons"]);
      expect(otherRecipeShops(manifest, "sainsburys", ["waitrose", "nowhere", "morrisons"]).map((r) => r.id)).toEqual(["morrisons", "asda", "tesco", "iceland"]); // a shop under the threshold is not offered even if it is theirs
      const tie = { v: 1 as const, retailers: [entry("b-shop", "Beta", { recipe: { file: "b.json", count: 200, sha256: "b" } }), entry("a-shop", "Alpha", { recipe: { file: "a.json", count: 200, sha256: "a" } })] };
      expect(otherRecipeShops(tie, null).map((r) => r.id)).toEqual(["a-shop", "b-shop"]);
    });

    it("does not change the manifest it is given", () => {
      const before = JSON.stringify(manifest);
      otherRecipeShops(manifest, "sainsburys", ["tesco"]);
      expect(JSON.stringify(manifest)).toBe(before);
    });

    it("finds a shop's list: its recipe list, else its labelled full list, else nothing", () => {
      const by = (id: string) => manifest.retailers.find((r) => r.id === id)!;
      expect(recipeListOf(by("asda"))).toEqual({ kind: "recipe", path: "/groceries/recipe/asda.json", sha256: "r-asda", count: 476 });
      expect(recipeListOf(by("sainsburys"))).toEqual({ kind: "all", path: "/groceries/all/sainsburys.json", sha256: "full-sainsburys", count: 12712 });
      expect(recipeListOf(by("aldi"))).toBeNull();
      expect(recipeListOf(by("lidl"))).toBeNull();
      expect(recipeListOf(by("evil"))).toBeNull();
      expect(recipeListOf({ ...by("aldi"), file: "../x.json", nutrition: 500 })).toBeNull();
    });
  });
});
