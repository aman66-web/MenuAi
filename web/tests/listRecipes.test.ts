import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { addToList, customItem, CUSTOM_RETAILER, itemCode, listAsText, sanitizeShoppingList, setQty, toggleDone, withoutDone, type ShoppingItem, type ShoppingList } from "../lib/mm/groceries";
import { nextToBuy, recipesFromList, withoutWhatTheyHave } from "../lib/mm/listRecipes";
import { RECIPES } from "../lib/mm/recipeBook";
import { nameFits, recipeForDiet, resolveRecipe, type Recipe } from "../lib/mm/recipes";
import { PANTRY } from "../lib/mm/pantry";
import { decodeShopProducts, shopPhotoSources, tagShopProducts, type ShopFile } from "../lib/mm/shopProducts";
import { sanitizeRecipeSaves } from "../lib/mm/user-data";

// The app's "@/..." imports aren't resolved under vitest: point them at the real modules, and stub the hooks and stores the pure functions don't use.
vi.mock("@/lib/mm/groceries", () => import("../lib/mm/groceries"));
vi.mock("@/lib/mm/listRecipes", () => import("../lib/mm/listRecipes"));
vi.mock("@/lib/mm/recipeBook", () => import("../lib/mm/recipeBook"));
vi.mock("@/lib/mm/recipes", () => import("../lib/mm/recipes"));
vi.mock("@/lib/mm/shopProducts", () => import("../lib/mm/shopProducts"));
vi.mock("@/lib/mm/i18n", () => import("../lib/mm/i18n"));
vi.mock("@/lib/mm/stores", () => ({ shoppingStore: { get: () => [], update: () => undefined } }));
vi.mock("../app/app/_lib/hooks", () => ({ useSettings: () => ({}) }));
vi.mock("../app/app/_lib/recipes", () => ({ recipeShopSetFor: () => [], useRecipeShopSet: () => ({ status: "loading" }) }));
vi.mock("../app/app/_lib/shopProducts", () => ({ useShopManifest: () => null }));
const { recipesFromShopSet, missingItems, fileForProduct, withOwnPhotos, addedNote, placeItems, targetList, coverKey, coverItems } = await import("../app/app/_lib/listRecipes");

const sainsburysFile = JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")) as ShopFile;
const morrisonsFile = JSON.parse(readFileSync("public/groceries/all/morrisons.json", "utf8")) as ShopFile;
const products = decodeShopProducts(sainsburysFile);
const morrisons = decodeShopProducts(morrisonsFile);
const curry = RECIPES.find((r) => r.id === "chicken-curry")!;

describe("shopping list: typed-in items and ticking off", () => {
  it("a typed item is tidied, has its own code, and adding it again raises the quantity", () => {
    expect(customItem("   ")).toBeNull();
    expect(customItem("!!")).toBeNull();
    const milk = customItem("  Semi   skimmed milk ")!;
    expect(milk).toMatchObject({ name: "Semi skimmed milk", retailer: CUSTOM_RETAILER, custom: true, gtin: "" });
    let list = addToList([], milk);
    list = addToList(list, customItem("semi skimmed MILK")!);
    expect(list).toHaveLength(1);
    expect(list[0]!.qty).toBe(2);
    expect(itemCode(list[0]!)).toBe("own:semi skimmed milk");
    expect(setQty(list, itemCode(list[0]!), CUSTOM_RETAILER, 0)).toEqual([]);
  });

  it("ticking off toggles, survives a reload, and is left out of the shared text; adding again unticks", () => {
    let list = addToList([], customItem("Bread")!);
    list = addToList(list, { gtin: "5012345678900", retailer: "aldi", name: "Greek Style Yogurt", brand: "", size: "500 g" });
    list = toggleDone(list, "own:bread", CUSTOM_RETAILER);
    expect(list[0]!.done).toBe(true);
    const reloaded = sanitizeShoppingList(JSON.parse(JSON.stringify(list)));
    expect(reloaded).toEqual(list);
    expect(listAsText(list)).toBe("Aldi\n- 1 x Greek Style Yogurt 500 g");
    expect(withoutDone(list).map((i) => i.name)).toEqual(["Greek Style Yogurt"]);
    expect(addToList(list, customItem("bread")!)[0]!.done).toBeUndefined();
    expect(toggleDone(list, "own:bread", CUSTOM_RETAILER)[0]!.done).toBeUndefined();
  });

  it("typed items read back only under our own retailer, and a fake 'custom' product is refused", () => {
    const raw: Array<Partial<ShoppingItem>> = [
      { gtin: "", retailer: CUSTOM_RETAILER, name: "Eggs", brand: "", size: "", qty: 1, addedAt: "2026-10-10T10:00:00.000Z", custom: true },
      { gtin: "", retailer: "tesco", name: "Not typed", brand: "", size: "", qty: 1, addedAt: "2026-10-10T10:00:00.000Z", custom: true },
      { gtin: "", retailer: CUSTOM_RETAILER, name: "   ", brand: "", size: "", qty: 1, addedAt: "2026-10-10T10:00:00.000Z", custom: true },
    ];
    expect(sanitizeShoppingList(raw).map((i) => i.name)).toEqual(["Eggs"]);
    expect(listAsText(sanitizeShoppingList(raw), (s) => (s === "Any shop" ? "Dowolny sklep" : s))).toBe("Dowolny sklep\n- 1 x Eggs");
  });
});

