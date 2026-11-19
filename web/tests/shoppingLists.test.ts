import { describe, expect, it } from "vitest";
import {
  addToList, customItem, itemsOnList, knownLists, listForShop, listOf, listsForShop, MAIN_LIST, MAX_SHOPPING_LISTS, newListId, newShoppingList, nextListName,
  sameEntry, sanitizeShoppingList, sanitizeShoppingLists, setQty, swapItem, toggleDone, isListId, type ShoppingItem, type ShoppingList,
} from "../lib/mm/groceries";
import { nameWords, packLabel, shopListItem, similarProducts, type ShopProduct } from "../lib/mm/shopProducts";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../lib/mm/user-data";
import { createSyncAdapters, shoppingSyncId, SYNCED_SETTING_KEYS } from "../lib/mm/syncStores";

// More than one shopping list (founder 2026-11-18: "an option to create multiple shopping lists ... for different shops ... and multiple of the same shop
// itself") and Swap in the list (founder 2026-11-18: "they can always swap out ingredients when they're at the supermarket and they can't find something").

const NOW = new Date("2026-11-18T10:00:00.000Z");
const yogurt = { gtin: "5012345678900", retailer: "aldi", name: "Greek Style Yogurt", brand: "", size: "500 g" };
const mns: ShoppingList = { id: "abcd1234", shop: "marks-and-spencer", name: "M&S" };
const mns2: ShoppingList = { id: "efgh5678", shop: "marks-and-spencer", name: "M&S 2" };
const aldi: ShoppingList = { id: "aldi0001", shop: "aldi", name: "Aldi" };

describe("items on lists", () => {
  it("an item on the main list is kept exactly as before (no list key), and one on a list says which", () => {
    const main = addToList([], { ...yogurt, list: undefined }, NOW);
    expect("list" in main[0]!).toBe(false);
    expect(listOf(main[0]!)).toBe("");
    const onList = addToList([], { ...yogurt, list: aldi.id }, NOW);
    expect(onList[0]!.list).toBe(aldi.id);
    expect(addToList([], { ...yogurt, list: "" }, NOW)[0]).not.toHaveProperty("list");
  });

  it("the same product can be on two lists: adding raises the quantity only on its own list", () => {
    let l = addToList([], yogurt, NOW);
    l = addToList(l, { ...yogurt, list: aldi.id }, NOW);
    expect(l).toHaveLength(2);
    l = addToList(l, { ...yogurt, list: aldi.id }, NOW, 2);
    expect(l.map((i) => [listOf(i), i.qty])).toEqual([["", 1], [aldi.id, 3]]);
    expect(itemsOnList(l, aldi.id).map((i) => i.qty)).toEqual([3]);
    expect(itemsOnList(l, "").map((i) => i.qty)).toEqual([1]);
    expect(sameEntry(l[0]!, l[1]!)).toBe(false);
  });

  it("ticking and quantities change only the item on the list given (the main list when none is given)", () => {
    let l = addToList(addToList([], yogurt, NOW), { ...yogurt, list: aldi.id }, NOW);
    l = toggleDone(l, yogurt.gtin, "aldi", aldi.id);
    expect(l.map((i) => !!i.done)).toEqual([false, true]);
    l = toggleDone(l, yogurt.gtin, "aldi");
    expect(l.map((i) => !!i.done)).toEqual([true, true]);
    l = setQty(l, yogurt.gtin, "aldi", 5, aldi.id);
    expect(l.map((i) => i.qty)).toEqual([1, 5]);
    l = setQty(l, yogurt.gtin, "aldi", 0);
    expect(l.map((i) => listOf(i))).toEqual([aldi.id]);
  });

  it("a typed item goes on the list shown, and the same words on another list are another item", () => {
    const milk = customItem("Milk")!;
    let l = addToList([], milk, NOW);
    l = addToList(l, { ...milk, list: mns.id }, NOW);
    l = addToList(l, { ...milk, list: mns.id }, NOW);
    expect(l.map((i) => [listOf(i), i.qty])).toEqual([["", 1], [mns.id, 2]]);
  });

  it("the list id survives a reload; one that isn't ours is dropped and the item goes back to the main list", () => {
    const l = addToList([], { ...yogurt, list: aldi.id }, NOW);
    expect(sanitizeShoppingList(JSON.parse(JSON.stringify(l)))).toEqual(l);
    for (const bad of ["main", "x", "ABCDEFGH", "abc def1", "a".repeat(13), 12345678, { id: "abcd1234" }]) {
      const [x] = sanitizeShoppingList([{ ...l[0]!, list: bad }]);
      expect(x).not.toHaveProperty("list");
    }
  });
});

