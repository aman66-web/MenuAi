import { afterEach, describe, expect, it } from "vitest";
import { setHiddenLogos } from "../lib/mm/logos";
import { itemImageUrl } from "../lib/mm/images";
import { photoSources } from "../lib/mm/groceries";
import { shopPhotoSources } from "../lib/mm/shopProducts";

// "We remove anything on request without an app update" (the App Review notes): the taken-down list (public/logos/hidden.json) covers photos too.
describe("taking a company's pictures down", () => {
  afterEach(() => setHiddenLogos([]));

  it("a chain on the list loses its item photos, other chains keep theirs", () => {
    expect(itemImageUrl("kfc/abc123.webp")).toBe("/menu-images/kfc/abc123.webp");
    setHiddenLogos(["kfc"]);
    expect(itemImageUrl("kfc/abc123.webp")).toBeUndefined();
    expect(itemImageUrl("nandos/abc123.webp")).toBe("/menu-images/nandos/abc123.webp");
  });

  it("a shop on the list loses its product photos (stored and hotlinked), other shops keep theirs", () => {
    const product = { photo: "0123456789ab.webp", retailerImage: "https://shop.example/p.jpg", retailers: ["tesco", "asda"], byRetailer: { tesco: { photo: "0123456789ab.webp", retailerImage: "https://tesco.example/p.jpg" }, asda: { retailerImage: "https://asda.example/p.jpg" } } };
    expect(photoSources(product, "tesco").map((s) => s.shop)).toEqual(["tesco", "tesco", "asda"]);
    setHiddenLogos(["shop:tesco"]);
    expect(photoSources(product, "tesco").map((s) => s.shop)).toEqual(["asda"]);
  });

  it("a shop's full product list: its own picture goes, and so does another shop's picture of the same product", () => {
    const file = { retailer: "tesco", photoBase: "https://img.example/", photoTemplate: undefined };
    expect(shopPhotoSources(file, { photoId: "123" })).toHaveLength(1);
    setHiddenLogos(["shop:tesco"]);
    expect(shopPhotoSources(file, { photoId: "123" })).toEqual([]);
    expect(shopPhotoSources({ ...file, retailer: "asda" }, { photoId: "123" })).toHaveLength(1);
  });
});