describe("recipes from the shopping list", () => {
  it("names match ingredients by their words; typed words need only the main word", () => {
    const chicken = PANTRY.get("chicken")!;
    const spec = { key: "c", label: chicken.label, amount: 100, unit: chicken.unit, match: chicken.match };
    expect(nameFits("Tesco British Chicken Breast Fillets 650g", spec)).toBe(true);
    expect(nameFits("Chicken", spec)).toBe(false);
    expect(nameFits("chicken", spec, true)).toBe(true);
    expect(nameFits("Chicken Thigh Fillets", spec)).toBe(false); // the chicken kind leaves thighs out
    expect(nameFits("coconut milk", { ...spec, match: PANTRY.get("milk")!.match }, true)).toBe(false);
  });

  it("a product from the same shop counts by the recipe's own rules, and the rest become what to buy", () => {
    const resolved = resolveRecipe(curry, products);
    expect(resolved.complete).toBe(true);
    const first = resolved.picks[0]!;
    const list = addToList([], { gtin: "", shopId: first.product.id, retailer: "sainsburys", name: first.product.name, brand: "", size: "" });
    const matches = recipesFromList(list, RECIPES, products, "sainsburys");
    const m = matches.find((x) => x.recipe.id === curry.id)!;
    expect(m.have).toContain(0);
    expect(m.missing).not.toContain(0);
    expect(m.have.length + m.missing.length).toBe(curry.ingredients.length);
    // ordered: most of the list used first, then fewest still to buy
    for (let i = 1; i < matches.length; i++) {
      const a = matches[i - 1]!, b = matches[i]!;
      expect(a.have.length > b.have.length || (a.have.length === b.have.length && a.missing.length <= b.missing.length)).toBe(true);
    }
    expect(nextToBuy(matches)?.missing.length).toBeGreaterThan(0);
  });

  it("the same product bought at another shop counts by its name; typed words count too", () => {
    const list = addToList([], customItem("chicken")!);
    const viaTyped = recipesFromList(list, RECIPES, products, "sainsburys");
    expect(viaTyped.some((m) => m.recipe.id === curry.id)).toBe(true);
    const other = addToList([], { gtin: "5000000000001", retailer: "tesco", name: "Tesco British Chicken Breast Fillets 650g", brand: "Tesco", size: "650g" });
    expect(recipesFromList(other, RECIPES, products, "sainsburys").some((m) => m.recipe.id === curry.id)).toBe(true);
  });

  it("only the ingredient itself counts, once: kidney beans don't make the chickpeas too, chicken doesn't make a beef recipe", () => {
    const chilli = RECIPES.find((r) => r.id === "bean-chilli")!;
    const beans = chilli.ingredients.findIndex((i) => i.pantry === "kidney-beans");
    expect(beans).toBeGreaterThanOrEqual(0);
    const list = addToList([], customItem("red kidney beans")!);
    const m = recipesFromList(list, RECIPES, products, "sainsburys").find((x) => x.recipe.id === chilli.id)!;
    expect(m.have).toEqual([beans]);
    const chicken = recipesFromList(addToList([], customItem("chicken")!), RECIPES, products, "sainsburys");
    expect(chicken.length).toBeGreaterThan(0);
    for (const x of chicken) expect(x.have.every((i) => x.recipe.ingredients[i]!.pantry?.startsWith("chicken"))).toBe(true);
  });

  it("only recipes that suit the diet are offered; an empty list offers nothing", () => {
    const vegan = RECIPES.map((r) => recipeForDiet(r, { veganOnly: true })).filter((r): r is Recipe => !!r);
    const list = addToList([], customItem("chicken")!);
    expect(recipesFromList(list, vegan, products, "sainsburys").some((m) => m.recipe.id === curry.id)).toBe(false);
    expect(recipesFromList([], RECIPES, products, "sainsburys")).toEqual([]);
  });
});

