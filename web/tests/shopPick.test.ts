import { describe, expect, it } from "vitest";
import { MAX_PICKED_SHOPS, parseShops, pickedShopsHref, toggleShop } from "../lib/mm/shopPick";

describe("picking several shops", () => {
  it("reads shop ids from the address: valid ones only, each once, in order", () => {
    expect(parseShops("tesco,asda")).toEqual(["tesco", "asda"]);
    expect(parseShops("tesco,tesco, asda ,")).toEqual(["tesco", "asda"]);
    expect(parseShops("Tesco,a,../../x,asda<script>,marks-and-spencer")).toEqual(["marks-and-spencer"]);
    expect(parseShops("")).toEqual([]);
    expect(parseShops(null)).toEqual([]);
    expect(parseShops(Array.from({ length: 40 }, (_, i) => `shop-${i}`).join(",")).length).toBe(MAX_PICKED_SHOPS);
  });
  it("toggles a shop on and off, keeping the order they were ticked in", () => {
    expect(toggleShop([], "tesco")).toEqual(["tesco"]);
    expect(toggleShop(["tesco"], "asda")).toEqual(["tesco", "asda"]);
    expect(toggleShop(["tesco", "asda"], "tesco")).toEqual(["asda"]);
    expect(toggleShop(["tesco"], "NOT valid")).toEqual(["tesco"]);
  });
  it("Go opens one shop's own list, or the shops together", () => {
    expect(pickedShopsHref([])).toBe("/app/groceries");
    expect(pickedShopsHref(["lidl"])).toBe("/app/groceries/shop?r=lidl");
    expect(pickedShopsHref(["tesco", "asda", "aldi"])).toBe("/app/groceries/shops?r=tesco,asda,aldi");
    expect(pickedShopsHref(["tesco", "tesco"])).toBe("/app/groceries/shop?r=tesco");
  });
});
