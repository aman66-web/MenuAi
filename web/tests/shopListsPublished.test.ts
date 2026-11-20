import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeShopProducts, isShopFile, shopPageUrl, shopPhotoUrl, type ShopFile, type ShopManifest } from "../lib/mm/shopProducts";

// The REAL published "every product" files (public/groceries/all, built by tools/groceries/build_all_products.py). These checks are about what the app
// is given to show, so they fail if a rebuild ever breaks a rule the app and the founder rely on: no price is invented for a shop that prints none,
// every product has its own id, M&S's everyday range opens its own product page and shows its own picture, and each file is the one its manifest names.
const DIR = "public/groceries/all";
const manifest = JSON.parse(readFileSync(`${DIR}/all-manifest.json`, "utf8")) as ShopManifest;
const text = (file: string) => readFileSync(`${DIR}/${file}`, "utf8");
const load = (id: string): ShopFile => JSON.parse(text(`${id}.json`)) as ShopFile;

describe("published every-product files", () => {
  it("each file is the one its manifest entry names (count and sha256), and has the shape the app reads", () => {
    expect(manifest.retailers.length).toBeGreaterThanOrEqual(9);
    for (const r of manifest.retailers) {
      const raw = text(r.file);
      const f = JSON.parse(raw) as ShopFile;
      expect(createHash("sha256").update(raw).digest("hex"), r.id).toBe(r.sha256);
      expect(f.products.length, r.id).toBe(r.count);
      expect(isShopFile(f), r.id).toBe(true);
      expect(decodeShopProducts(f).length, `${r.id}: every row decodes`).toBe(f.products.length);
      expect(r.priced ?? r.count, r.id).toBe(f.products.filter((p) => p[2] !== null).length);
    }
  });

  it("only Lidl and M&S list products without a price, and no product id is listed twice in a shop", () => {
    for (const r of manifest.retailers) {
      const f = load(r.id);
      const unpriced = f.products.filter((p) => p[2] === null).length;
      if (r.id === "lidl" || r.id === "marks-and-spencer") expect(unpriced, r.id).toBeGreaterThan(0);
      else expect(unpriced, `${r.id} must show a price for every product`).toBe(0);
      expect(new Set(f.products.map((p) => p[0])).size, `${r.id}: ids are unique`).toBe(f.products.length);
    }
  });
});

