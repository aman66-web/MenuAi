import { describe, expect, it } from "vitest";
import { ALL_HOME_DIETS, GROUP_SHARE, HOME_DIETS, MORE_HOME_DIETS, NO_HOUSEHOLD, homeDiet, newPerson, noMeatLeft, ownDiets, personShare, platesFor, sanitizeHousehold, shareWords, toggleHomeDiet, withCount } from "../lib/mm/household";
import { kindExcluded, PANTRY } from "../lib/mm/pantry";
import { recipeForDiet } from "../lib/mm/recipes";
import { RECIPES } from "../lib/mm/recipeBook";
import { DEFAULT_SHAPE, forHousehold, householdCandidate, householdReference, sanitizePlan, slotTargets, type PlanCandidate } from "../lib/mm/mealPlan";

// The people a meal plan cooks for (founder 2026-11-19; the 20-agent meeting): kept on the phone, ages and portions only, allergies for the whole home,
// recipes cooked as written and each person's portion measured out of the pot.

describe("a person's share of a grown-up's portion", () => {
  it("is their age group's, a quarter less or more for Smaller or Bigger, never under a quarter", () => {
    expect(GROUP_SHARE).toEqual({ adult: 1, teen: 1.25, child: 0.75, little: 0.5 });
    expect(personShare({ group: "adult", portion: "usual" })).toBe(1);
    expect(personShare({ group: "teen", portion: "bigger" })).toBe(1.5);
    expect(personShare({ group: "child", portion: "smaller" })).toBe(0.5);
    expect(personShare({ group: "little", portion: "smaller" })).toBe(0.25);
  });
  it("is said in plain words", () => {
    expect([1, 1.25, 0.5, 0.75, 2, 1.5, 0.25].map(shareWords)).toEqual(["1", "1¼", "½", "¾", "2", "1½", "¼"]);
  });
});

describe("how many people", () => {
  let n = 0;
  const id = () => `p${++n}`;
  it("adds grown-ups at the usual portion and keeps the cards already filled in", () => {
    const three = withCount(NO_HOUSEHOLD, 3, id);
    expect(three.others.map((p) => [p.group, p.portion])).toEqual([["adult", "usual"], ["adult", "usual"]]);
    const edited = { ...three, others: [{ ...three.others[0]!, group: "child" as const, name: "Sam" }, three.others[1]!] };
    expect(withCount(edited, 2, id).others).toEqual([edited.others[0]]);
    expect(withCount(edited, 1, id).others).toEqual([]);
    expect(withCount(NO_HOUSEHOLD, 99, id).others).toHaveLength(5);
  });
});

describe("the home's diet", () => {
  it("adds the home's allergies and every diet anyone at home follows to the person's own, and leaves Just me alone", () => {
    const home = { others: [newPerson("a")], allergies: ["peanuts" as const], diets: ["vegetarianOnly" as const] };
    expect(homeDiet({ noPork: true, avoidAllergens: ["milk"] }, home)).toEqual({ noPork: true, avoidAllergens: ["milk", "peanuts"], vegetarianOnly: true });
    expect(homeDiet({ noPork: true }, { ...home, others: [] })).toEqual({ noPork: true });
    expect(homeDiet({}, { ...home, diets: ["veganOnly"] }).veganOnly).toBe(true);
    // the newer diets too (founder 2026-11-20: "cater to every single diet"), several at once
    expect(homeDiet({ halalOnly: true }, { ...home, allergies: [], diets: ["jain", "noAlcohol"] })).toEqual({ halalOnly: true, jain: true, noAlcohol: true });
  });
  it("offers every diet the person's own picker knows: the six everyone knows first, the six more behind More diets", () => {
    expect(HOME_DIETS).toEqual(["vegetarianOnly", "veganOnly", "pescatarianOnly", "halalOnly", "noPork", "noBeef"]);
    expect(MORE_HOME_DIETS).toEqual(["jain", "noOnionGarlic", "kosherStyle", "noRedMeat", "noAlcohol", "noHalalKosherMeat"]);
    expect([...HOME_DIETS, ...MORE_HOME_DIETS]).toEqual([...ALL_HOME_DIETS]);
  });
  it("turns one diet on or off, kept in the screen's order", () => {
    expect(toggleHomeDiet([], "noAlcohol")).toEqual(["noAlcohol"]);
    expect(toggleHomeDiet(["noAlcohol"], "vegetarianOnly")).toEqual(["vegetarianOnly", "noAlcohol"]);
    expect(toggleHomeDiet(["vegetarianOnly", "noAlcohol"], "vegetarianOnly")).toEqual(["noAlcohol"]);
  });
  it("every meal fits all of the home's diets: a recipe left out for one is left out for the home", () => {
    const home = { others: [newPerson("a")], allergies: [], diets: ["noOnionGarlic" as const, "kosherStyle" as const] };
    const diet = homeDiet({}, home);
    const allium = RECIPES.find((r) => r.ingredients.some((i) => i.pantry && PANTRY.get(i.pantry)?.allium));
    expect(allium).toBeTruthy();
    expect(recipeForDiet(allium!, diet)).toBeNull();
    for (const r of RECIPES) {
      const fit = recipeForDiet(r, diet);
      if (!fit) continue;
      for (const i of fit.ingredients) { const k = i.pantry ? PANTRY.get(i.pantry) : undefined; if (k) expect(kindExcluded(k, diet)).toBeNull(); }
    }
  });
});

