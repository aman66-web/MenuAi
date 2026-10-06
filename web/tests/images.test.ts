import { describe, expect, it } from "vitest";
import { itemImageUrl } from "../lib/mm/images";

describe("itemImageUrl", () => {
  it("maps '<chain>/<file>.webp' to the public path", () => {
    expect(itemImageUrl("kfc/221a7d83d8dc.webp")).toBe("/menu-images/kfc/221a7d83d8dc.webp");
  });
  it("gives nothing when there is no photo", () => {
    expect(itemImageUrl(undefined)).toBeUndefined();
    expect(itemImageUrl("")).toBeUndefined();
  });
  it("refuses anything that is not that exact shape (no traversal, no other hosts or types)", () => {
    for (const bad of ["../x/y.webp", "kfc/../y.webp", "https://example.com/a.webp", "/kfc/a.webp", "kfc/a.png", "kfc/a.webp?x=1", "KFC/a.webp", "a/b/c.webp"]) {
      expect(itemImageUrl(bad), bad).toBeUndefined();
    }
  });
});
