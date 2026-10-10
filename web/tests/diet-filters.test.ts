import { describe, expect, it } from "vitest";
import { anyDietFilter, chainForDiet, filterCaution, filterItems, freeOfAllergens, isNamedVegan, passesDiet } from "../lib/mm/menu-view";
import { sanitizeSettings } from "../lib/mm/user-data";
import { NO_PREFERENCES, type MenuItem } from "../lib/mm/types";
import { cluck } from "./fixtures";

const base = cluck().chain.items[0]!;
const dish = (over: Partial<MenuItem>): MenuItem => ({ ...base, ...over });

describe("vegan (as the restaurant names it)", () => {
  it("matches vegan or plant-based in the name or the menu section, nothing else", () => {
    expect(isNamedVegan({ name: "Vegan Sausage Roll", category: "Bakes" })).toBe(true);
    expect(isNamedVegan({ name: "Plant-Based Burger", category: "Burgers" })).toBe(true);
    expect(isNamedVegan({ name: "Falafel wrap", category: "Plant based" })).toBe(true);
    expect(isNamedVegan({ name: "Cheese toastie", category: "Vegetarian" })).toBe(false);
  });
  it("veganOnly keeps only named vegan dishes", () => {
    const items = [dish({ id: "a", name: "Vegan Bowl" }), dish({ id: "b", name: "Chicken Bowl" })];
    expect(filterItems(items, { ...NO_PREFERENCES, veganOnly: true }).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("allergens to avoid", () => {
  const withA = dish({ id: "a", allergens: { contains: ["milk"], mayContain: ["nuts"] } });
  const clean = dish({ id: "b", allergens: { contains: ["gluten"], mayContain: [] } });
  const unknown = dish({ id: "c" });
  it("hides a dish that contains or may contain an avoided allergen", () => {
    expect(freeOfAllergens(withA, ["milk"])).toBe(false);
    expect(freeOfAllergens(withA, ["nuts"])).toBe(false);
    expect(freeOfAllergens(clean, ["milk", "nuts"])).toBe(true);
  });
  it("hides a dish with no allergen information when a filter is on, keeps it when none is", () => {
    expect(freeOfAllergens(unknown, ["milk"])).toBe(false);
    expect(freeOfAllergens(unknown, [])).toBe(true);
    expect(freeOfAllergens(unknown, undefined)).toBe(true);
  });
  it("combines with the tag filters", () => {
    const veg = dish({ id: "v", tags: ["vegetarian"], allergens: { contains: [], mayContain: [] } });
    expect(passesDiet(veg, { ...NO_PREFERENCES, vegetarianOnly: true, avoidAllergens: ["milk"] })).toBe(true);
    expect(passesDiet(clean, { ...NO_PREFERENCES, vegetarianOnly: true, avoidAllergens: ["milk"] })).toBe(clean.tags.includes("vegetarian"));
  });
});

describe("Best for you sees the same filters", () => {
  it("removes failing dishes and the combinations built on them; untouched without extra filters", () => {
    const chain = cluck().chain;
    expect(chainForDiet(chain, NO_PREFERENCES)).toBe(chain);
    const out = chainForDiet(chain, { ...NO_PREFERENCES, avoidAllergens: ["milk"] });
    expect(out.items.every((i) => freeOfAllergens(i, ["milk"]))).toBe(true);
    const kept = new Set(out.items.map((i) => i.id));
    expect(out.combinations.every((c) => c.baseItemId !== null && kept.has(c.baseItemId))).toBe(true);
  });
});

describe("caution wording and settings", () => {
  it("names every diet filter and adds the allergy sentence", () => {
    expect(filterCaution({ ...NO_PREFERENCES, veganOnly: true })).toBe("We only know what each restaurant publishes, so this can't promise a dish is vegan.");
    expect(filterCaution({ ...NO_PREFERENCES, avoidAllergens: ["milk"] })).toMatch(/^Allergy filters use each restaurant's own allergen guide/);
    expect(anyDietFilter(NO_PREFERENCES)).toBe(false);
    expect(anyDietFilter({ ...NO_PREFERENCES, avoidAllergens: ["eggs"] })).toBe(true);
  });
  it("keeps the new preferences and text size through storage, dropping junk", () => {
    const s = sanitizeSettings({ preferences: { veganOnly: true, halalOnly: true, avoidAllergens: ["milk", "bogus", "eggs"] }, textSize: "xlarge" });
    expect(s.preferences).toEqual({ vegetarianOnly: false, noPork: false, noBeef: false, veganOnly: true, halalOnly: true, avoidAllergens: ["eggs", "milk"] });
    expect(s.textSize).toBe("xlarge");
    expect(sanitizeSettings({ textSize: "huge" }).textSize).toBeUndefined();
  });
});
