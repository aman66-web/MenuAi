import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { addToList, bestPhoto, itemPhotoSources, photoSources, sanitizeShoppingList, validPhoto, withPhoto, type GroceryFile, type ShoppingItem } from "../lib/mm/groceries";
import { setHiddenLogos } from "../lib/mm/logos";
import { decodeShopProducts, shopPhotoSources, type ShopFile } from "../lib/mm/shopProducts";

// The picture beside each item on the shopping list (founder 2026-10-15: "the image should be next to it too"). It is kept with the item when it is added, read
// back from this phone's storage and from the sync server, so it is checked every time: a picture from where the app's own lists get theirs, nothing else.

const STORED = { src: "/grocery-images/sainsburys/00273735fb1f.webp", from: "stored", shop: "sainsburys" } as const;
const TESCO = { src: "https://digitalcontent.api.tesco.com/v2/media/ghs/1ae5/b38866f9.jpeg?h=225&w=225", from: "retailer", shop: "tesco" } as const;
const OFF = { src: "https://images.openfoodfacts.org/images/products/501/234/567/8901/front_en.12.400.jpg", from: "off", shop: "" } as const;

describe("validPhoto", () => {
  it("accepts our stored copy, a supermarket's own picture on its own image server, and an Open Food Facts front photo", () => {
    expect(validPhoto(STORED)).toEqual(STORED);
    expect(validPhoto(TESCO)).toEqual(TESCO);
    expect(validPhoto(OFF)).toEqual(OFF);
  });

  it("refuses anything else", () => {
    const bad: unknown[] = [
      null, undefined, "https://digitalcontent.api.tesco.com/x.jpg", 42, [],
      { ...TESCO, src: "http://digitalcontent.api.tesco.com/x.jpg" }, // not https
      { ...TESCO, src: "https://evil.example/x.jpg" }, // not one of the supermarkets' image servers
      { ...TESCO, src: "https://digitalcontent.api.tesco.com.evil.example/x.jpg" },
      { ...TESCO, src: "https://digitalcontent.api.tesco.com@evil.example/x.jpg" },
      { ...TESCO, src: "https://user:pw@digitalcontent.api.tesco.com/x.jpg" },
      { ...TESCO, src: "https://digitalcontent.api.tesco.com:8443/x.jpg" },
      { ...TESCO, src: "javascript:alert(1)" },
      { ...TESCO, src: "data:image/png;base64,AAAA" },
      { ...TESCO, src: "https://digitalcontent.api.tesco.com/a b.jpg" }, // a space
      { ...TESCO, src: "https://digitalcontent.api.tesco.com/x.jpg\n" },
      { ...TESCO, src: `https://digitalcontent.api.tesco.com/${"a".repeat(500)}` }, // too long
      { ...TESCO, shop: "" },
      { ...TESCO, shop: "Tesco!" },
      { ...TESCO, src: OFF.src }, // an Open Food Facts address presented as a shop's own picture
      { ...OFF, shop: "tesco" },
      { ...OFF, src: "https://images.openfoodfacts.org/anything.jpg" },
      { ...STORED, src: "/grocery-images/sainsburys/../../secret.webp" },
      { ...STORED, src: "/grocery-images/sainsburys/NOTHEX.webp" },
      { ...STORED, shop: "tesco" }, // stored under another shop's folder
      { ...STORED, src: "https://assets.sainsburys-groceries.co.uk/gol/1/image.jpg" },
      { ...TESCO, from: "stored" },
      { ...TESCO, from: "elsewhere" },
    ];
    for (const b of bad) expect(validPhoto(b), JSON.stringify(b)).toBeNull();
  });

  it("bestPhoto and withPhoto take the first that is fit to keep", () => {
    expect(bestPhoto([{ src: "https://evil.example/x.jpg", from: "retailer", shop: "tesco" }, TESCO, STORED])).toEqual(TESCO);
    expect(bestPhoto([])).toBeUndefined();
    expect(withPhoto([STORED, TESCO])).toEqual({ photo: STORED });
    expect(withPhoto([])).toEqual({});
    expect(withPhoto([{ src: "http://x", from: "retailer", shop: "tesco" }])).toEqual({});
  });
});

const item = (over: Partial<ShoppingItem> = {}): Omit<ShoppingItem, "qty" | "addedAt"> => ({ gtin: "", shopId: "272407558", retailer: "tesco", name: "Abra Ca Debora Sweet Pancakes 6 Pack, 375 G", brand: "", size: "", ...over });