describe("Swap in the list", () => {
  const base = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({ gtin: "", shopId: "p1", retailer: "sainsburys", name: "Greek Yogurt 500g", brand: "", size: "", qty: 3, addedAt: "2026-11-01T08:00:00.000Z", price: 1.5, checkedOn: "2026-11-01", ...over });
  const to = { gtin: "", shopId: "p2", retailer: "sainsburys", name: "Greek Style Yogurt 1kg", brand: "", size: "", price: 2.1, checkedOn: "2026-11-10" };

  it("the new product takes the old one's place, with its quantity, not ticked, on the same list", () => {
    const list = [base({ shopId: "a0", name: "First" }), base({ done: true, list: mns.id }), base({ shopId: "z9", name: "Last" })];
    const out = swapItem(list, list[1]!, to);
    expect(out.map((i) => i.shopId)).toEqual(["a0", "p2", "z9"]);
    expect(out[1]).toMatchObject({ shopId: "p2", name: "Greek Style Yogurt 1kg", qty: 3, list: mns.id, price: 2.1, addedAt: "2026-11-01T08:00:00.000Z" });
    expect(out[1]!.done).toBeUndefined();
  });

  it("on the main list it stays on the main list; the same product on another list is left alone", () => {
    const list = [base(), base({ list: aldi.id })];
    const out = swapItem(list, list[0]!, to);
    expect(out[0]).not.toHaveProperty("list");
    expect(out[0]!.shopId).toBe("p2");
    expect(out[1]).toEqual(list[1]);
  });

  it("when the new product is already on that list, the quantities add up and the old row goes", () => {
    const list = [base(), { ...base({ qty: 2 }), ...to }];
    const out = swapItem(list, list[0]!, to);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ shopId: "p2", qty: 5 });
  });

  it("an item that has gone meanwhile changes nothing", () => {
    const list = [base()];
    expect(swapItem(list, base({ shopId: "gone" }), to)).toEqual(list);
  });

  it("a shop's product becomes a list item with its shelf price, the day it was read and its picture", () => {
    const file = { retailer: "sainsburys", checkedOn: "2026-11-10", photoBase: "https://assets.sainsburys-groceries.co.uk/gol/", photoTemplate: undefined };
    const p: ShopProduct = { id: "p2", name: "Yogurt", price: 2.1, unitPrice: 2.1, unit: "per kg", member: null, category: "Chilled food", photoId: "123", gtin: "", nutrition: null };
    expect(shopListItem(file, p)).toMatchObject({ gtin: "", shopId: "p2", retailer: "sainsburys", name: "Yogurt", price: 2.1, checkedOn: "2026-11-10", photo: { from: "retailer", shop: "sainsburys" } });
    expect(shopListItem(file, { ...p, price: null })).not.toHaveProperty("price", null);
  });
});

