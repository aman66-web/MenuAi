import { describe, expect, it } from "vitest";
import { PANTRY, kindExcluded, kindForDiet, mixesMeatAndDairy, type PantryKind } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { recipeForDiet } from "../lib/mm/recipes";
import { sanitizeSettings } from "../lib/mm/user-data";
import { dietNameList, foodDietCaution, foodDietNotChecked, foodDietProblem, MORE_DIET_KEYS, moreDietsOn } from "../lib/mm/foodDiet";
import { anyDietFilter, filterCaution, passesDiet, restaurantDietNote, restaurantPrefs, toggleDiet, uncheckableDiets } from "../lib/mm/menu-view";
import { NO_PREFERENCES, type MenuItem } from "../lib/mm/types";
import { cluck } from "./fixtures";

// More diets for recipes and the meal plan (founder 2026-11-20: "Some people might be Hindu, Pakistani, whatever ... cater to every single diet you can possibly
// think about"). The tags come from the shops' own ingredient lists where a kind is a made product (houmous, salsa, pesto...).

const k = (key: string): PantryKind => PANTRY.get(key)!;

describe("the new diets leave out what they should", () => {
  it("Jain: no meat, fish, eggs or honey, nothing grown underground, no mushrooms or sprouts; dairy and dried spices stay", () => {
    const jain = { jain: true };
    for (const key of ["chicken", "salmon", "eggs", "honey", "granola", "onion", "garlic", "carrots", "new-potatoes", "ginger", "gnocchi", "mushrooms", "quorn", "beansprouts", "houmous", "stock-cube"]) {
      expect(kindExcluded(k(key), jain), key).toBe("jain");
    }
    for (const key of ["paneer", "milk", "cheddar", "rice", "chickpeas", "turmeric", "cumin", "spinach"]) expect(kindExcluded(k(key), jain), key).toBeNull();
  });
  it("No onion or garlic: onion, garlic and the made products whose labels print them", () => {
    for (const key of ["onion", "red-onion", "spring-onions", "garlic", "chives", "houmous", "salsa", "pesto", "stock-cube", "curry-paste", "fajita-seasoning"]) {
      expect(kindExcluded(k(key), { noOnionGarlic: true }), key).not.toBeNull();
    }
    expect(kindExcluded(k("carrots"), { noOnionGarlic: true })).toBeNull();
  });
  it("No red meat, kosher style, no alcohol, and halal leaving alcohol out", () => {
    expect(["beef-mince", "lamb-mince", "bacon"].map((x) => kindExcluded(k(x), { noRedMeat: true }))).toEqual(["no red meat", "no red meat", "no red meat"]);
    expect(kindExcluded(k("chicken"), { noRedMeat: true })).toBeNull();
    expect(kindExcluded(k("bacon"), { kosherStyle: true })).toBe("kosher style");
    expect(kindExcluded(k("prawns"), { kosherStyle: true })).toBe("kosher style");
    expect(kindExcluded(k("salmon"), { kosherStyle: true })).toBeNull();
    expect(kindExcluded(k("mustard"), { noAlcohol: true })).toBe("no alcohol");
    expect(kindExcluded(k("mustard"), { halalOnly: true })).toBe("halal");
    expect(kindExcluded(k("honey"), { veganOnly: true })).toBe("vegan");
    expect(kindExcluded(k("granola"), { veganOnly: true })).toBe("vegan");
  });
  it("kosher style keeps meat and dairy apart in a dish", () => {
    expect(mixesMeatAndDairy([k("chicken"), k("cheddar")])).toBe(true);
    expect(mixesMeatAndDairy([k("chicken"), k("rice")])).toBe(false);
    expect(mixesMeatAndDairy([k("salmon"), k("cheddar")])).toBe(false);
    const both = RECIPES.find((r) => r.ingredients.some((i) => i.pantry && PANTRY.get(i.pantry)?.meat) && r.ingredients.some((i) => i.pantry && PANTRY.get(i.pantry)?.contains.includes("milk")) && !r.ingredients.some((i) => i.pantry && (PANTRY.get(i.pantry)?.meat === "pork" || PANTRY.get(i.pantry)?.contains.includes("crustaceans"))));
    expect(both, "a recipe with meat and dairy exists").toBeTruthy();
    expect(recipeForDiet(both!, { kosherStyle: true })).toBeNull();
  });
  it("no meat sold as halal or kosher: meat is never matched to such products", () => {
    const m = kindForDiet(k("chicken"), { noHalalKosherMeat: true }).match;
    expect(m.none).toEqual(expect.arrayContaining(["halal", "kosher"]));
    expect(kindForDiet(k("rice"), { noHalalKosherMeat: true })).toBe(k("rice"));
  });
  it("every diet still leaves recipes to choose from", () => {
    for (const prefs of [{ jain: true }, { noOnionGarlic: true }, { kosherStyle: true }, { noRedMeat: true }, { noAlcohol: true }, { noHalalKosherMeat: true }]) {
      const left = RECIPES.filter((r) => recipeForDiet(r, prefs)).length;
      expect(left, JSON.stringify(prefs)).toBeGreaterThan(5);
    }
  });
});