// The second sort of the 21 November meeting (Xena): useListRecipes worked the whole book out again for every tick or quantity change. It now works it out only
// when coverKey changes (what matching reads of each item), from coverItems(coverKey(list)), which must give the same recipes as the list itself.
describe("the shopping list's recipes are worked out again only when its products change", () => {
  const sainsOnly = tagShopProducts([{ shop: "sainsburys", products }]);
  const first = resolveRecipe(curry, products).picks[0]!;
  const list = addToList(addToList(addToList([], { gtin: "5000000000000", shopId: first.product.id, retailer: "sainsburys", name: first.product.name, brand: "Brand", size: "320g", price: 4 }), customItem("red kidney beans")!), customItem("rice")!);
  const code = (i: number) => itemCode(list[i]!);
  const shape = (ms: { recipe: Recipe; have: number[]; missing: number[] }[]) => ms.map((m) => [m.recipe.id, m.have, m.missing]);

  it("ticking an item or changing how many leaves the key, so the memo hands back the very same matches array", () => {
    const key = coverKey(list);
    const ticked = toggleDone(list, code(0), "sainsburys");
    const more = setQty(list, code(1), list[1]!.retailer, 3);
    expect(ticked[0]!.done).toBe(true);
    expect(more[1]!.qty).toBe(3);
    expect(coverKey(ticked)).toBe(key);
    expect(coverKey(more)).toBe(key);
    expect(coverKey(toggleDone(ticked, code(0), "sainsburys"))).toBe(key);
  });

  it("a product added or taken off changes the key", () => {
    const key = coverKey(list);
    expect(coverKey(addToList(list, customItem("chicken")!))).not.toBe(key);
    expect(coverKey(setQty(list, code(2), list[2]!.retailer, 0))).not.toBe(key);
  });

  it("the items rebuilt from the key give exactly the recipes the list gives", () => {
    const items = coverItems(coverKey(list));
    expect(items.map((i) => [i.retailer, i.shopId, i.custom, i.name])).toEqual(list.map((i) => [i.retailer, i.shopId, i.custom, i.name]));
    const fromList = recipesFromShopSet(list, RECIPES, sainsOnly);
    expect(fromList.length).toBeGreaterThan(0);
    expect(shape(recipesFromShopSet(items, RECIPES, sainsOnly))).toEqual(shape(fromList));
    expect(shape(recipesFromShopSet(toggleDone(list, code(0), "sainsburys"), RECIPES, sainsOnly))).toEqual(shape(fromList));
  });

  it("the Recipes tab asks for them only once its own cards are worked out, with one empty list that never changes", () => {
    const page = readFileSync("app/app/recipes/page.tsx", "utf8");
    expect(page).toMatch(/^const NO_ITEMS: ShoppingItem\[\] = \[\];$/m);
    expect(page).toContain("useListRecipes(cardsReady ? shopping : NO_ITEMS)");
    const hook = readFileSync("app/app/_lib/listRecipes.ts", "utf8");
    expect(hook).toContain("}, [itemsKey, products, files, dietKey]);");
    expect(hook).toContain("recipesFromShopSet(coverItems(itemsKey), recipes, products)");
  });
});

