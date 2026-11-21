import { describe, expect, it } from "vitest";
import { DISH_FORMS, MAX_WRAPS_A_WEEK, dishForm, dishFormOf, varietyFaults, varietyReport, type DishForm } from "../lib/mm/dishForm";
import { exampleWeek } from "../lib/mm/exampleWeek";
import { RECIPES } from "../lib/mm/recipeBook";
import type { DietPrefs } from "../lib/mm/pantry";

// What kind of dish each recipe is, for a varied week (founder 2026-11-20: "a lot of them are to do with wraps ... You want kind of like a varied diet ... You
// can't just do wraps every single day"). Checked on every recipe in the book.

const byId = new Map(RECIPES.map((r) => [r.id, r]));
const form = (id: string) => dishForm(byId.get(id)!);
const kinds = (id: string) => byId.get(id)!.ingredients.map((i) => i.pantry ?? i.key);

describe("every recipe's dish form", () => {
  it("is one of the forms, worked out from the recipe itself", () => {
    for (const r of RECIPES) expect(DISH_FORMS as readonly string[], r.id).toContain(dishForm(r));
    expect(dishFormOf(RECIPES[0]!)).toBe(dishForm(RECIPES[0]!));
  });

  it("calls anything made with tortilla wraps a wrap (burritos, fajitas, quesadillas, a wrap pizza), and nothing else", () => {
    for (const r of RECIPES) {
      if (/\bsoups?\b/i.test(r.name)) continue;
      expect(dishForm(r) === "wrap", r.name).toBe(kinds(r.id).includes("wraps"));
    }
    for (const id of ["bean-pepper-fajitas", "cheese-bean-quesadillas", "mushroom-wrap-pizzas", "breakfast-burrito", "chicken-fajitas"]) expect(form(id), id).toBe("wrap");
  });

  it("calls a soup a soup, even with toast, and a curry, stew or chilli a curry", () => {
    for (const r of RECIPES) if (/\bsoups?\b|\bminestrone\b/i.test(r.name)) expect(dishForm(r), r.name).toBe("soup");
    expect(form("spiced-carrot-chickpea-soup")).toBe("soup");
    for (const id of ["chicken-curry", "chickpea-curry", "bean-chilli", "beef-chilli", "moroccan-chickpea-stew", "chicken-jalfrezi", "bean-vegetable-goulash"]) expect(form(id), id).toBe("curry");
  });

  it("reads the dish before 'with': a fish or meat plate is not its side ('Salmon with lemon rice', 'Potato cakes with salad')", () => {
    expect(form("salmon-lemon-rice-broccoli")).toBe("fish");
    expect(form("salmon-new-potatoes-peas")).toBe("fish");
    expect(form("lemon-garlic-chicken-potatoes")).toBe("meat");
    expect(form("cheese-onion-potato-cakes")).toBe("fritters");
    expect(form("bbq-chicken-thigh-skewers")).toBe("meat");
  });

  it("tells the breakfasts apart: porridge, toast, eggs, a fry-up, pancakes, a smoothie, cereal, a yogurt bowl", () => {
    expect(form("apple-cinnamon-porridge")).toBe("porridge");
    expect(form("banana-berry-overnight-oats")).toBe("porridge");
    expect(form("scrambled-eggs-on-toast")).toBe("toast");
    expect(form("smoky-tomato-beans-toast")).toBe("toast");
    expect(form("mushroom-cheddar-omelette")).toBe("eggs");
    expect(form("shakshuka")).toBe("eggs");
    expect(form("grilled-full-english")).toBe("fryUp");
    expect(form("oat-pancakes")).toBe("pancakes");
    expect(form("berry-banana-smoothie")).toBe("smoothie");
    expect(form("wheat-biscuits-berries")).toBe("cereal");
    expect(form("greek-yogurt-granola")).toBe("yogurt");
  });

  it("tells the lunches and dinners apart: salads, sandwiches, pasta (a pasta salad too), noodles and stir-fries, rice, bakes, traybakes", () => {
    expect(form("chickpea-tomato-salad")).toBe("salad");
    expect(form("tuna-bean-salad")).toBe("salad");
    expect(form("roasted-pepper-houmous-sandwiches")).toBe("sandwich");
    expect(form("spaghetti-bolognese")).toBe("pasta");
    expect(form("tuna-sweetcorn-pasta-salad")).toBe("pasta");
    expect(form("chicken-chow-mein")).toBe("noodles");
    expect(form("sweet-chilli-chicken")).toBe("noodles");
    expect(form("mexican-bean-rice-bowl")).toBe("rice");
    expect(form("smoked-salmon-kedgeree")).toBe("rice");
    expect(form("cottage-pie")).toBe("bake");
    expect(form("chickpea-potato-traybake")).toBe("traybake");
  });

  it("tells the snacks apart: dips, nuts, fruit, bites", () => {
    expect(form("houmous-veg-sticks")).toBe("dip");
    expect(form("paprika-roasted-almonds")).toBe("nuts");
    expect(form("baked-cinnamon-apple-slices")).toBe("fruit");
    expect(form("banana-oat-cookies")).toBe("bites");
  });

  it("gives each meal of the book plenty of forms to vary between (measured 20 November 2026: 13 breakfast, 10 lunch, 14 dinner, 8 snack)", () => {
    const by = (meal: string) => new Set(RECIPES.filter((r) => r.meal === meal).map((r) => dishForm(r)));
    expect(by("breakfast").size).toBeGreaterThanOrEqual(10);
    expect(by("lunch").size).toBeGreaterThanOrEqual(8);
    expect(by("dinner").size).toBeGreaterThanOrEqual(10);
    expect(by("snack").size).toBeGreaterThanOrEqual(5);
    // wraps are a few of each meal, never most of them
    for (const meal of ["breakfast", "lunch", "dinner"]) {
      const list = RECIPES.filter((r) => r.meal === meal);
      expect(list.filter((r) => dishForm(r) === "wrap").length / list.length, meal).toBeLessThan(0.2);
    }
  });
});