describe("each person's portion of a recipe as written", () => {
  const dinner = { kcal: 600, protein: 40 };
  it("sizes the user to their own meal and another grown-up to the same meal of a 2,000 kcal day", () => {
    // the user eats 1,500 a day: their dinner is 600; a grown-up's dinner on 2,000 a day is 800; a serving as written is 400
    const p = platesFor("dinner", 400, dinner, 1500, [{ id: "a", group: "adult", portion: "usual" }, { id: "b", group: "child", portion: "usual" }]);
    expect(p.servings[0]).toBeCloseTo(1.5);
    expect(p.servings[1]).toBeCloseTo(2);
    expect(p.servings[2]).toBeCloseTo(1.5);
    expect(p.total).toBeCloseTo(5);
  });
  it("keeps snacks just for the user", () => {
    const p = platesFor("snack", 200, { kcal: 200 }, 2000, [{ id: "a", group: "adult", portion: "usual" }]);
    expect(p.servings).toEqual([1, 0]);
    expect(p.total).toBe(1);
  });
});

describe("a plan for a household", () => {
  const cand: PlanCandidate = {
    shop: "asda", meal: "dinner", servings: 4, cost: 1.5, distance: 0, picks: [],
    perServing: { kcal: 400, protein: 30, carbs: 40, fat: 12 },
    recipe: { id: "r1", name: "Chilli" } as PlanCandidate["recipe"], base: { id: "r1", name: "Chilli" } as PlanCandidate["recipe"],
  };
  const sizing = { targets: { dinner: { kcal: 600, protein: 45 } }, yourDailyKcal: 2000, others: [{ group: "adult" as const, portion: "usual" as const }, { group: "child" as const, portion: "usual" as const }] };
  it("buys the recipe as written for everyone, prices the meal for everyone, and shows the user's own portion", () => {
    const c = householdCandidate(cand, sizing);
    // user 600/400 = 1.5 servings; grown-up the same meal of a 2,000 day = 1.5; child 1.5 x 0.75 = 1.125: 4.125 servings in all
    expect(c.plates).toEqual([1.5, 1.5, 1.125]);
    expect(c.cost).toBeCloseTo(1.5 * 4.125);
    expect(c.servings).toBeCloseTo(4 / 4.125);
    expect(c.perServing.kcal).toBeCloseTo(600);
    expect(c.perServing.protein).toBeCloseTo(45);
    expect(c.plain).toBe(cand);
    // sizing again from the sized candidate starts from the plain one: nothing is multiplied twice
    expect(householdCandidate(c, sizing).cost).toBeCloseTo(c.cost);
  });
  it("sizes the rest of the label with the user's portion, so a meal logged from the plan keeps its sugar, salt and fibre (null stays null)", () => {
    const c = householdCandidate({ ...cand, label: { kj: 1700, saturates: 2, sugars: 6, fibre: 4, salt: 1.2 } }, sizing);
    expect(c.label!.sugars).toBeCloseTo(9);
    expect(c.label!.salt).toBeCloseTo(1.8);
    expect(householdCandidate({ ...cand, label: { kj: null, saturates: null, sugars: 6, fibre: null, salt: null } }, sizing).label!.fibre).toBeNull();
  });
  it("comes back the same for the same household, so the plan's memo holds", () => {
    const map = new Map([["dinner" as const, [cand]]]);
    expect(forHousehold(map, sizing)).toBe(forHousehold(map, sizing));
  });

  it("a GLP-1 meal size keeps only the user's own portions small: another grown-up's dinner is still a 2,000 kcal day's", () => {
    // the user eats 1,600 a day with a 450 kcal meal size: their dinner is 450, never the 530 of an even split
    const yours = slotTargets(DEFAULT_SHAPE, { kcal: 1600, protein: 110 }, 450);
    expect(yours.dinner?.kcal).toBe(450);
    const reference = householdReference(DEFAULT_SHAPE);
    const capped = householdCandidate(cand, { targets: yours, yourDailyKcal: 1600, others: [{ group: "adult", portion: "usual" }], referenceTargets: reference });
    // the other grown-up eats a third of 2,000 kcal (rounded to 670, as every meal size is), not 450 x 2,000 / 1,600 = 562.5
    expect(reference.dinner?.kcal).toBe(670);
    expect(capped.plates![1]! * cand.perServing.kcal).toBeCloseTo(670);
    expect(capped.plates![1]! * cand.perServing.kcal).toBeGreaterThan(660);
    // and the user's own portion is still their capped meal
    expect(capped.perServing.kcal).toBeCloseTo(450);
    // without the reference (plans made before): the old sum
    const old = householdCandidate(cand, { targets: yours, yourDailyKcal: 1600, others: [{ group: "adult", portion: "usual" }] });
    expect(old.plates![1]! * cand.perServing.kcal).toBeCloseTo(562.5);
  });

  it("the reference day has no snacks and no meal cap (snacks are just for the user)", () => {
    expect(householdReference({ meals: ["breakfast", "lunch", "dinner"], snacks: 2 })).toEqual(householdReference(DEFAULT_SHAPE));
    expect(householdReference({ meals: ["lunch", "dinner"], snacks: 0 }).dinner?.kcal).toBe(1000);
  });
});

