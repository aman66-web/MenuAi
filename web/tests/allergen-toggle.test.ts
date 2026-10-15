import { describe, expect, it } from "vitest";
import { toggleAllergen } from "../lib/mm/menu-view";
import type { Preferences } from "../lib/mm/types";

// "Allergies to avoid" is one list for the whole app (Settings, a restaurant, Eat out's finder, Recipes): choosing one adds it in the app's own order,
// choosing it again takes it off, and the field disappears with the last one so a person with no allergies has the same settings as before.
const base: Preferences = { vegetarianOnly: false, noPork: true, noBeef: false };

describe("toggleAllergen", () => {
  it("adds an allergen and keeps every other choice", () => {
    expect(toggleAllergen(base, "milk")).toEqual({ ...base, avoidAllergens: ["milk"] });
  });
  it("keeps the app's order whatever order they are chosen in", () => {
    const a = toggleAllergen(toggleAllergen(toggleAllergen(base, "sulphites"), "gluten"), "eggs");
    expect(a.avoidAllergens).toEqual(["gluten", "eggs", "sulphites"]);
  });
  it("takes one off, and drops the field with the last one", () => {
    const two = toggleAllergen(toggleAllergen(base, "milk"), "eggs");
    expect(toggleAllergen(two, "milk").avoidAllergens).toEqual(["eggs"]);
    const none = toggleAllergen(toggleAllergen(base, "milk"), "milk");
    expect(none).toEqual(base);
    expect("avoidAllergens" in none).toBe(false);
  });
  it("never changes the preferences it was given", () => {
    const before = JSON.stringify(base);
    toggleAllergen(base, "milk");
    expect(JSON.stringify(base)).toBe(before);
  });
});
