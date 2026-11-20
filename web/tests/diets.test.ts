import { describe, expect, it } from "vitest";
import { PANTRY, kindExcluded, kindForDiet, mixesMeatAndDairy, type PantryKind } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { recipeForDiet } from "../lib/mm/recipes";
import { sanitizeSettings } from "../lib/mm/user-data";

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
