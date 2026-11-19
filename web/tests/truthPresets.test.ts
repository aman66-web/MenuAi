import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyPreset, MOST_PROTEIN, PRESET_IDS, PRESETS, presetsFor, SMALL_APPETITE } from "../lib/mm/truth/presets";
import { itemKind, isMealKind } from "../lib/mm/truth/itemKind";
import { proteinShare } from "../lib/mm/truth/proteinScore";
import type { Chain, MenuItem } from "../lib/mm/types";

let seq = 0;
const it_ = (name: string, calories: number, protein: number | undefined, extra: { sugar?: number; category?: string } = {}): MenuItem => ({
  id: `p${++seq}`,
  name,
  category: extra.category ?? "Mains",
  serving: "",
  nutrients: { calories, ...(protein === undefined ? {} : { protein, carbs: 30, fat: 10 }), ...(extra.sugar === undefined ? {} : { sugar: extra.sugar }) },
  tags: [],
  limitedTime: false,
  rankable: true,
  components: [],
  modifiers: [],
});

describe("applyPreset: the five lists", () => {
  const items = [
    it_("Chicken bowl", 480, 42, { sugar: 4 }),
    it_("Burger", 520, 30, { sugar: 9 }),
    it_("Wrap", 380, 28, { sugar: 3 }),
    it_("Salad", 300, 12, { sugar: 6 }),
    it_("Steak", 700, 55),
    it_("Light plate", 350, 26, { sugar: 2 }),
    it_("Large latte", 250, 14, { category: "Hot drinks", sugar: 18 }),
    it_("Garlic dip", 150, 1, { category: "Dips" }),
    it_("Add bacon", 120, 9, { category: "Add-ons" }),
    it_("Tiny", 90, 20),
  ];
  const names = (id: Parameters<typeof applyPreset>[0]) => applyPreset(id, items).map((i) => i.name);

  it("under 500 calories: meals up to 500 kcal, most protein first, never a drink, dip or add-on", () => {
    expect(names("under-500")).toEqual(["Chicken bowl", "Wrap", "Light plate", "Salad"]);
  });
  it("35 g+ protein: meals with 35 g or more, most protein for their calories first", () => {
    expect(names("protein-35")).toEqual(["Chicken bowl", "Steak"]); // shares 0.35 and 0.31
  });
  it("small appetite: 400 kcal or less with 20 g+ protein, best protein for the calories first", () => {
    expect(names("small-appetite")).toEqual(["Light plate", "Wrap"]); // 0.297 then 0.295 protein share
    for (const i of applyPreset("small-appetite", items)) {
      expect(i.nutrients.calories).toBeLessThanOrEqual(SMALL_APPETITE.maxKcal);
      expect(i.nutrients.protein).toBeGreaterThanOrEqual(SMALL_APPETITE.minProtein);
    }
  });
  it("5 g sugar or less: only meals that publish sugar, lowest first", () => {
    expect(names("sugar-5")).toEqual(["Light plate", "Wrap", "Chicken bowl"]);
  });
  it("most protein for the calories: 250 kcal or more and 20 g+, ranked by protein share (no tiny items at the top)", () => {
    expect(names("most-protein")).toEqual(["Chicken bowl", "Steak", "Light plate", "Wrap", "Burger"]); // shares 0.35, 0.31, 0.30, 0.295, 0.23
    const r = applyPreset("most-protein", items);
    for (let i = 1; i < r.length; i++) expect(proteinShare(r[i - 1].nutrients) as number).toBeGreaterThanOrEqual(proteinShare(r[i].nutrients) as number);
    expect(r.every((m) => m.nutrients.calories >= MOST_PROTEIN.minKcal && (m.nutrients.protein as number) >= MOST_PROTEIN.minProtein)).toBe(true);
    expect(r.map((m) => m.name)).not.toContain("Tiny");
  });
  it("does not change the list it is given", () => {
    const copy = items.map((i) => i.id);
    for (const id of PRESET_IDS) applyPreset(id, items);
    expect(items.map((i) => i.id)).toEqual(copy);
  });
});

describe("presetsFor: a list a chain can't answer is not offered", () => {
  it("calories-only chains offer only the calories list", () => {
    expect(presetsFor({ items: [it_("Pasty", 500, undefined)], nutritionLevel: "calories" }).map((p) => p.id)).toEqual(["under-500"]);
  });
  it("a full chain without any published sugar drops the sugar list", () => {
    expect(presetsFor({ items: [it_("A", 400, 20)] }).map((p) => p.id)).not.toContain("sugar-5");
    expect(presetsFor({ items: [it_("A", 400, 20, { sugar: 3 })] }).map((p) => p.id)).toEqual([...PRESET_IDS]);
  });
  it("every preset says its rule in numbers and makes no claim (rule 3)", () => {
    for (const p of PRESETS) {
      expect(`${p.label} ${p.rule}`).not.toMatch(/\b(good|bad|healthy|healthier|diet|guilt|clean|junk|best choice|top pick|alert)\b/i);
      expect(p.rule.length).toBeGreaterThan(20);
    }
  });
});

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir)
  .filter((f) => f.startsWith("chain-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain)
  .filter((c) => !c.sample);

describe("applyPreset: real menus", () => {
  it("every list of every chain holds only meals that meet the rule, with no duplicates", () => {
    let nonEmpty = 0;
    for (const c of chains) {
      for (const p of presetsFor(c)) {
        const r = applyPreset(p.id, c.items);
        expect(new Set(r.map((i) => i.id)).size).toBe(r.length);
        for (const i of r) {
          expect(isMealKind(itemKind({ name: i.name, category: i.category, calories: i.nutrients.calories }))).toBe(true);
          if (p.id === "under-500") expect(i.nutrients.calories).toBeLessThanOrEqual(500);
          if (p.id === "protein-35") expect(i.nutrients.protein).toBeGreaterThanOrEqual(35);
          if (p.id === "sugar-5") expect(i.nutrients.sugar).toBeLessThanOrEqual(5);
        }
        if (r.length) nonEmpty++;
        // a chain that publishes no protein is never given a protein list (a calories-only chain may still publish sugar)
        if (c.nutritionLevel === "calories") expect(p.needs).not.toBe("protein");
      }
    }
    expect(nonEmpty).toBeGreaterThan(500);
  });
});

// Usability test 2026-11-19 (Elsie, Pizza Express): a restaurant that publishes calories only can't be put in protein order, so its "Under 500 calories"
// list is the biggest meals under the line first, and says so.
describe("Under 500 calories at a calories-only restaurant", () => {
  it("puts the highest calories first", () => {
    const items = [it_("Small side meal", 180, undefined), it_("Leggera pizza", 472, undefined), it_("Pasta", 497, undefined), it_("Big pizza", 900, undefined)];
    expect(applyPreset("under-500", items).map((i) => i.name)).toEqual(["Pasta", "Leggera pizza", "Small side meal"]);
    expect(PRESETS.find((p) => p.id === "under-500")!.ruleCaloriesOnly).toMatch(/highest calories first/);
  });
});