describe("M&S: the everyday food range, whose aisle lists show no price (founder 2026-10-16)", () => {
  const f = load("marks-and-spencer");
  const unpriced = f.products.filter((p) => p[2] === null);
  const priced = f.products.filter((p) => p[2] !== null);

  it("the file says where the pages are and why a row has no price", () => {
    expect(f.pageRoot).toBe("https://www.marksandspencer.com/food/");
    expect(f.priceNote).toBe("stores");
    expect(f.pageSearch).toBe(true); // the priced rows (food to order, gifts) still open M&S's search
    expect(f.photoTemplate).toBe("https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/{photo}");
  });

  // Founder 2026-11-18 ("Yes for M&S do that for me"): the everyday range is priced at one store chosen on M&S's own site (M&S Marble Arch,
  // tools/groceries/mns_prices_chrome.py); a product that store doesn't sell keeps no price. Labels read from M&S's own product pages may be on either kind.
  it("a row the chosen store doesn't price has no price, unit or card price and no barcode (nothing is invented), and always has its own page", () => {
    expect(unpriced.length).toBeGreaterThan(100);
    for (const p of unpriced) {
      expect(p.slice(2, 4).concat([p[5], p[6]]), p[0]).toEqual([null, null, null, null]);
      expect(p[9], p[0]).toBe("");
      expect(p[11], `${p[0]} has its own page`).toMatch(/^[a-z0-9\-_.%]+\/p\/fdp\d+$/);
      expect(p[11]!.endsWith(`/${p[0]}`), p[0]).toBe(true);
      expect(p[0]).toMatch(/^fdp\d{6,10}$/);
    }
  });

  it("the store-priced range opens its own page; the food to order, gifts and Christmas rows keep their price and their search link", () => {
    const own = priced.filter((p) => p[11]);
    const ordered = priced.filter((p) => !p[11]);
    expect(own.length).toBeGreaterThan(4000);
    expect(ordered.length).toBe(194);
    for (const p of decodeShopProducts({ ...f, products: own })) {
      expect(p.price).toBeGreaterThan(0);
      expect(shopPageUrl(f, p), p.id).toMatch(/^https:\/\/www\.marksandspencer\.com\/food\/.+\/p\/fdp\d+$/);
    }
    for (const p of decodeShopProducts({ ...f, products: ordered })) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.page, p.id).toBe("");
      expect(shopPageUrl(f, p)).toMatch(/^https:\/\/www\.marksandspencer\.com\/search\?searchTerm=/);
    }
  });

  it("every unpriced row opens a product page under /food/ and shows a picture on M&S's own image server", () => {
    const ps = decodeShopProducts({ ...f, products: unpriced });
    expect(ps.length).toBe(unpriced.length);
    for (const p of ps) {
      expect(shopPageUrl(f, p), p.id).toMatch(/^https:\/\/www\.marksandspencer\.com\/food\/[a-z0-9\-_.%]+\/p\/fdp\d+$/);
      expect(p.photoId, `${p.id}: a picture id`).toMatch(/^[0-9a-f]{32}\.jpg$/);
      expect(shopPhotoUrl(f, p), p.id).toBe(`https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/${p.photoId}`);
    }
    for (const p of f.products) expect(p[8], p[0]).toMatch(/^(?:[0-9a-f]{32}\.jpg|[A-Za-z0-9_]{6,80})$/);
  });

  it("no picture is shared by two products (a shared one would be a placeholder)", () => {
    const pics = f.products.map((p) => p[8]).filter(Boolean);
    expect(new Set(pics).size).toBe(pics.length);
  });

  it("no alcoholic drink is listed (founder 2026-10-11)", () => {
    const alcohol = /\b(?:prosecco|champagne|vodka|whisk(?:e)?y|gin and|martini|cocktails?|rum|brandy|lager|beer|wine|cider|sparkling wine)\b/i;
    const drinkSize = /\b\d+(?:\.\d+)?\s?cl\b|\b(?:75|70|1000)\s?(?:cl|ml)\b|\b1\s?l\b/i;
    // food that only names a drink, and soft drinks M&S files in its Soft Drinks aisle: kombucha (a 75 cl bottle looks like wine but is sold as a soft drink), ginger beer
    const food = /vinegar|gums?|batter(?:ed)?|sauce|chutney|marmalade|truffles?|chocolate|cake|trifle|kombucha|kefir|ginger beer/i;
    const hits = unpriced.map((p) => p[1]).filter((n) => !food.test(n) && ((alcohol.test(n) && drinkSize.test(n)) || /\b\d+\s?cl\b/i.test(n)));
    expect(hits).toEqual([]);
  });

  it("the aisle names are M&S's own, in the order they were first listed, after the priced rows' three", () => {
    expect(f.categories.slice(0, 3)).toEqual(["Food to order", "Food & drink gifts", "Christmas food to order"]);
    expect(f.categories).toContain("Food Cupboard");
    expect(f.categories).not.toContain("Alcoholic Drinks");
    expect(f.categories.some((c) => /wine|beer|spirit|alcohol|household|pet/i.test(c))).toBe(false);
  });
});

describe("the barcode index and the numbers' sources (2026-11-20)", () => {
  const barcodes = JSON.parse(text("barcodes.json")) as { v: 1; shops: string[]; codes: Record<string, Array<[number, string, number]>>; catalogue: { shops: string[]; codes: Record<string, number[]> } };

  it("barcodes.json holds every barcode in every shop list, pointing at its own row", () => {
    let n = 0;
    for (const r of manifest.retailers) {
      const f = load(r.id);
      const at = barcodes.shops.indexOf(r.id);
      expect(at, r.id).toBeGreaterThanOrEqual(0);
      for (const p of f.products) {
        if (!p[9]) continue;
        const code = p[9].replace(/^0+/, "");
        expect(barcodes.codes[code]?.some(([i, id]) => i === at && id === p[0]), `${r.id} ${p[0]} ${code}`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(10_000);
  });

  it("every unit price is per kg, per litre or each (M&S printed a bare 'kg')", () => {
    for (const r of manifest.retailers) for (const p of load(r.id).products) expect(["per kg", "per litre", "each", ""], `${r.id} ${p[0]} ${p[4]}`).toContain(p[4]);
  });

  it("government produce figures are only on fresh produce: never in a frozen or cupboard aisle, never a tin, jar or frozen bag", () => {
    for (const r of manifest.retailers) {
      const f = load(r.id);
      for (const p of f.products) {
        const n = p[10];
        if (!n || n[11] !== "cofid") continue;
        const aisle = f.categories[p[7]] ?? "";
        expect(aisle, `${r.id} ${p[1]}`).not.toMatch(/frozen|cupboard|drinks|bakery/i);
        expect(p[1], `${r.id} ${p[1]}`).not.toMatch(/\b(?:tin|tins|tinned|canned|chopped tomato(?:es)?|frozen|in oil|puree|paste|jar)\b/i);
      }
    }
  });
});
