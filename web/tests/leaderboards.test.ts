import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARDS, boardValue, brandedNameKey, buildBoard, buildLeaderboards, isLeaderboardsFile, sameProductGroups, sameProductKey } from "../lib/mm/leaderboards";
import { decodeShopProducts, type ShopFile, type ShopManifest, type ShopNutrition, type ShopProduct } from "../lib/mm/shopProducts";

// Nutrition leaderboards (founder 2026-11-18). The published file is worked out from the published shop lists; regenerate after the lists are rebuilt:
//   WRITE_LEADERBOARDS=1 npx vitest run tests/leaderboards.test.ts
const FILE = "public/groceries/all/leaderboards.json";

const label = (over: Partial<ShopNutrition> = {}): ShopNutrition => ({ kcal: 120, protein: 20, carbs: 5, fat: 2, saturates: 1, sugars: 1, fibre: 3, salt: 0.5, kj: 500, per: "g", state: "", ...over });
const product = (id: string, name: string, over: Partial<ShopProduct> = {}, n: Partial<ShopNutrition> | null = {}): ShopProduct => ({
  id, name, price: 2, unitPrice: 8, unit: "per kg", member: null, category: "Food", photoId: `${id}-photo`, gtin: "", nutrition: n === null ? null : label(n), ...over,
});

describe("what goes on a board", () => {
  it("takes the shop's own label as sold, never community numbers, government produce figures or a cooked label", () => {
    expect(boardValue("protein", product("a", "Chicken", {}, { protein: 31 }))).toBe(31);
    expect(boardValue("protein", product("a", "Chicken", {}, { protein: 31, community: true }))).toBeNull();
    expect(boardValue("protein", product("a", "Onion", {}, { protein: 1, govFood: "Onions, raw" }))).toBeNull();
    expect(boardValue("protein", product("a", "Bacon", {}, { protein: 25, state: "grilled" }))).toBeNull();
    expect(boardValue("protein", product("a", "No label", {}, null))).toBeNull();
    // a label sharing another shop's page for the same product is a real label
    expect(boardValue("protein", product("a", "Skyr", {}, { protein: 11, sameAs: "tesco" }))).toBe(11);
  });

  it("compares the per-100 g boards by weight only, and leaves out a label whose figures can't all be true", () => {
    expect(boardValue("protein", product("m", "Milk", { unit: "per litre" }, { per: "ml", protein: 3.6 }))).toBeNull();
    expect(boardValue("carbs", product("x", "Odd", {}, { carbs: 90, protein: 20, fat: 10 }))).toBeNull();
    expect(boardValue("fibre", product("f", "Bran", {}, { fibre: 27 }))).toBe(27);
    expect(boardValue("fibre", product("f", "No fibre printed", {}, { fibre: null }))).toBeNull();
  });

  it("counts protein for the calories and its cost only for protein foods", () => {
    expect(boardValue("proteinPerKcal", product("c", "Chicken breast", {}, { protein: 24, kcal: 106 }))).toBe(22.6);
    expect(boardValue("proteinPerKcal", product("b", "Bread", {}, { protein: 9, kcal: 250, carbs: 45 }))).toBeNull();
    expect(boardValue("cheapestProtein", product("c", "Chicken breast", { unitPrice: 6 }, { protein: 24, kcal: 106 }))).toBe(25);
    expect(boardValue("cheapestProtein", product("c", "Chicken breast", { unitPrice: null }, { protein: 24, kcal: 106 }))).toBeNull();
  });
});

