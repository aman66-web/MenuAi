import { describe, expect, it } from "vitest";
import { ALL_SHOPS, readSearchChoice, readShopListChoice, searchChanges, shopListChanges, shownOf, SHOWN_KEY, stateForAddress, withParams, withShown } from "../app/app/groceries/addressState";
import { undoClear, undoRemove } from "../app/app/groceries/list/undo";
import { MAX_SHOPPING_ITEMS, setQty, type ShoppingItem } from "../lib/mm/groceries";
import { DEPTH_KEY, QUERY_KEY } from "../lib/mm/navDepth";

// Shopping list Undo (Clear, "−" at 1) and what a shop's list / "Search every shop" keep for Back (code audit 2026-10-29).

const iso = "2026-10-15T10:00:00.000Z";
const a: ShoppingItem = { gtin: "5030039010492", retailer: "asda", name: "Keema", brand: "", size: "", qty: 2, addedAt: iso, price: 5.99, checkedOn: "2026-10-08", photo: { src: "https://asdagroceries.scene7.com/is/image/Asda/5030039010492", from: "retailer", shop: "asda" } };
const b: ShoppingItem = { gtin: "", shopId: "272407558", retailer: "tesco", name: "Pancakes", brand: "", size: "", qty: 1, addedAt: iso, done: true };
const c: ShoppingItem = { gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: iso, custom: true };
const params = (s: string) => { const q = new URLSearchParams(s); return (k: string) => q.get(k); };

describe("undoClear", () => {
  it("puts the list back exactly: same items, order, ticks, quantities, pictures", () => {
    const before = [a, b, c];
    const back = undoClear([], before);
    expect(back).toEqual(before);
    expect(back[0]).toBe(a); // the very same objects, nothing rebuilt
  });
  it("keeps what was added after the clear, after the old list", () => {
    const eggs: ShoppingItem = { ...c, name: "Eggs" };
    expect(undoClear([eggs], [a, b])).toEqual([a, b, eggs]);
  });
  it("an old item added again meanwhile comes back as it was before the clear (not twice)", () => {
    const again = { ...a, qty: 1, done: undefined };
    const back = undoClear([again], [a, b]);
    expect(back).toEqual([a, b]);
  });
  it("never goes over the list's limit", () => {
    const many = Array.from({ length: MAX_SHOPPING_ITEMS }, (_, i) => ({ ...c, name: `Thing ${i}` }));
    expect(undoClear([{ ...c, name: "One more" }], many)).toHaveLength(MAX_SHOPPING_ITEMS);
  });
});

describe("undoRemove", () => {
  it("puts an item \"−\" removed back at its place", () => {
    const list = [a, b, c];
    const after = setQty(list, "272407558", "tesco", 0);
    expect(after).toEqual([a, c]);
    expect(undoRemove(after, b, 1)).toEqual(list);
    expect(undoRemove(setQty(list, a.gtin, "asda", 0), a, 0)).toEqual(list);
  });
  it("at the end when the list has since been shortened; unchanged when it is already back or the list is full", () => {
    expect(undoRemove([], b, 1)).toEqual([b]);
    expect(undoRemove([a, b], b, 0)).toEqual([a, b]);
    const full = Array.from({ length: MAX_SHOPPING_ITEMS }, (_, i) => ({ ...c, name: `Thing ${i}` }));
    expect(undoRemove(full, b, 0)).toHaveLength(MAX_SHOPPING_ITEMS);
    expect(undoRemove([a, c], b, -4)).toEqual([b, a, c]);
  });
  it("the same product at another shop is a different item", () => {
    const atTesco = { ...a, retailer: "tesco" };
    expect(undoRemove([atTesco], a, 0)).toEqual([a, atTesco]);
  });
});

