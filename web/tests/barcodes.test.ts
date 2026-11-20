import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { amountChoices, loggableFromShop, startAmount } from "../lib/mm/addFood";
import { barcodeCandidates, barcodeShown, isBarcodeFile, labelledHits, lookupBarcode, normaliseBarcode, sameBarcode, scanHref, scanTarget, shopItemHref, upcEToA, type BarcodeFile } from "../lib/mm/barcodes";
import { decodeShopProducts, type ShopFile, type ShopManifest } from "../lib/mm/shopProducts";

// Scan a barcode, see the product (founder 2026-11-20). lib/mm/barcodes.ts reads public/groceries/all/barcodes.json (tools/groceries/build_all_products.py).

describe("a barcode as typed or read", () => {
  it("is its digits with the leading zeros stripped: EAN-13, its GTIN-14 form and a 12-digit UPC-A are one number", () => {
    expect(normaliseBarcode("5063089019924")).toBe("5063089019924");
    expect(normaliseBarcode(" 5063 0890-19924 ")).toBe("5063089019924");
    expect(normaliseBarcode("05063089019924")).toBe("5063089019924");
    expect(normaliseBarcode("012345678905")).toBe("12345678905");
    expect(normaliseBarcode("0012345678905")).toBe("12345678905");
    expect(normaliseBarcode("96385074")).toBe("96385074"); // EAN-8
    expect(normaliseBarcode("1234567")).toBeNull(); // too short
    expect(normaliseBarcode("baked beans")).toBeNull();
    expect(normaliseBarcode("123456789012345")).toBeNull(); // too long
  });

  it("reads a UPC-E code as its UPC-A, only with a right check digit", () => {
    expect(upcEToA("04252614")).toBe("042100005264");
    expect(upcEToA("04252615")).toBeNull(); // wrong check digit
    expect(upcEToA("54252614")).toBeNull(); // number system 5 isn't UPC-E
    expect(barcodeCandidates("04252614")).toEqual(["4252614", "42100005264"]);
    expect(barcodeCandidates("5063089019924")).toEqual(["5063089019924"]);
    expect(barcodeCandidates("nope")).toEqual([]);
  });
});

describe("looking a barcode up", () => {
  const file: BarcodeFile = {
    v: 1,
    shops: ["sainsburys", "asda", "tesco"],
    codes: {
      "5000000000001": [[0, "sainsburys-thing", 1], [1, "111", 2], [2, "222", 0]],
      "5000000000002": [[1, "333", 3]],
      "42100005264": [[2, "444", 1]],
    },
    catalogue: { shops: ["tesco", "asda"], codes: { "5000000000001": [0, 1], "5000000000099": [1] } },
  };

  it("finds every shop's row, the person's own shops first in their order, then the file's", () => {
    const hit = lookupBarcode(file, "05000000000001", ["tesco", "asda"])!;
    expect(hit.code).toBe("5000000000001");
    expect(hit.shops.map((h) => h.shop)).toEqual(["tesco", "asda", "sainsburys"]);
    expect(hit.shops.map((h) => h.label)).toEqual(["none", "same", "own"]);
    expect(hit.catalogue).toEqual(["tesco", "asda"]);
    expect(scanTarget(hit)).toEqual({ shop: "tesco", id: "222", label: "none" });
    expect(lookupBarcode(file, "5000000000001")!.shops[0]!.shop).toBe("sainsburys");
  });

  it("gives the rows whose numbers are a shop's label, own labels first and the asked-for shop first among them", () => {
    const hit = lookupBarcode(file, "5000000000001")!;
    expect(labelledHits(hit).map((h) => h.shop)).toEqual(["sainsburys", "asda"]);
    expect(labelledHits(lookupBarcode(file, "5000000000002")!)).toEqual([]); // community numbers never count as a label
  });

  it("finds a catalogue-only barcode, a UPC-E scan of a full code, and nothing for an unknown one", () => {
    expect(lookupBarcode(file, "5000000000099")).toEqual({ code: "5000000000099", shops: [], catalogue: ["asda"] });
    expect(lookupBarcode(file, "04252614")!.shops).toEqual([{ shop: "tesco", id: "444", label: "own" }]);
    expect(lookupBarcode(file, "5000000000123")).toBeNull();
    expect(lookupBarcode(file, "hello")).toBeNull();
  });

  it("opens a shop product's page in the app", () => {
    expect(shopItemHref({ shop: "marks-and-spencer", id: "fdp 1" })).toBe("/app/groceries/shop/item?r=marks-and-spencer&id=fdp%201");
  });
});