describe("a picture kept with a list item", () => {
  it("is kept by the sanitiser when it is fit to keep, and dropped (the item stays) when it isn't", () => {
    const keep = sanitizeShoppingList([{ ...item(), qty: 1, addedAt: "2026-10-15T10:00:00.000Z", photo: TESCO }]);
    expect(keep[0]?.photo).toEqual(TESCO);
    const dropped = sanitizeShoppingList([{ ...item(), qty: 1, addedAt: "2026-10-15T10:00:00.000Z", photo: { ...TESCO, src: "https://evil.example/x.jpg" } }]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).not.toHaveProperty("photo");
  });

  it("only what is fit to keep comes out of the sanitiser: no extra fields ride along inside the picture", () => {
    const [x] = sanitizeShoppingList([{ ...item(), qty: 1, photo: { ...TESCO, onerror: "alert(1)", extra: { a: 1 } } }]);
    expect(x?.photo).toEqual(TESCO);
    expect(Object.keys(x!.photo!).sort()).toEqual(["from", "shop", "src"]);
  });

  it("a typed-in item has no picture to keep", () => {
    const [x] = sanitizeShoppingList([{ gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, custom: true, photo: TESCO }]);
    expect(x?.custom).toBe(true);
    expect(x).not.toHaveProperty("photo");
  });

  it("is kept when the same product is added again, and given to an item that was added without one", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const first = addToList([], item({ photo: TESCO }), now);
    expect(first[0]?.photo).toEqual(TESCO);
    // adding it again (with or without a picture) keeps the one it has and raises the quantity
    expect(addToList(first, item(), now)[0]).toMatchObject({ qty: 2, photo: TESCO });
    expect(addToList(first, item({ photo: STORED }), now)[0]?.photo).toEqual(TESCO);
    // an older item with no picture takes the one it is added with
    const old = addToList([], item(), now);
    expect(old[0]).not.toHaveProperty("photo");
    expect(addToList(old, item({ photo: TESCO }), now)[0]).toMatchObject({ qty: 2, photo: TESCO });
    // and stays without one when there is none to give
    expect(addToList(old, item(), now)[0]).not.toHaveProperty("photo");
  });

  it("is not shown once its shop is on the taken-down list (hidden.json), and comes back when it leaves it", () => {
    afterEachReset();
    expect(itemPhotoSources({ photo: TESCO })).toEqual([TESCO]);
    expect(itemPhotoSources({})).toEqual([]);
    setHiddenLogos(["shop:tesco"]);
    expect(itemPhotoSources({ photo: TESCO })).toEqual([]);
    expect(itemPhotoSources({ photo: STORED })).toEqual([STORED]); // another shop's
    expect(itemPhotoSources({ photo: OFF })).toEqual([OFF]);
    setHiddenLogos([]);
    expect(itemPhotoSources({ photo: TESCO })).toEqual([TESCO]);
  });
});

function afterEachReset() { setHiddenLogos([]); }
afterEach(() => setHiddenLogos([]));

// Real data: every picture the app's own lists would hand to a list item must pass the check, or items from that shop would silently lose their picture.
describe("the published lists' pictures are all fit to keep", () => {
  const dir = new URL("../public/groceries/", import.meta.url);
  const shops = readdirSync(new URL("all/", dir)).filter((f) => f.endsWith(".json") && !f.includes("manifest"));

  it("every shop's full list: its own picture, and any picture borrowed from another shop or Open Food Facts", () => {
    expect(shops.length).toBeGreaterThanOrEqual(9);
    for (const f of shops) {
      const file = JSON.parse(readFileSync(new URL(`all/${f}`, dir), "utf8")) as ShopFile;
      let withPicture = 0;
      for (const p of decodeShopProducts(file)) {
        const sources = shopPhotoSources(file, p);
        if (sources.length === 0) continue;
        withPicture++;
        const kept = bestPhoto(sources);
        expect(kept, `${f} ${p.id}: ${JSON.stringify(sources[0])}`).toBeDefined();
      }
      expect(withPicture, f).toBeGreaterThan(0);
    }
  });

  it("every shop's barcode catalogue: stored copy, the shop's own picture, or the Open Food Facts front photo", () => {
    const catalogues = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes("manifest"));
    let checked = 0;
    for (const f of catalogues) {
      const file = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as GroceryFile;
      for (const p of file.products) {
        const sources = photoSources(p, file.retailer);
        if (sources.length === 0) continue;
        checked++;
        expect(bestPhoto(sources), `${f} ${p.gtin}: ${JSON.stringify(sources[0])}`).toBeDefined();
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