// "What can I cook with this?" and the Recipes page's "Cook with what's on your list" use every one of the person's recipe shops, like the Recipes page and a
// recipe page (founder 2026-11-17: someone who ticks Morrisons then Sainsbury's sees recipes from both, so the list's recipes must know both shops' products).
describe("recipes from the shopping list, with several shops", () => {
  const sainsOnly = tagShopProducts([{ shop: "sainsburys", products }]);
  const both = tagShopProducts([{ shop: "morrisons", products: morrisons }, { shop: "sainsburys", products }]);
  const files = [morrisonsFile, sainsburysFile];

  it("with one shop it gives exactly what the one-shop matcher gives", () => {
    const first = resolveRecipe(curry, products).picks[0]!;
    const list = addToList(addToList([], { gtin: "", shopId: first.product.id, retailer: "sainsburys", name: first.product.name, brand: "", size: "" }), customItem("red kidney beans")!);
    const shape = (ms: { recipe: Recipe; have: number[]; missing: number[] }[]) => ms.map((m) => [m.recipe.id, m.have, m.missing]);
    expect(shape(recipesFromShopSet(list, RECIPES, sainsOnly))).toEqual(shape(recipesFromList(list, RECIPES, products, "sainsburys")));
    expect(recipesFromShopSet([], RECIPES, sainsOnly)).toEqual([]);
  });

  it("offers recipes only the two shops together can fill, with the second shop filling the gap", () => {
    const onlyTogether = RECIPES.filter((r) => !resolveRecipe(r, morrisons).complete && resolveRecipe(r, both).complete);
    expect(onlyTogether.length).toBeGreaterThan(0);
    const r = onlyTogether[0]!;
    const list = addToList([], customItem(r.ingredients[0]!.label)!);
    const morrisonsAlone = recipesFromShopSet(list, RECIPES, tagShopProducts([{ shop: "morrisons", products: morrisons }]));
    expect(morrisonsAlone.some((m) => m.recipe.id === r.id)).toBe(false);
    const m = recipesFromShopSet(list, RECIPES, both).find((x) => x.recipe.id === r.id);
    expect(m).toBeDefined();
    expect(m!.resolved.picks.some((p) => p?.product.shop === "sainsburys")).toBe(true);
  }, 30000); // reads two whole shops' products and every recipe: slow under a full run

  it("a product on the list counts by the recipe's rules at its own shop, never by a same-id product at another", () => {
    const picks = resolveRecipe(curry, both).picks;
    const index = Math.max(0, picks.findIndex((p) => p?.product.shop === "morrisons"));
    const pick = picks[index]!;
    const shop = pick.product.shop!;
    const other = shop === "morrisons" ? "sainsburys" : "morrisons";
    // a name that names nothing, so only the product itself can count
    const at = (retailer: string) => addToList([], { gtin: "", shopId: pick.product.id, retailer, name: "Zzz", brand: "", size: "" });
    expect(recipesFromShopSet(at(shop), RECIPES, both).find((x) => x.recipe.id === curry.id)?.have).toContain(index);
    expect(recipesFromShopSet(at(other), RECIPES, both).find((x) => x.recipe.id === curry.id)?.have ?? []).not.toContain(index);
  });

  it("what a recipe still needs goes on the list under the shop each product comes from", () => {
    const list = addToList([], customItem("chicken")!);
    const matches = recipesFromShopSet(list, RECIPES, both);
    const m = matches.find((x) => x.missing.some((i) => x.resolved.picks[i]?.product.shop === "morrisons") && x.missing.some((i) => x.resolved.picks[i]?.product.shop === "sainsburys"));
    expect(m).toBeDefined();
    const items = missingItems(m!, files);
    expect(items.length).toBe(m!.missing.length);
    for (const { item } of items) {
      const p = [...morrisons, ...products].find((x) => x.id === item.shopId);
      expect(p).toBeDefined();
      const f = files.find((x) => x.retailer === item.retailer)!;
      expect(f).toBeDefined();
      expect(item.checkedOn).toBe(f.checkedOn);
    }
    expect(new Set(items.map((x) => x.item.retailer))).toEqual(new Set(["morrisons", "sainsburys"]));
    // each product's photo comes from its own shop's file
    const sp = m!.resolved.picks[m!.missing.find((i) => m!.resolved.picks[i]?.product.shop === "sainsburys")!]!.product;
    expect(fileForProduct(files, sp)?.retailer).toBe("sainsburys");
    // a product tagged with a shop we have no file for is left off rather than filed under another shop
    expect(fileForProduct([morrisonsFile], sp)).toBeUndefined();
    expect(missingItems(m!, [morrisonsFile]).every((x) => x.item.retailer === "morrisons")).toBe(true);
  });
});