describe("what is left off", () => {
  it("leaves out powders, supplements, herbs and spices, and sugar and sweets from Most carbs", () => {
    expect(boardValue("protein", product("p", "Myprotein Impact Whey Isolate 1kg", {}, { protein: 86, kcal: 370, carbs: 3, fat: 1 }))).toBeNull();
    expect(boardValue("fibre", product("s", "Sainsbury's Ground Cinnamon 38g", {}, { fibre: 53 }))).toBeNull();
    expect(boardValue("carbs", product("u", "Billington's Golden Granulated Sugar 1kg", {}, { carbs: 100, protein: 0, fat: 0 }))).toBeNull();
    expect(boardValue("carbs", product("r", "Basmati Rice 1kg", {}, { carbs: 78, sugars: 0.5, protein: 8, fat: 1 }))).toBe(78);
    expect(boardValue("carbs", product("m", "Meringue Nests x8", {}, { carbs: 94, sugars: 90, protein: 4, fat: 0 }))).toBeNull();
    expect(boardValue("carbs", product("d", "Unicorn Cake Decorations x12", {}, { carbs: 98, protein: 0, fat: 1 }))).toBeNull();
    expect(boardValue("fewestKcal", product("l", "Little Gem Lettuce 2 Pack", {}, { kcal: 15, protein: 1, carbs: 2, fat: 0.3 }))).toBe(15);
    expect(boardValue("fewestKcal", product("z", "Zero Calorie Cooking Spray", {}, { kcal: 2, protein: 0, carbs: 0, fat: 0.2 }))).toBeNull();
    expect(boardValue("fewestKcal", product("v", "White Wine Vinegar 350ml", {}, { kcal: 20, protein: 0, carbs: 0.6, fat: 0 }))).toBeNull();
    expect(boardValue("protein", product("b", "Beef Jerky 70g", {}, { protein: 45, kcal: 260, carbs: 10, fat: 4 }))).toBe(45);
  });
});

describe("what is left off (the review of 2026-11-20)", () => {
  const n = { protein: 30, kcal: 300, carbs: 40, fat: 5, sugars: 1, fibre: 35 };
  it("keeps protein powders and instant or bone broths off the protein boards", () => {
    expect(boardValue("protein", product("p", "Pulsin Complete Vegan Vanilla Protein 270g", {}, { protein: 73.8, kcal: 380, carbs: 6, fat: 8 }))).toBeNull();
    expect(boardValue("protein", product("b", "Freja Instant Beef Bone Broth 48g", {}, { protein: 73, kcal: 340, carbs: 2, fat: 4 }))).toBeNull();
    expect(boardValue("protein", product("c", "Borough Broth Chicken Bone Broth 400g", {}, { protein: 5, kcal: 25, carbs: 0, fat: 0.5 }))).toBeNull();
    expect(boardValue("fewestKcal", product("m", "Crusha Strawberry Flavour Milkshake Mix 1 Litre", {}, { kcal: 6, protein: 0, carbs: 1.4, fat: 0 }))).toBeNull();
    expect(boardValue("proteinPerKcal", product("j", "TRUEfoods Chilled Veal Jus 200g", {}, { protein: 10, kcal: 41, carbs: 0.5, fat: 0.3 }))).toBeNull();
  });
  it("keeps sardines and other fish off the meat-free board", async () => {
    const { isMeatFreeProteinName } = await import("../lib/mm/leaderboards");
    for (const name of ["Cawoods Sardines In Spiced Soya Oil 125g", "Pilchards in Tomato Sauce", "Squid Rings with Soya Beans", "Mackerel & Bean Salad", "Scampi & Beans", "Cod Roe with Beans", "Smoked Trout & Lentils"]) {
      expect(isMeatFreeProteinName(name), name).toBe(false);
    }
  });
  it("keeps sweeteners and cake decorations off Most carbs, and spices, seeds and nori off Most fibre", () => {
    for (const name of ["Canderel Sugarly Pouch 370g", "Pure Via Erythritol 370g", "Canderel Sucralose Jar 75g", "Truvia Stevia 270g", "Cake Decor Halloween Spooky Cobwebs 4g", "Cake Décor Christmas Snowflakes 4g", "Splenda Granulated 125g", "Xylitol 500g"]) {
      expect(boardValue("carbs", product("s", name, {}, { carbs: 99, sugars: 0, protein: 0, fat: 0 })), name).toBeNull();
    }
    for (const name of ["Cooks' Ingredients Ground Coriander 42g", "Cooks' Ingredients Kashmiri Chilli Blend 50g", "Clearspring 7 Sheets Sushi Nori 17g", "Cooks' Ingredients Fennel Seeds 33g", "Cooks' Ingredients Caraway Seeds 40g", "Cooks' Ingredients Turkish Pepper Flakes 40g", "Cooks' Ingredients Ras el Hanout 50g", "Bouquet Garni 5 g", "Garam Masala 100g", "Chinese Five Spice 50g", "Za'atar 40g", "Ground Ginger 30g"]) {
      expect(boardValue("fibre", product("f", name, {}, n)), name).toBeNull();
    }
    // a food that is mostly fibre stays
    expect(boardValue("fibre", product("c", "The Chia Co Black Chia Seed 453g", {}, n))).toBe(35);
  });
  it("keeps stock, broth and gravy off Fewest calories, and leaves vegetables on", () => {
    for (const name of ["Shellfish Stock 500 ml", "Chicken Stock 500 ml", "Beef Broth 500g", "Gravy 300g"]) {
      expect(boardValue("fewestKcal", product("k", name, {}, { kcal: 8, protein: 1, carbs: 0.5, fat: 0.1 })), name).toBeNull();
    }
    expect(boardValue("fewestKcal", product("w", "ASDA White Mushrooms 400g", {}, { kcal: 8, protein: 1.8, carbs: 0.4, fat: 0.5 }))).toBe(8);
  });
  it("names when the labels were read and when the prices were", () => {
    const file = (retailer: string, checkedOn: string, to: string): ShopFile => ({ v: 1, retailer, name: retailer, checkedOn, pageBase: "https://example.com/", photoBase: "https://example.com/", categories: ["Food"], schemes: [], nutritionCheckedOn: "2026-11-01", nutritionCheckedTo: to, products: [] });
    const built = buildLeaderboards([{ file: file("a", "2026-10-08", "2026-11-17"), products: [] }, { file: file("b", "2026-10-09", "2026-11-18"), products: [] }]);
    expect(built.pricesOn).toBe("2026-10-09");
    expect(built.labelsOn).toBe("2026-11-18");
  });
});

