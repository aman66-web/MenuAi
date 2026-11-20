import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllHalal } from "../lib/mm/halal";
import { passesDiet } from "../lib/mm/menu-view";
import { FREE_PRESET_RESULTS } from "../lib/mm/paid";
import { SHOWCASE_GROUPS, SHOWCASE_HEADING, dishFits, presetOrder, showcaseCandidates, showcaseChips, showcasePrefs, type ShowcasePreset } from "../lib/mm/showcase";
import { itemKind } from "../lib/mm/truth/itemKind";
import { applyPreset } from "../lib/mm/truth/presets";
import { ALLERGEN_KEYS, type AllergenKey, type Chain, type Goal, type Manifest, type Preferences } from "../lib/mm/types";

// Step 3 against the real menus (public/menus; the onboarding redesign meeting of 20 November 2026, build list 2): every goal × diet × common allergen gives two
// real mains at each chip (never a side, sauce, drink, kids' dish, sharing box or limited-time item), each the restaurant's own figures, under a heading that
// names the list really used; or no chip at all, and the screen shows its plain line instead.

const manifest = JSON.parse(readFileSync("public/menus/menus-manifest.json", "utf8")) as Manifest;
const menus = new Map<string, Chain>();
const menu = (id: string): Chain => {
  if (!menus.has(id)) menus.set(id, JSON.parse(readFileSync(`public/menus/chain-${id}.json`, "utf8")) as Chain);
  return menus.get(id)!;
};
const candidates = showcaseCandidates(manifest.chains);

const BASE: Preferences = { vegetarianOnly: false, noPork: false, noBeef: false };
const DIETS: Record<string, Preferences> = {
  none: BASE,
  vegan: { ...BASE, veganOnly: true },
  vegetarian: { ...BASE, vegetarianOnly: true },
  pescatarian: { ...BASE, pescatarianOnly: true },
  halal: { ...BASE, halalOnly: true },
};
const GOALS: Goal[] = ["lose", "maintain", "buildMuscle", "glp1", "other"];
const ALLERGENS: Array<AllergenKey | null> = [null, ...ALLERGEN_KEYS];

describe("step 3 against the real menus", () => {
  it("offers only real restaurants that publish protein, from the meeting's groups", () => {
    for (const { group, chainIds } of candidates) {
      const listed = SHOWCASE_GROUPS.find((g) => g.id === group)!.chains as readonly string[];
      for (const id of chainIds) {
        expect(listed).toContain(id);
        const c = menu(id);
        expect(c.sample, id).toBe(false);
        expect(c.nutritionLevel, id).not.toBe("calories");
      }
    }
  });

  it("shows McDonald's, Greggs, Costa and Nando's on a plain run (Most protein for the calories)", () => {
    const { chips, pending } = showcaseChips(candidates, menu, "maintain", BASE);
    expect(pending).toEqual([]);
    expect(chips.map((c) => c.chainId)).toEqual(["mcdonalds", "greggs", "costa", "nandos"]);
    expect(chips.every((c) => c.preset === "most-protein" && !c.fallback)).toBe(true);
  });

  for (const goal of GOALS) {
    for (const [diet, prefs] of Object.entries(DIETS)) {
      it(`${goal} × ${diet} × every allergen: two real mains per chip, or the plain line`, () => {
        for (const allergen of ALLERGENS) {
          const p: Preferences = allergen ? { ...prefs, avoidAllergens: [allergen] } : prefs;
          const label = `${goal}/${diet}/${allergen ?? "none"}`;
          const { chips, pending } = showcaseChips(candidates, menu, goal, p);
          expect(pending, label).toEqual([]);
          // at most one chip per kind of place, in the groups' order
          expect(chips.map((c) => c.group), label).toEqual(SHOWCASE_GROUPS.map((g) => g.id).filter((g) => chips.some((c) => c.group === g)));
          for (const chip of chips) {
            const c = menu(chip.chainId);
            const at = `${label} at ${chip.chainId}`;
            // the heading names the list really used, from the goal's order
            const order = presetOrder(goal);
            expect(order, at).toContain(chip.preset);
            expect(chip.heading, at).toBe(SHOWCASE_HEADING[chip.preset as ShowcasePreset]);
            expect(chip.fallback, at).toBe(chip.preset !== order[0]);
            const kept = c.items.filter((i) => dishFits(c, i, p));
            expect(chip.dishes, at).toHaveLength(FREE_PRESET_RESULTS);
            const inList = new Set(applyPreset(chip.preset, kept).map((i) => i.id));
            for (const d of chip.dishes) {
              const item = c.items.find((i) => i.id === d.itemId)!;
              expect(item, `${at}: ${d.itemId}`).toBeDefined();
              expect(inList.has(item.id), `${at}: ${item.name} is in ${chip.preset}`).toBe(true);
              // a real main: never a side, sauce, drink, dessert, add-on, kids' dish, sharing box or limited-time item
              expect(itemKind({ name: item.name, category: item.category, calories: item.nutrients.calories }), `${at}: ${item.name}`).toBe("main");
              expect(item.limitedTime, `${at}: ${item.name}`).toBe(false);
              expect(`${item.name} ${item.serving}`, at).not.toMatch(/share ?box|sharer|bucket|\d+\s*pack|serves\s*\d/i);
              expect(item.category, at).not.toMatch(/kids|children|side|drink|frapp|sauce|dip/i);
              // the diet and the allergen, as the app's own filter checks them
              expect(passesDiet(item, showcasePrefs(p)), `${at}: ${item.name}`).toBe(true);
              if (allergen) expect(item.allergens && !item.allergens.contains.includes(allergen) && !item.allergens.mayContain.includes(allergen), `${at}: ${item.name}`).toBe(true);
              // the restaurant's own figures, untouched (rule 1)
              expect([d.kcal, d.protein, d.name], at).toEqual([item.nutrients.calories, item.nutrients.protein, item.name]);
              if (d.serving !== undefined) expect(d.serving, at).toBe(item.serving.trim());
            }
            expect(chip.dishes[0]!.itemId, at).not.toBe(chip.dishes[1]!.itemId);
          }
          // halal is chain-level: only a restaurant that says all its food is halal (none of the four groups' restaurants does today: the plain line)
          if (diet === "halal") expect(chips.every((c) => isAllHalal(c.chainId)), label).toBe(true);
        }
      });
    }
  }
});