describe("a list recipe's photos and note, whichever shop's file a screen passes", () => {
  const both = tagShopProducts([{ shop: "morrisons", products: morrisons }, { shop: "sainsburys", products }]);
  const files = [morrisonsFile, sainsburysFile];
  const list = addToList([], customItem("chicken")!);
  const matches = recipesFromShopSet(list, RECIPES, both).map((m) => ({ ...m, files }));
  const mixed = matches.find((x) => x.missing.some((i) => x.resolved.picks[i]?.product.shop === "morrisons") && x.missing.some((i) => x.resolved.picks[i]?.product.shop === "sainsburys"))!;
  // with Sainsbury's alone, every product goes under Sainsbury's
  const oneShop = recipesFromShopSet(list, RECIPES, tagShopProducts([{ shop: "sainsburys", products }])).map((m) => ({ ...m, files: [sainsburysFile] })).find((x) => x.missing.length > 1);

  it("a second shop's product shows its own shop's photo even through the first shop's file", () => {
    expect(mixed).toBeDefined();
    const fixed = withOwnPhotos(mixed, files);
    let checked = 0;
    mixed.resolved.picks.forEach((p, i) => {
      if (!p) return;
      const q = fixed.resolved.picks[i]!.product;
      const own = files.find((f) => f.retailer === p.product.shop)!;
      expect(shopPhotoSources(morrisonsFile, q)).toEqual(shopPhotoSources(own, p.product));
      expect(shopPhotoSources(own, q)).toEqual(shopPhotoSources(own, p.product));
      if (p.product.shop === "morrisons") expect(q).toBe(p.product); // the first shop's products are left as they are
      else if (shopPhotoSources(own, p.product).length) checked++;
      // never a photo address built from the first shop's template with another shop's id
      for (const s of shopPhotoSources(morrisonsFile, q)) if (p.product.shop === "sainsburys") expect(s.shop).not.toBe("morrisons");
    });
    expect(checked).toBeGreaterThan(0);
    // what "Add the rest" stores is unchanged
    expect(missingItems(fixed, files)).toEqual(missingItems(mixed, files));
  });

  it("a product whose shop has no file shows no photo rather than one from another shop's host", () => {
    const fixed = withOwnPhotos(mixed, [morrisonsFile]);
    mixed.resolved.picks.forEach((p, i) => {
      if (p?.product.shop === "sainsburys") expect(shopPhotoSources(morrisonsFile, fixed.resolved.picks[i]!.product).every((s) => s.shop !== "morrisons")).toBe(true);
    });
  });

  it("the note names the real lists the products went on, and the first one to open", () => {
    const nameOf = (id: string) => (id === "" ? "Shopping list" : id === "sains123" ? "Sainsbury's" : id);
    expect(addedNote({ lists: [{ list: "", n: 3 }], full: 0, tried: 3 }, nameOf)).toEqual({ text: "Added {n} products to {list}.", values: { n: 3, list: "Shopping list" }, list: "" });
    expect(addedNote({ lists: [{ list: "sains123", n: 1 }], full: 0, tried: 1 }, nameOf)).toEqual({ text: "Added 1 product to {list}.", values: { list: "Sainsbury's" }, list: "sains123" });
    expect(addedNote({ lists: [{ list: "sains123", n: 4 }, { list: "", n: 2 }], full: 0, tried: 6 }, nameOf)).toEqual({ text: "Added {n} products to {list}.", values: { n: 6, list: "Sainsbury's and Shopping list" }, list: "sains123" });
    expect(addedNote({ lists: [], full: 0, tried: 2 }, nameOf)).toEqual({ text: "Everything is on your shopping list already.", values: {}, list: null });
    expect(addedNote({ lists: [{ list: "", n: 12 }], full: 28, tried: 40 }, nameOf)).toMatchObject({ text: "Added {n} of {total}: your lists are full ({max} items). Remove ticked things to make room.", values: { n: 12, total: 40, max: 200 } });
    expect(oneShop).toBeDefined();
  });
});

describe("which list a product goes on (one rule for every add)", () => {
  const sains: ShoppingList = { id: "sains123", shop: "sainsburys", name: "Sainsbury's" };
  const sains2: ShoppingList = { id: "sains456", shop: "sainsburys", name: "Sainsbury's 2" };
  const mns: ShoppingList = { id: "mands123", shop: "marks-and-spencer", name: "M&S" };
  it("is the list looked at when it is the main list or that shop's own list, else the shop's newest list, else the main list", () => {
    expect(targetList("", [sains], "sainsburys")).toBe("");
    expect(targetList("sains123", [sains, sains2], "sainsburys")).toBe("sains123");
    expect(targetList(undefined, [sains, sains2], "sainsburys")).toBe("sains456");
    // looking at M&S's list, a Sainsbury's product goes on Sainsbury's own list, never under M&S
    expect(targetList("mands123", [sains, mns], "sainsburys")).toBe("sains123");
    expect(targetList("mands123", [mns], "sainsburys")).toBe("");
    expect(targetList(undefined, undefined, "sainsburys")).toBe("");
  });

  it("a recipe's products go on the list looked at, counted, and adding them again doesn't double them", () => {
    const items = missingItems(oneShopMatch(), [sainsburysFile]);
    expect(items.length).toBeGreaterThan(1);
    const first = placeItems(items, [], [sains], "sains123");
    expect(first.placed).toEqual({ lists: [{ list: "sains123", n: items.length }], full: 0, tried: items.length });
    expect(first.list.every((i) => i.list === "sains123")).toBe(true);
    const again = placeItems(items, first.list, [sains], "sains123");
    expect(again.placed.lists).toEqual([]);
    expect(again.list.map((i) => i.qty)).toEqual(first.list.map((i) => i.qty));
    // from the main list they go on the main list
    expect(placeItems(items, [], [sains], "").list.every((i) => !("list" in i))).toBe(true);
  });
});

