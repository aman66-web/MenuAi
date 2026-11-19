import { describe, expect, it } from "vitest";
import { GROUP_SHARE, NO_HOUSEHOLD, homeDiet, newPerson, personShare, platesFor, sanitizeHousehold, shareWords, withCount } from "../lib/mm/household";
import { forHousehold, householdCandidate, sanitizePlan, type PlanCandidate } from "../lib/mm/mealPlan";

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
  it("adds the home's allergies and its meat answer to the person's own, and leaves Just me alone", () => {
    const home = { others: [newPerson("a")], allergies: ["peanuts" as const], meat: "vegetarian" as const };
    expect(homeDiet({ noPork: true, avoidAllergens: ["milk"] }, home)).toEqual({ noPork: true, avoidAllergens: ["milk", "peanuts"], vegetarianOnly: true });
    expect(homeDiet({ noPork: true }, { ...home, others: [] })).toEqual({ noPork: true });
    expect(homeDiet({}, { ...home, meat: "vegan" }).veganOnly).toBe(true);
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
});

describe("what is kept", () => {
  it("keeps only ages, portions, a short name, the home's allergies and its meat answer", () => {
    const h = sanitizeHousehold({ others: [{ id: "a", group: "teen", portion: "bigger", name: "  Sam   Smith with a very long name indeed " }, { id: "a", group: "x" }, { id: "b", group: "nope", portion: "nope" }], allergies: ["peanuts", "peanuts", "gravel"], meat: "vegan", email: "x@y.z" });
    expect(h).toEqual({ others: [{ id: "a", group: "teen", portion: "bigger", name: "Sam Smith with a ver" }, { id: "b", group: "adult", portion: "usual" }], allergies: ["peanuts"], meat: "vegan" });
    expect(sanitizeHousehold(null)).toEqual(NO_HOUSEHOLD);
  });
  it("a saved plan keeps the home's ages and portions, never names", () => {
    const ids = Array.from({ length: 7 }, () => ["r1", "r2", "r3"]);
    const p = sanitizePlan({ shops: ["asda"], ids, leaveOut: [], budget: 60, start: "2026-11-23", home: { others: [{ group: "child", portion: "usual", name: "Sam", id: "q" }], allergies: ["peanuts"], meat: "all" } });
    expect(p?.home).toEqual({ others: [{ group: "child", portion: "usual" }], allergies: ["peanuts"], meat: "all" });
    expect(JSON.stringify(p)).not.toContain("Sam");
  });
});
