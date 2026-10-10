import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addToList, customItem, CUSTOM_RETAILER, itemCode, listAsText, sanitizeShoppingList, setQty, toggleDone, withoutDone, type ShoppingItem } from "../lib/mm/groceries";
import { nextToBuy, recipesFromList } from "../lib/mm/listRecipes";
import { RECIPES } from "../lib/mm/recipeBook";
import { nameFits, recipeForDiet, resolveRecipe, type Recipe } from "../lib/mm/recipes";
import { PANTRY } from "../lib/mm/pantry";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import { sanitizeRecipeSaves } from "../lib/mm/user-data";

const products = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/sainsburys.json", "utf8")));
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
    expect(listAsText(list)).toBe("Aldi\n- 1 x Greek Style Yogurt 500 g (5012345678900)");
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

  it("only the ingredient itself counts, once: kidney beans don't make the black beans too, chicken doesn't make a beef recipe", () => {
    const chilli = RECIPES.find((r) => r.id === "black-bean-chilli")!;
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

describe("saved recipes", () => {
  it("keeps valid ids once each", () => {
    expect(sanitizeRecipeSaves([{ id: "chicken-curry", savedAt: "x" }, { id: "chicken-curry", savedAt: "y" }, { id: "Bad id!", savedAt: "x" }, null, "x"])).toEqual([{ id: "chicken-curry", savedAt: "x" }]);
    expect(sanitizeRecipeSaves("nope")).toEqual([]);
  });
});