describe("the new diets are kept with the settings", () => {
  it("keeps each when exactly true and drops anything else", () => {
    const s = sanitizeSettings({ preferences: { jain: true, kosherStyle: true, noRedMeat: true, noOnionGarlic: "yes", noAlcohol: true, noHalalKosherMeat: 1 } });
    expect(s.preferences).toMatchObject({ jain: true, kosherStyle: true, noRedMeat: true, noAlcohol: true });
    expect("noOnionGarlic" in s.preferences).toBe(false);
    expect("noHalalKosherMeat" in s.preferences).toBe(false);
  });
});

// Restaurant menus print no ingredients, so the six are checked only as far as a restaurant's own data and a dish's own name can tell (the 20 November 2026
// audit: onboarding treated Jain as vegetarian and No red meat as no pork and no beef, but the restaurant pages, search and Best for you ignored them). One
// mapping (menu-view.ts restaurantPrefs) is used everywhere; a plain line says what is and isn't checked. Products aren't read for them yet.
describe("restaurant menus check the new diets as far as they can, and say what they can't", () => {
  const dish = (over: Partial<MenuItem>): MenuItem => ({ ...cluck().chain.items[0]!, ...over });
  it("names them in quotes, joined plainly, in the picker's order", () => {
    expect(MORE_DIET_KEYS).toEqual(["jain", "noOnionGarlic", "kosherStyle", "noRedMeat", "noAlcohol", "noHalalKosherMeat"]);
    expect(moreDietsOn({ ...NO_PREFERENCES, noAlcohol: true, jain: true })).toEqual(["jain", "noAlcohol"]);
    expect(dietNameList(["jain"])).toBe("“Jain”");
    expect(dietNameList(["jain", "noOnionGarlic"])).toBe("“Jain” and “No onion or garlic”");
    expect(dietNameList(["jain", "kosherStyle", "noAlcohol"])).toBe("“Jain”, “Kosher style” and “No alcohol”");
  });
  it("one mapping: Jain as vegetarian, No red meat as no pork and no beef, Kosher style as no pork", () => {
    expect(restaurantPrefs({ ...NO_PREFERENCES, jain: true })).toMatchObject({ vegetarianOnly: true, noPork: false, noBeef: false });
    expect(restaurantPrefs({ ...NO_PREFERENCES, noRedMeat: true })).toMatchObject({ vegetarianOnly: false, noPork: true, noBeef: true });
    expect(restaurantPrefs({ ...NO_PREFERENCES, kosherStyle: true })).toMatchObject({ noPork: true, noBeef: false });
    expect(restaurantPrefs(NO_PREFERENCES)).toBe(NO_PREFERENCES);
  });
  it("a restaurant's menu: tags and names leave dishes out, and the line says what can't be checked", () => {
    const redMeat = { ...NO_PREFERENCES, noRedMeat: true };
    expect(anyDietFilter(redMeat)).toBe(true);
    expect(passesDiet(dish({ name: "Beef burger", tags: ["contains_beef"] }), redMeat)).toBe(false);
    expect(passesDiet(dish({ name: "Bacon roll", tags: [] }), redMeat)).toBe(false);
    expect(passesDiet(dish({ name: "Lamb kofta", tags: [] }), redMeat)).toBe(false);
    expect(passesDiet(dish({ name: "Chicken wrap", tags: [] }), redMeat)).toBe(true);
    expect(passesDiet(dish({ name: "Sausage roll", tags: [] }), { ...NO_PREFERENCES, kosherStyle: true })).toBe(false);
    expect(passesDiet(dish({ name: "Cheese toastie", tags: [] }), { ...NO_PREFERENCES, jain: true })).toBe(false); // not marked vegetarian
    expect(passesDiet(dish({ name: "Cheese toastie", tags: ["vegetarian"] }), { ...NO_PREFERENCES, jain: true })).toBe(true);
    expect(passesDiet(dish({ name: "Peroni", category: "Drinks", tags: [] }), { ...NO_PREFERENCES, noAlcohol: true })).toBe(false);
    expect(passesDiet(dish({ name: "Peroni 0.0%", category: "Beers", tags: [] }), { ...NO_PREFERENCES, noAlcohol: true })).toBe(true);
    expect(passesDiet(dish({ name: "Prawn cocktail", category: "Starters", tags: [] }), { ...NO_PREFERENCES, noAlcohol: true })).toBe(true); // a starter, not a drink
    expect(passesDiet(dish({ name: "Virgin Mojito", category: "Cocktails", tags: [] }), { ...NO_PREFERENCES, noAlcohol: true })).toBe(true);
    expect(restaurantDietNote(NO_PREFERENCES)).toBeNull();
    const jain = { ...NO_PREFERENCES, jain: true, noRedMeat: true };
    expect(restaurantDietNote(jain)).toBe(
      "Restaurant menus don't list ingredients. “Jain” is checked as vegetarian; onion, garlic and root vegetables can't be checked. “No red meat” leaves out pork, beef and lamb where the restaurant or the dish's name says so.",
    );
    expect(filterCaution({ ...NO_PREFERENCES, noOnionGarlic: true })).toBe("Restaurant menus don't list ingredients. “No onion or garlic” can't be checked.");
    expect(filterCaution({ ...jain, avoidAllergens: ["milk"] })).toBe(
      `We only know what each restaurant publishes, so this can't promise a dish is vegetarian or pork-free or beef-free. ${restaurantDietNote(jain)} Where a restaurant publishes allergens, dishes that list them, or that its guide doesn't cover, are hidden. Where it publishes none, we say so on its page. Always check with the restaurant.`,
    );
  });
  it("Best for you doesn't pick for a diet a menu can't check at all", () => {
    expect(uncheckableDiets({ ...NO_PREFERENCES, noOnionGarlic: true, noRedMeat: true })).toEqual(["noOnionGarlic"]);
    expect(uncheckableDiets({ ...NO_PREFERENCES, jain: true, noHalalKosherMeat: true })).toEqual(["jain", "noHalalKosherMeat"]);
  });
  it("products: never left out or kept for them, and the line says they aren't checked", () => {
    const kosher = { ...NO_PREFERENCES, kosherStyle: true, noAlcohol: true };
    expect(foodDietProblem({ name: "Smoked Back Bacon" }, kosher)).toBeNull();
    expect(foodDietNotChecked(NO_PREFERENCES)).toBeNull();
    expect(foodDietNotChecked(kosher)).toBe("Products aren't checked for “Kosher style” and “No alcohol”. Always check the pack.");
    expect(foodDietCaution(kosher)).toBe(foodDietNotChecked(kosher));
    expect(foodDietCaution({ ...kosher, vegetarianOnly: true })).toBe(
      "We go by each product's name, type and label, so this can't promise a product is vegetarian. Always check the pack. Products aren't checked for “Kosher style” and “No alcohol”.",
    );
  });
  it("each turns on and off on its own, leaving the other choices as they were", () => {
    const on = toggleDiet({ ...NO_PREFERENCES, vegetarianOnly: true }, "jain");
    expect(on).toMatchObject({ vegetarianOnly: true, jain: true });
    expect(toggleDiet(on, "jain").jain).toBe(false);
    expect(sanitizeSettings({ preferences: toggleDiet(on, "jain") }).preferences.jain).toBeUndefined();
  });
  it("No halal or kosher meat can't be on with Halal or Kosher style", () => {
    const both = toggleDiet({ ...NO_PREFERENCES, halalOnly: true, kosherStyle: true }, "noHalalKosherMeat");
    expect(both).toMatchObject({ noHalalKosherMeat: true, halalOnly: false, kosherStyle: false });
    expect(toggleDiet(both, "halalOnly")).toMatchObject({ halalOnly: true, noHalalKosherMeat: false });
    expect(toggleDiet(both, "kosherStyle")).toMatchObject({ kosherStyle: true, noHalalKosherMeat: false });
  });
});