describe("the meat-free board", () => {
  it("takes protein foods by name and never a name with meat or fish, unless it says it is meat-free", async () => {
    const { isMeatFreeProteinName } = await import("../lib/mm/leaderboards");
    expect(isMeatFreeProteinName("Laila Red Split Lentils 1kg")).toBe(true);
    expect(isMeatFreeProteinName("Cauldron Organic Tofu Block 396g")).toBe(true);
    expect(isMeatFreeProteinName("Heinz Beanz with Pork Sausages 415g")).toBe(false);
    expect(isMeatFreeProteinName("Squeaky Bean Vegan Crispy Bacon 50g")).toBe(true);
    expect(isMeatFreeProteinName("Chicken Breast Fillets 300g")).toBe(false);
    expect(boardValue("meatFreeProtein", product("q", "Quorn Mince 300g", {}, { protein: 14.5, kcal: 105, carbs: 4.5, fat: 2 }))).toBe(14.5);
  });
});

describe("a board", () => {
  const lists = [
    { shop: "tesco", products: [product("t1", "Brand Biltong 100g", { gtin: "5000000000001" }, { protein: 50, kcal: 250, carbs: 6, fat: 4 }), product("t2", "Tesco Chicken Breast", {}, { protein: 24, kcal: 106 })] },
    { shop: "asda", products: [product("a1", "Brand Biltong 100g", { gtin: "5000000000001" }, { protein: 50, kcal: 250, carbs: 6, fat: 4 }), product("a2", "Lentils 500g", {}, { protein: 24, kcal: 320, carbs: 45, fat: 1 })] },
    { shop: "waitrose", products: [product("w1", "Lentils 500g", {}, { protein: 23, kcal: 320, carbs: 45, fat: 1 })] },
  ];

  it("is one row for the same product at several shops, with every shop on it, best first", () => {
    const board = buildBoard("protein", lists);
    expect(board.map((e) => e.name)).toEqual(["Brand Biltong 100g", "Lentils 500g", "Tesco Chicken Breast"]);
    expect(board[0]!.shops.map((s) => s.shop)).toEqual(["asda", "tesco"]);
    expect(board[0]!.gtin).toBe("5000000000001");
    // the same name with no barcode is the same product; its figure is the best shop's, and that shop comes first
    expect(board[1]!.value).toBe(24);
    expect(board[1]!.shops.map((s) => s.shop)).toEqual(["asda", "waitrose"]);
    expect(sameProductKey(product("x", "Lentils  500G"))).toBe(sameProductKey(product("y", "lentils 500g")));
  });

  it("ranks cheapest protein lowest first, and keeps to the board's size", () => {
    const board = buildBoard("cheapestProtein", lists);
    expect(board.every((e, i) => i === 0 || board[i - 1]!.value <= e.value)).toBe(true);
    expect(buildBoard("protein", lists, 2)).toHaveLength(2);
  });
});

