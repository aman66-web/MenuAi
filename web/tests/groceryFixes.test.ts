import { afterEach, describe, expect, it, vi } from "vitest";
import type { BarcodeHit } from "../lib/mm/barcodes";
import type { GroceryProduct } from "../lib/mm/groceries";

// The groceries fixes of the 30-person meeting (21 November 2026): a barcode lookup tells a connection problem from Open Food Facts being down, the typed entry starts
// with the name a shop list knows, and a shared list keeps the price the catalogue has.

// The app's "@/..." imports aren't resolved under vitest: point them at the real modules, and stand in for the files a test chooses.
vi.mock("@/lib/mm/addFood", () => import("../lib/mm/addFood"));
vi.mock("@/lib/mm/barcodes", () => import("../lib/mm/barcodes"));
vi.mock("@/lib/mm/config", () => import("../lib/mm/config"));
vi.mock("@/lib/mm/groceries", () => import("../lib/mm/groceries"));
vi.mock("@/lib/mm/shopProducts", () => import("../lib/mm/shopProducts"));
vi.mock("@/lib/mm/i18n", () => import("../lib/mm/i18n"));
const files = vi.hoisted(() => ({
  hit: null as BarcodeHit | null,
  shop: { file: { retailer: "tesco", photoBase: "", photoTemplate: "" }, products: [] as Array<{ id: string; name: string; nutrition: null }> },
}));
vi.mock("../app/app/_lib/shopProducts", () => ({
  findBarcode: async () => files.hit,
  loadShopFile: async () => files.shop,
  loadShopManifest: async () => ({ v: 1, retailers: [] }),
}));
vi.mock("../app/app/_lib/groceries", () => ({ loadRetailer: async () => { throw new Error("no catalogue here"); } }));
const { lookupBarcodeEverywhere, lookupOpenFoodFacts } = await import("../app/app/_components/addfood/findByBarcode");
const { catalogueItem } = await import("../app/app/_lib/sharedList");

const BEANS = "5000168001142"; // a whole EAN-13 (its check digit right)
const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  files.hit = null;
  files.shop.products = [];
});

describe("a barcode Open Food Facts couldn't be asked about (Grace)", () => {
  it("is our server's answer, not the connection, when Open Food Facts is down or our server is busy", async () => {
    vi.stubGlobal("fetch", reply(502));
    expect(await lookupOpenFoodFacts(BEANS, "x")).toEqual({ status: "error", offline: false });
    vi.stubGlobal("fetch", reply(503));
    expect(await lookupOpenFoodFacts(BEANS, "x")).toEqual({ status: "error", offline: false });
  });

  it("is the connection only when the phone couldn't reach us", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Load failed"); }));
    expect(await lookupOpenFoodFacts(BEANS, "x")).toEqual({ status: "error", offline: true });
  });

  it("never asks about a number whose check digit is wrong: it is the calm 'We don't have this one yet'", async () => {
    const asked = reply(200, { found: false });
    vi.stubGlobal("fetch", asked);
    expect(await lookupOpenFoodFacts("5000168001141", "x")).toEqual({ status: "missing", name: "" });
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("a scanned barcode a shop list holds with no label (Grace)", () => {
  it("starts 'Type the numbers from the pack' with the shop list's name when Open Food Facts knows none", async () => {
    files.hit = { code: BEANS, shops: [{ shop: "tesco", id: "beans-1", label: "none" }], catalogue: [] };
    files.shop.products = [{ id: "beans-1", name: "Tesco Baked Beans 420g", nutrition: null }];
    vi.stubGlobal("fetch", reply(200, { found: false }));
    expect(await lookupBarcodeEverywhere(BEANS, [], "Barcode")).toEqual({ status: "missing", name: "Tesco Baked Beans 420g" });
  });
});

describe("a shared list's catalogue product (Leo, Maya)", () => {
  it("keeps the shelf price that shop's list shows and the day it was read", () => {
    const p = { gtin: BEANS, name: "Baked Beans", brand: "Heinz", size: "415g", category: "", per: "g", kcal: 78, protein: 4.7, carbs: 12.9, fat: 0.2, allergens: null, price: { amount: 1.4, url: "https://example.org", checkedOn: "2026-11-18" } } as GroceryProduct;
    expect(catalogueItem("tesco", p)).toMatchObject({ gtin: BEANS, retailer: "tesco", price: 1.4, checkedOn: "2026-11-18" });
    const { price: _price, ...unpriced } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(catalogueItem("tesco", unpriced)).not.toHaveProperty("price");
  });
});