describe("similar products for Swap", () => {
  let n = 0;
  const p = (name: string, price: number | null, category = "Dairy", over: Partial<ShopProduct> = {}): ShopProduct => ({ id: `id${++n}`, name, price, unitPrice: null, unit: "", member: null, category, photoId: "", gtin: "", nutrition: null, ...over });
  const self = p("Sainsbury's Greek Style Yogurt 500g", 1.5, "Dairy", { id: "self", gtin: "05000000000001" });
  const bigger = p("Sainsbury's Greek Style Yogurt 1kg", 2.6);
  const cheaper = p("Greek Style Natural Yoghurt 450g", 1.1);
  const fruity = p("Greek Style Strawberry Yogurt 4 x 125g", 2);
  const strawberry = p("Strawberry Yogurt", 0.8);
  const noPrice = p("Greek Style Yogurt 150g", null);
  const otherAisle = p("Greek Style Yogurt Ice Cream", 3, "Frozen");
  const unrelated = p("Sainsbury's Cheddar 400g", 3);
  const products = [self, bigger, cheaper, fruity, strawberry, noPrice, otherAisle, unrelated];
  const item = { name: self.name, retailer: "sainsburys", gtin: "", shopId: "self" };

  it("the meaningful words of a name: no sizes, numbers, the shop's own name or joining words; plurals and spellings as one", () => {
    expect([...nameWords("Sainsbury's 4 x 125g Greek Style Yoghurts with Honey & Oats", "sainsburys")].sort()).toEqual(["greek", "honey", "oat", "style", "yogurt"]);
    expect([...nameWords("M&S Free Range Large Eggs 408 g", "marks-and-spencer")].sort()).toEqual(["egg", "free", "large", "range"]);
    expect([...nameWords("Tomatoes and Berries", "tesco")].sort()).toEqual(["berry", "tomato"]);
    expect([...nameWords("constructor toString", "tesco")].sort()).toEqual(["constructor", "tostring"]);
  });

  it("same category only, most shared words first, then cheaper first (no price last); never the item itself or one that shares no word", () => {
    const out = similarProducts(products, item);
    expect(out).toEqual([cheaper, fruity, bigger, noPrice, strawberry]);
    expect(out).not.toContain(self);
    expect(out).not.toContain(otherAisle);
    expect(out).not.toContain(unrelated);
  });

  it("finds the item by its barcode or its name when it has no shop id, and keeps to the limit", () => {
    expect(similarProducts(products, { name: "x", retailer: "sainsburys", gtin: "5000000000001" })).toEqual([]); // "x" has no meaningful word
    expect(similarProducts(products, { ...item, shopId: undefined, gtin: "5000000000001" })).toEqual([cheaper, fruity, bigger, noPrice, strawberry]);
    expect(similarProducts(products, { ...item, shopId: undefined })).not.toContain(self);
    expect(similarProducts(products, item, 2)).toEqual([cheaper, fruity]);
  });

  it("an item the shop's list doesn't have: every aisle counts", () => {
    const out = similarProducts(products, { name: "Greek Style Yogurt Big Tub", retailer: "sainsburys", gtin: "" });
    expect(out).toContain(otherAisle);
    expect(out[0]).toBe(cheaper);
  });

  it("the pack size from a name, as printed", () => {
    expect(packLabel("Sainsbury's Multiseed Loaf 800g")).toBe("800g");
    expect(packLabel("Greek Yogurt 4 x 125g")).toBe("4 x 125g");
    expect(packLabel("Semi Skimmed Milk 2 Pints")).toBe("2 Pints");
    expect(packLabel("Orange Juice 1.13L")).toBe("1.13L");
    expect(packLabel("Belgian Buns")).toBeNull();
  });
});