describe("the same product at several shops (founder 2026-11-18: \"have the logo of the other store that also sells them\")", () => {
  const bites = (id: string, name: string, over: Partial<ShopProduct> = {}, n: Partial<ShopNutrition> | null = { protein: 59, kcal: 520, carbs: 2, fat: 30 }) => product(id, name, over, n);

  it("reads a branded name with its size as the shop lists do, never a shop's own brand", () => {
    expect(brandedNameKey("Brown & Polson 500g Cornflour")).toBe("brown and polson 500g cornflour");
    expect(brandedNameKey("Kellogg's Rice Krispies 430 Grams")).toBe("kelloggs rice krispies 430g");
    expect(brandedNameKey("Tesco Chia Seeds 150G")).toBeNull();
    expect(brandedNameKey("Sainsbury's Chia Seeds 150g")).toBeNull();
    expect(brandedNameKey("Fudco Chia Seeds")).toBeNull(); // no size: can't tell which pack
  });

  it("joins the same branded product whatever the order of its words or a plural, and puts the shops that sell it with no label last", () => {
    const lists = [
      { shop: "sainsburys", products: [bites("s1", "Mr. Porky Sharing Bag Crispy Strips 55g")] },
      { shop: "waitrose", products: [bites("w1", "Mr. Porky Crispy Strip Sharing Bag 55g", {}, { protein: 58, kcal: 520, carbs: 2, fat: 30 })] },
      { shop: "asda", products: [bites("a1", "Mr Porky Crispy Strips Sharing Bag 55g", {}, null)] },
      { shop: "tesco", products: [bites("t1", "Tesco Crispy Pork Strips 55g")] },
    ];
    const board = buildBoard("protein", lists);
    const porky = board.find((e) => /Porky/.test(e.name))!;
    expect(porky.shops.map((s) => s.shop)).toEqual(["sainsburys", "waitrose", "asda"]);
    expect(porky.value).toBe(59);
    // the shop's own brand stays its own row
    expect(board.find((e) => /Tesco/.test(e.name))!.shops.map((s) => s.shop)).toEqual(["tesco"]);
  });

  it("never joins by a name M&S gives its own range, or by a name two different barcodes share", () => {
    const groups = sameProductGroups([
      { shop: "marks-and-spencer", products: [bites("m1", "Chia Seeds 200 g")] },
      { shop: "waitrose", products: [bites("w1", "Chia Seeds 200g"), bites("w2", "Brand Bar 40g", { gtin: "5000000000011" })] },
      { shop: "asda", products: [bites("a2", "Brand Bar 40g", { gtin: "5000000000028" })] },
      { shop: "sainsburys", products: [bites("s2", "Brand Bar 40g")] },
    ]);
    expect(groups.get("marks-and-spencer|m1")).not.toBe(groups.get("waitrose|w1"));
    expect(groups.get("waitrose|w2")).not.toBe(groups.get("asda|a2"));
    expect(groups.get("sainsburys|s2")).not.toBe(groups.get("waitrose|w2"));
  });
});

describe("the published leaderboards", () => {
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;
  const lists = manifest.retailers.map((r) => {
    const file = JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")) as ShopFile;
    return { file, products: decodeShopProducts(file) };
  });
  const built = buildLeaderboards(lists);

  it("public/groceries/all/leaderboards.json matches the published shop lists", () => {
    if (process.env.WRITE_LEADERBOARDS) {
      writeFileSync(FILE, JSON.stringify(built) + "\n");
      return;
    }
    expect(existsSync(FILE), "run WRITE_LEADERBOARDS=1 npx vitest run tests/leaderboards.test.ts").toBe(true);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(built)));
  }, 300_000);

  it("has a full board of 20 for each kind, every row naming at least one shop the app has", () => {
    expect(isLeaderboardsFile(built)).toBe(true);
    for (const b of BOARDS) {
      expect(built.boards[b.id], b.id).toHaveLength(20);
      for (const e of built.boards[b.id]) for (const s of e.shops) expect(built.shops[s.shop], `${b.id} ${e.name} ${s.shop}`).toBeDefined();
    }
  }, 300_000);
});