function oneShopMatch() {
  const list = addToList([], customItem("chicken")!);
  return recipesFromShopSet(list, RECIPES, tagShopProducts([{ shop: "sainsburys", products }])).find((x) => x.missing.length > 1)!;
}

describe("saved recipes", () => {
  it("keeps valid ids once each", () => {
    expect(sanitizeRecipeSaves([{ id: "chicken-curry", savedAt: "x" }, { id: "chicken-curry", savedAt: "y" }, { id: "Bad id!", savedAt: "x" }, null, "x"])).toEqual([{ id: "chicken-curry", savedAt: "x" }]);
    expect(sanitizeRecipeSaves("nope")).toEqual([]);
  });
});

describe("what the person has isn't suggested (usability test 2026-11-19: Pat's oil spray and potatoes came back as 'You might also need')", () => {
  it("leaves out cupboard kinds they keep and ingredients ticked on the recipe's page", () => {
    const withCupboard = RECIPES.find((r) => r.ingredients.some((i) => i.cupboard && i.pantry) && resolveRecipe(r, products).complete)!;
    const first = resolveRecipe(withCupboard, products).picks.find((p, i) => !!p && !withCupboard.ingredients[i]!.cupboard)!;
    const list = addToList([], { gtin: "", shopId: first.product.id, retailer: "sainsburys", name: first.product.name, brand: "", size: "" });
    const matches = recipesFromList(list, RECIPES, products, "sainsburys");
    const m = matches.find((x) => x.recipe.id === withCupboard.id)!;
    expect(m).toBeTruthy();
    const cupboardKinds = new Set(m.missing.map((i) => m.recipe.ingredients[i]!).filter((s) => s.cupboard && s.pantry).map((s) => s.pantry!));
    const fresh = m.missing.map((i) => m.recipe.ingredients[i]!).filter((s) => !(s.cupboard && s.pantry)).map((s) => s.key);
    const after = withoutWhatTheyHave([m], cupboardKinds, new Map([[m.recipe.id, new Set(fresh)]]))[0]!;
    expect(after.missing).toEqual([]);
    expect(nextToBuy([after])).toBeNull();
    expect(withoutWhatTheyHave([m], new Set(), new Map())[0]!.missing).toEqual(m.missing);
  });

  it("'Cook with your shopping list' neither lists nor adds a cupboard kind they keep (the 30-person meeting, 21 November 2026, Leo)", () => {
    // the page keeps each match (its shops' files) and takes only the filtered missing, so Still to buy, the button's count and "Add the other n" agree
    const cupboardMissing = (x: { recipe: Recipe; missing: number[] }) => x.missing.map((i) => x.recipe.ingredients[i]!).filter((s) => s.cupboard && s.pantry);
    const found = recipesFromShopSet(addToList([], customItem("chicken")!), RECIPES, tagShopProducts([{ shop: "sainsburys", products }])).find((x) => cupboardMissing(x).length > 0)!;
    const m = { ...found, files: [sainsburysFile] };
    const kinds = new Set(cupboardMissing(m).map((s) => s.pantry!));
    expect(kinds.size).toBeGreaterThan(0);
    const kept = withoutWhatTheyHave([m], kinds, new Map())[0]!;
    const shown = { ...m, missing: kept.missing };
    expect(shown.files).toEqual([sainsburysFile]);
    const added = missingItems(shown, shown.files).map((x) => x.item.shopId);
    for (const i of m.missing.filter((i) => !kept.missing.includes(i))) {
      const pick = m.resolved.picks[i];
      if (pick) expect(added).not.toContain(pick.product.id);
    }
    expect(kept.missing.length).toBeLessThan(m.missing.length);
    expect(added.length).toBeLessThanOrEqual(kept.missing.length);
  });
});