describe("the person's lists", () => {
  it("are named after the shop, then numbered (the lowest number free)", () => {
    expect(nextListName([], "M&S")).toBe("M&S");
    expect(nextListName([mns], "M&S")).toBe("M&S 2");
    expect(nextListName([mns, mns2], "M&S")).toBe("M&S 3");
    expect(nextListName([mns2], "M&S")).toBe("M&S");
    expect(nextListName([mns, { ...mns2, name: "M&S 3" }], "M&S")).toBe("M&S 2");
  });

  it("a new list has an id no other list has, and there can be at most 20", () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let k = 0;
    const id = newListId(["aaaaaaaa"], () => seq[k++ % seq.length]!);
    expect(id).not.toBe("aaaaaaaa");
    expect(isListId(id)).toBe(true);
    expect(isListId(MAIN_LIST)).toBe(false);
    const made = newShoppingList([mns], "marks-and-spencer", "M&S")!;
    expect(made).toMatchObject({ shop: "marks-and-spencer", name: "M&S 2" });
    expect(made.id).not.toBe(mns.id);
    const full = Array.from({ length: MAX_SHOPPING_LISTS }, (_, i) => ({ id: `list${String(i).padStart(4, "0")}`, shop: "aldi", name: `Aldi ${i}` }));
    expect(newShoppingList(full, "aldi", "Aldi")).toBeNull();
  });

  it("the default list for a shop is the newest one for it; none means the main list", () => {
    const settings = { shoppingLists: [mns, aldi, mns2] };
    expect(listForShop(settings, "marks-and-spencer")).toBe(mns2.id);
    expect(listForShop(settings, "aldi")).toBe(aldi.id);
    expect(listForShop(settings, "tesco")).toBeUndefined();
    expect(listForShop({}, "tesco")).toBeUndefined();
    expect(listsForShop(settings.shoppingLists, "marks-and-spencer")).toEqual([mns, mns2]);
    // what the meal plan does with it
    const l = addToList([], { ...yogurt, retailer: "marks-and-spencer", list: listForShop(settings, "marks-and-spencer") }, NOW);
    expect(l[0]!.list).toBe(mns2.id);
  });

  it("a list an item is on that the settings don't have yet is still shown, named after its shop", () => {
    const items = [{ ...yogurt, qty: 1, addedAt: NOW.toISOString(), list: "orphan01" }, { ...customItem("Milk")!, qty: 1, addedAt: NOW.toISOString(), list: "orphan02" }];
    expect(knownLists([mns], items)).toEqual([mns, { id: "orphan01", shop: "aldi", name: "Aldi" }, { id: "orphan02", shop: "own", name: "Any shop" }]);
    expect(knownLists(undefined, [])).toEqual([]);
  });

  it("are read back carefully: good ones only, each id once, names tidied, at most 20", () => {
    const raw = [mns, { ...mns, name: "dup" }, { id: "bad id", shop: "aldi", name: "x" }, { id: "good0001", shop: "Not A Shop!", name: "x" }, { id: "good0002", shop: "aldi", name: "   " },
      { id: "good0003", shop: "aldi", name: `  Aldi   ${"x".repeat(60)} ` }, null, "nope"];
    const out = sanitizeShoppingLists(raw);
    expect(out.map((l) => l.id)).toEqual([mns.id, "good0003"]);
    expect(out[1]!.name).toBe(`Aldi ${"x".repeat(35)}`);
    expect(sanitizeShoppingLists(Array.from({ length: 30 }, (_, i) => ({ id: `list${String(i).padStart(4, "0")}`, shop: "aldi", name: "A" })))).toHaveLength(MAX_SHOPPING_LISTS);
    expect(sanitizeShoppingLists("nope")).toEqual([]);
  });

  it("live in the settings, which sync them; none at all leaves the key out", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, shoppingLists: [mns, aldi] }).shoppingLists).toEqual([mns, aldi]);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, shoppingLists: [] })).not.toHaveProperty("shoppingLists");
    expect(sanitizeSettings(DEFAULT_SETTINGS)).not.toHaveProperty("shoppingLists");
    expect(SYNCED_SETTING_KEYS).toContain("shoppingLists");
  });
});

describe("syncing items on lists", () => {
  it("an item on the main list keeps the id it always had; on a list the id starts with the list", () => {
    const main: ShoppingItem = { ...yogurt, qty: 1, addedAt: NOW.toISOString() };
    expect(shoppingSyncId(main)).toBe("aldi|5012345678900");
    expect(shoppingSyncId({ ...main, list: aldi.id })).toBe(`${aldi.id}|aldi|5012345678900`);
    expect(shoppingSyncId({ ...main, gtin: "" })).toBe("");
    const adapter = createSyncAdapters({} as never).find((a) => a.name === "shopping")!;
    expect(adapter.kind).toBe("set");
    if (adapter.kind === "set") expect(adapter.id({ ...main, list: aldi.id })).toBe(`${aldi.id}|aldi|5012345678900`);
  });
});
