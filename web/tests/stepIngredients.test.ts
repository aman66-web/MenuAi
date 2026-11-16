import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/mm/recipeBook";
import { firstMentions } from "../lib/mm/stepIngredients";

// The Method tab shows each ingredient's amount under the first step that uses it (lib/mm/stepIngredients.ts), so the steps follow the servings.
describe("the first step that uses each ingredient", () => {
  it("puts every ingredient of every recipe under exactly one step", () => {
    for (const r of RECIPES) {
      const placed = [...firstMentions(r.method, r.ingredients).values()].flat();
      expect(placed.sort(), r.id).toEqual(r.ingredients.map((i) => i.key).sort());
    }
  });

  it("uses the earliest step that names it", () => {
    const m = firstMentions(["Cook the rice: Boil it.", "Fry the chicken: Until no pink is left.", "Serve: Spoon the rice on plates."], [
      { key: "rice", pantry: "rice" }, { key: "chicken", pantry: "chicken" },
    ]);
    expect([...m.entries()]).toEqual([[0, ["rice"]], [1, ["chicken"]]]);
  });

  it("finds a substitute by the ingredient it stands in for", () => {
    const m = firstMentions(["Prepare: Chop the onion.", "Fry the chicken: Until no pink is left."], [{ key: "chicken", pantry: "tofu", original: { pantry: "chicken" } }]);
    expect([...m.entries()]).toEqual([[1, ["chicken"]]]);
  });
});