describe("diets that leave no meat", () => {
  it("says so when Halal and No halal or kosher meat are both ticked, from the home or the person's own diet", () => {
    expect(noMeatLeft(["halalOnly", "noHalalKosherMeat"])).toBe(true);
    expect(noMeatLeft(["halalOnly"], { noHalalKosherMeat: true })).toBe(true);
    expect(noMeatLeft(["halalOnly"])).toBe(false);
    expect(noMeatLeft([], { halalOnly: true })).toBe(false);
    expect(noMeatLeft(["noHalalKosherMeat"], { halalOnly: false })).toBe(false);
  });
  it("names the person's own diets as home diets, in the screen's order", () => {
    expect(ownDiets({ noPork: true, vegetarianOnly: true, halalOnly: false, avoidAllergens: ["milk"] })).toEqual(["vegetarianOnly", "noPork"]);
    expect(ownDiets({})).toEqual([]);
  });
});

describe("what is kept", () => {
  it("keeps only ages, portions, a short name, the home's allergies and its diets", () => {
    const h = sanitizeHousehold({ others: [{ id: "a", group: "teen", portion: "bigger", name: "  Sam   Smith with a very long name indeed " }, { id: "a", group: "x" }, { id: "b", group: "nope", portion: "nope" }], allergies: ["peanuts", "peanuts", "gravel"], diets: ["noAlcohol", "jain", "jain", "carnivore", "avoidAllergens"], email: "x@y.z" });
    expect(h).toEqual({ others: [{ id: "a", group: "teen", portion: "bigger", name: "Sam Smith with a ver" }, { id: "b", group: "adult", portion: "usual" }], allergies: ["peanuts"], diets: ["jain", "noAlcohol"] });
    expect(sanitizeHousehold(null)).toEqual(NO_HOUSEHOLD);
  });
  it("reads the meat answer of before 20 November as the diet it meant", () => {
    expect(sanitizeHousehold({ others: [], allergies: [], meat: "vegan" }).diets).toEqual(["veganOnly"]);
    expect(sanitizeHousehold({ others: [], allergies: [], meat: "vegetarian" }).diets).toEqual(["vegetarianOnly"]);
    expect(sanitizeHousehold({ others: [], allergies: [], meat: "all" }).diets).toEqual([]);
    expect(sanitizeHousehold({ others: [], allergies: [], meat: "vegan", diets: ["halalOnly"] }).diets).toEqual(["veganOnly", "halalOnly"]);
  });
  it("a saved plan keeps the home's ages, portions and diets, never names", () => {
    const ids = Array.from({ length: 7 }, () => ["r1", "r2", "r3"]);
    const p = sanitizePlan({ shops: ["asda"], ids, leaveOut: [], budget: 60, start: "2026-11-23", home: { others: [{ group: "child", portion: "usual", name: "Sam", id: "q" }], allergies: ["peanuts"], diets: ["noOnionGarlic", "halalOnly"] } });
    expect(p?.home).toEqual({ others: [{ group: "child", portion: "usual" }], allergies: ["peanuts"], diets: ["halalOnly", "noOnionGarlic"] });
    expect(JSON.stringify(p)).not.toContain("Sam");
    // a plan saved before 20 November, with the meat answer
    const old = sanitizePlan({ shops: ["asda"], ids, leaveOut: [], budget: 60, start: "2026-11-19", home: { others: [{ group: "adult", portion: "usual" }], allergies: [], meat: "vegetarian" } });
    expect(old?.home).toEqual({ others: [{ group: "adult", portion: "usual" }], allergies: [], diets: ["vegetarianOnly"] });
  });
});
