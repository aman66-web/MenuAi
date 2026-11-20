import { describe, expect, it } from "vitest";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { recipeAllergens } from "../lib/mm/recipeAllergens";
import { ALLERGEN_KEYS } from "../lib/mm/types";

describe("a recipe's allergens, from its ingredients' kinds", () => {
  it("adds up each kind's contains flags and names the ingredients that bring each one", () => {
    const withGluten = [...PANTRY.values()].find((k) => k.contains.includes("gluten"))!;
    const withMilk = [...PANTRY.values()].find((k) => k.contains.includes("milk") && k.key !== withGluten.key)!;
    const r = recipeAllergens([
      { label: "First", pantry: withGluten.key },
      { label: "Second", pantry: withMilk.key },
      { label: "First", pantry: withGluten.key },
      { label: "Typed by hand" },
    ]);
    expect(r.allergens.contains).toContain("gluten");
    expect(r.allergens.contains).toContain("milk");
    expect(r.from.gluten).toContain("First");
    expect(r.from.gluten!.filter((l) => l === "First")).toHaveLength(1); // each ingredient once
    expect(r.from.milk).toContain("Second");
    expect(r.allergens.mayContain).toEqual([]); // kinds say nothing about traces
  });

  it("lists allergens in the 14's own order and only ones some ingredient brings, for every recipe in the book", () => {
    for (const recipe of RECIPES) {
      const r = recipeAllergens(recipe.ingredients);
      const order = r.allergens.contains.map((k) => ALLERGEN_KEYS.indexOf(k));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      for (const k of r.allergens.contains) expect(r.from[k]!.length).toBeGreaterThan(0);
      const flagged = new Set(recipe.ingredients.flatMap((i) => (i.pantry ? PANTRY.get(i.pantry)?.contains ?? [] : [])));
      expect(new Set(r.allergens.contains)).toEqual(flagged);
    }
  });

  it("finds the allergens a few known recipes must show (fixed cases, so a lost flag can't pass by matching itself)", () => {
    const has = (id: string, a: string) => recipeAllergens(RECIPES.find((r) => r.id === id)!.ingredients).allergens.contains.includes(a as never);
    const satay = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "peanut-butter"))!;
    expect(recipeAllergens(satay.ingredients).allergens.contains).toContain("peanuts");
    expect(recipeAllergens(satay.ingredients).from.peanuts).toContain(satay.ingredients.find((i) => i.pantry === "peanut-butter")!.label);
    const pesto = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "pesto"))!;
    for (const a of ["milk", "nuts", "eggs"]) expect(has(pesto.id, a), `${pesto.id} ${a}`).toBe(true);
    const pasta = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "pasta-long"))!;
    expect(has(pasta.id, "gluten")).toBe(true);
    const salmon = RECIPES.find((r) => r.ingredients.some((i) => i.pantry === "salmon"))!;
    expect(has(salmon.id, "fish")).toBe(true);
  });

  it("says nothing for a recipe whose ingredients carry no flags", () => {
    expect(recipeAllergens([{ label: "Water" }]).allergens.contains).toEqual([]);
  });
});