describe("how varied a week is", () => {
  const w = (...days: string[]) => days.map((d) => d.split(" ") as DishForm[]);

  it("counts a form twice in a day, a form in the same meal two days running, and each wrap over two", () => {
    expect(varietyFaults(w("porridge salad curry", "eggs soup pasta", "toast sandwich rice"))).toBe(0);
    expect(varietyReport(w("eggs eggs curry"))).toEqual({ sameDay: 1, dayAfter: 0, wraps: 0 });
    expect(varietyReport(w("porridge salad curry", "eggs salad pasta"))).toEqual({ sameDay: 0, dayAfter: 1, wraps: 0 });
    // a wrap at lunch and one at dinner the next day: two wraps, no fault; a third is one
    expect(varietyFaults(w("porridge wrap curry", "eggs soup wrap"))).toBe(0);
    expect(varietyFaults(w("porridge wrap curry", "eggs soup wrap", "wrap salad pasta"))).toBe(1);
    expect(varietyReport(w("wrap wrap wrap", "wrap wrap wrap"))).toEqual({ sameDay: 4, dayAfter: 3, wraps: 6 });
    expect(varietyFaults(w("wrap wrap wrap", "wrap wrap wrap"))).toBe(4 + 3 + (6 - MAX_WRAPS_A_WEEK));
    // a slot with no recipe counts for nothing
    expect(varietyFaults([[undefined, "salad"], [undefined, "soup"]])).toBe(0);
  });
});

describe("Your plan's example week is varied (founder 2026-11-20: \"You can't just do wraps every single day\")", () => {
  const forms = (diet: DietPrefs) => exampleWeek(diet).map((d) => d.meals.map((m) => dishForm(byId.get(m.recipeId)!)));
  // measured 20 November 2026: no form twice in a day, none in the same meal two days running, at most 2 wraps, for each of these diets
  const diets: DietPrefs[] = [{}, { veganOnly: true }, { vegetarianOnly: true }, { pescatarianOnly: true }, { halalOnly: true }, { avoidAllergens: ["milk", "gluten"] }, { noPork: true, avoidAllergens: ["eggs"] }];

  it("never has a form twice in a day or in a meal two days running, and at most two wraps", () => {
    for (const diet of diets) expect(varietyReport(forms(diet)), JSON.stringify(diet)).toEqual({ sameDay: 0, dayAfter: 0, wraps: expect.any(Number) });
    for (const diet of diets) expect(varietyReport(forms(diet)).wraps, JSON.stringify(diet)).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
  });

  it("is as varied as a short list allows (Jain: few breakfasts, no lunch or dinner with a picture)", () => {
    const week = forms({ jain: true });
    expect(varietyReport(week).wraps).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
    expect(varietyReport(week).dayAfter).toBe(0);
  });
});