describe("a scan opens the Groceries product page with the digits as printed (2026-11-20: 01318180 sent as 1318180 said \"We don't have it yet\")", () => {
  it("keeps the leading zeros in the link", () => {
    expect(scanHref("01318180")).toBe("/app/groceries/product?code=01318180&scan=1");
    expect(scanHref(" 0131-8180 ")).toBe("/app/groceries/product?code=01318180&scan=1");
    expect(scanHref("5063089019924")).toBe("/app/groceries/product?code=5063089019924&scan=1");
    expect(scanHref("1318180")).toBeNull(); // 7 digits isn't a barcode
    expect(scanHref("rice krispies")).toBeNull();
  });

  it("compares a record's GTIN with the barcode without leading zeros, and never matches an empty one", () => {
    expect(sameBarcode("01318180", "1318180")).toBe(true);
    expect(sameBarcode("01318180", "01318180")).toBe(true);
    expect(sameBarcode("0012345678905", "12345678905")).toBe(true);
    expect(sameBarcode("01318180", "1318181")).toBe(false);
    expect(sameBarcode("0000", "0")).toBe(false);
    expect(sameBarcode("", "")).toBe(false);
  });
});

describe("the published barcode index", () => {
  const raw = JSON.parse(readFileSync("public/groceries/all/barcodes.json", "utf8")) as unknown;
  const manifest = JSON.parse(readFileSync("public/groceries/all/all-manifest.json", "utf8")) as ShopManifest;

  it("is valid", () => {
    expect(isBarcodeFile(raw)).toBe(true);
  });
  const file = raw as BarcodeFile;

  it("resolves every barcode in every shop list to that row (the example the founder's request was found with among them)", () => {
    for (const r of manifest.retailers) {
      const f = JSON.parse(readFileSync(`public/groceries/all/${r.file}`, "utf8")) as ShopFile;
      for (const p of f.products) {
        if (!p[9]) continue;
        const hit = lookupBarcode(file, p[9]);
        expect(hit?.shops.some((h) => h.shop === r.id && h.id === p[0]), `${r.id} ${p[0]} ${p[9]}`).toBe(true);
      }
    }
    // ASDA British Milk Semi Skimmed 2 L, with Asda's own label (2026-11-20: "That barcode isn't in our list yet")
    const milk = lookupBarcode(file, "5063089019924")!;
    expect(milk.shops.some((h) => h.shop === "asda" && h.label !== "none")).toBe(true);
  });

  it("resolves every barcode in the older catalogue to the files that hold it", () => {
    const cat = JSON.parse(readFileSync("public/groceries/groceries-manifest.json", "utf8")) as { retailers: Array<{ id: string; file: string; count: number }> };
    for (const r of cat.retailers.filter((x) => x.count > 0)) {
      const f = JSON.parse(readFileSync(`public/groceries/${r.file}`, "utf8")) as { products: Array<{ gtin: string }> };
      for (const p of f.products) {
        const hit = lookupBarcode(file, p.gtin);
        expect(hit?.catalogue, `${r.id} ${p.gtin}`).toContain(r.id);
      }
    }
  });

  it("finds the design review's 01318180 (Sainsbury's Multiseed Wholemeal Farmhouse Loaf) by its 8 digits, even from a link that lost the leading zero", () => {
    // the stripped form the page used to look up is too short to be a barcode: that was the bug
    expect(lookupBarcode(file, "1318180")).toBeNull();
    for (const asked of ["01318180", barcodeShown("1318180")]) {
      const hit = lookupBarcode(file, asked);
      expect(hit?.code, asked).toBe("1318180");
      expect(hit?.catalogue).toContain("sainsburys");
    }
    const sainsburys = JSON.parse(readFileSync("public/groceries/sainsburys.json", "utf8")) as { products: Array<{ gtin: string; name: string }> };
    const loaf = sainsburys.products.find((p) => sameBarcode(p.gtin, "1318180"));
    expect(loaf?.name).toBe("Multiseed Wholemeal Farmhouse Loaf");
  });

  it("offers the 100 ml amount for Asda's 2 L semi-skimmed milk, which prints no portion and is too big a pack for a whole-pack amount", () => {
    const at = file.shops.indexOf("asda");
    const row = (file.codes["5063089019924"] ?? []).find(([i]) => i === at)!;
    const f = JSON.parse(readFileSync("public/groceries/all/asda.json", "utf8")) as ShopFile;
    const milk = loggableFromShop(f, decodeShopProducts(f).find((p) => p.id === row[1])!)!;
    expect(milk.per).toBe("ml");
    expect(amountChoices(milk)).toContainEqual({ kind: "hundred", amount: 100 });
    expect(startAmount(milk)).toBe(100);
  });

  it("puts the person's own shop first for a product several shops sell", () => {
    const [code, rows] = Object.entries(file.codes).find(([, rows]) => new Set(rows.map(([i]) => i)).size > 1)!;
    const second = file.shops[rows.find(([i]) => i !== rows[0]![0])![0]]!;
    expect(lookupBarcode(file, code, [second])!.shops[0]!.shop).toBe(second);
  });
});