describe("a shop's list in the address", () => {
  it("reads the defaults from a plain address", () => {
    expect(readShopListChoice(params("r=tesco"))).toEqual({ aisle: null, sort: "name", card: false, nutrition: false, dietOn: true });
  });
  it("reads aisle, sort and chips; nonsense is the default", () => {
    expect(readShopListChoice(params("r=tesco&aisle=Fruit+%26+Vegetables&sort=price&card=1&nutrition=1&diet=off"))).toEqual({ aisle: "Fruit & Vegetables", sort: "price", card: true, nutrition: true, dietOn: false });
    expect(readShopListChoice(params(`aisle=${"x".repeat(200)}&sort=cheapest&card=yes&nutrition=true&diet=no`))).toEqual({ aisle: null, sort: "name", card: false, nutrition: false, dietOn: true });
    expect(readShopListChoice(params("aisle=%0Aevil")).aisle).toBe("evil"); // trimmed like any typed words
    expect(readShopListChoice(params("aisle=a%01b")).aisle).toBeNull();
  });
  it("writes only what differs from the default, and keeps the shop", () => {
    expect(withParams("?r=tesco", shopListChanges({ aisle: "Bakery", sort: "unit", card: true }))).toBe("?r=tesco&aisle=Bakery&sort=unit&card=1");
    expect(withParams("?r=tesco&aisle=Bakery&sort=unit&card=1", shopListChanges({ aisle: null, sort: "name", card: false }))).toBe("?r=tesco");
    expect(withParams("?r=tesco", shopListChanges({ dietOn: false, nutrition: true }))).toBe("?r=tesco&nutrition=1&diet=off");
    expect(withParams("?r=tesco&diet=off", shopListChanges({ dietOn: true }))).toBe("?r=tesco");
    expect(withParams("", {})).toBe("");
  });
  it("round-trips every sort and an aisle with symbols", () => {
    for (const sort of ["name", "price", "priceDesc", "unit", "density", "protein"] as const) {
      const choice = { aisle: "Beer, Wine & Spirits", sort, card: true, nutrition: false, dietOn: false };
      expect(readShopListChoice(params(withParams("?r=lidl", shopListChanges(choice))))).toEqual(choice);
    }
  });
});

describe("Search every shop in the address", () => {
  it("tells \"not chosen\" (the person's own shop) apart from an explicit All", () => {
    expect(readSearchChoice(params("")).shop).toBeUndefined();
    expect(readSearchChoice(params(`r=${ALL_SHOPS}`)).shop).toBeNull();
    expect(readSearchChoice(params("r=tesco")).shop).toBe("tesco");
    expect(readSearchChoice(params("r=nowhere")).shop).toBeUndefined();
  });
  it("reads type, sort and diet; nonsense is the default", () => {
    expect(readSearchChoice(params("r=aldi&type=dairy-eggs&sort=kcal&diet=off"))).toEqual({ shop: "aldi", type: "dairy-eggs", sort: "kcal", dietOn: false });
    expect(readSearchChoice(params("type=Dairy+Eggs&sort=price"))).toEqual({ shop: undefined, type: null, sort: "density", dietOn: true });
  });
  it("writes All as r=all and a default sort as nothing", () => {
    expect(withParams("", searchChanges({ shop: null }))).toBe("?r=all");
    expect(withParams("?r=all", searchChanges({ shop: "tesco", type: "meat", sort: "name" }))).toBe("?r=tesco&type=meat&sort=name");
    expect(withParams("?r=tesco&type=meat&sort=name", searchChanges({ type: null, sort: "density", dietOn: false }))).toBe("?r=tesco&diet=off");
  });
});

describe("history.state for an address change and for Show more", () => {
  const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 }, [DEPTH_KEY]: 3, [QUERY_KEY]: "greek", [SHOWN_KEY]: 120 };
  it("an address change keeps the entry's own keys and leaves Next.js's out (it copies them back itself)", () => {
    expect(stateForAddress(next)).toEqual({ [DEPTH_KEY]: 3, [QUERY_KEY]: "greek", [SHOWN_KEY]: 120 });
    expect(stateForAddress(null)).toEqual({});
    expect(stateForAddress("x")).toEqual({});
  });
  it("the shown count is read back only when it is a whole number above one page", () => {
    expect(shownOf(next, 60)).toBe(120);
    for (const bad of [null, {}, { [SHOWN_KEY]: "120" }, { [SHOWN_KEY]: 12.5 }, { [SHOWN_KEY]: 30 }, { [SHOWN_KEY]: 1e9 }]) expect(shownOf(bad, 60)).toBe(60);
  });
  it("saving the shown count keeps every other key; back to one page removes it", () => {
    expect(withShown(next, 180, 60)).toEqual({ ...next, [SHOWN_KEY]: 180 });
    expect(withShown(next, 60, 60)).toEqual({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 }, [DEPTH_KEY]: 3, [QUERY_KEY]: "greek" });
    expect(withShown(null, 120, 60)).toEqual({ [SHOWN_KEY]: 120 });
  });
});
