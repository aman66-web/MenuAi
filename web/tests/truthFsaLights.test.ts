import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FSA_KEYS, FSA_PER_100G, FSA_PER_PORTION_HIGH, fsaLight, fsaLights, type FsaKey } from "../lib/mm/truth/fsaLights";
import { percentOfReference, REFERENCE_INTAKE } from "../lib/mm/truth/referenceIntake";
import type { Chain, Nutrients } from "../lib/mm/types";

const n = (extra: Partial<Nutrients>): Nutrients => ({ calories: 500, protein: 20, carbs: 50, fat: 10, ...extra });

describe("FSA colour bands: the guidance's table, at each boundary (weight published, per 100 g)", () => {
  // The serving weighs 200 g, so a figure of g grams is g/2 per 100 g. Boundaries are chosen as per-100 g values doubled.
  const cases: Array<[FsaKey, number, string]> = [
    ["fat", 6.0, "green"], // 3.0 per 100 g: at the low limit, still green
    ["fat", 6.2, "amber"], // 3.1
    ["fat", 20.9, "amber"], // 10.45 per 100 g, and under the 21 g portion limit
    ["saturatedFat", 3.0, "green"], // 1.5
    ["saturatedFat", 3.2, "amber"],
    ["saturatedFat", 5.9, "amber"], // 2.95 per 100 g and under the 6 g portion limit
    ["sugar", 10, "green"], // 5.0
    ["sugar", 10.4, "amber"],
    ["sugar", 26.9, "amber"], // 13.45 per 100 g and under 27 g
    ["salt", 0.6, "green"], // 0.3
    ["salt", 0.8, "amber"],
    ["salt", 1.7, "amber"], // 0.85 per 100 g and under 1.8 g
  ];
  it.each(cases)("%s %f g in a 200 g serving is %s", (key, grams, light) => {
    const r = fsaLight(n({ [key]: grams, weight: 200 }), key);
    expect(r.light).toBe(light);
    expect(r.basis).toBe("per100g");
  });

  it("is red above the per-100 g high figure on a light serving", () => {
    // 100 g serving: 17.6 g fat is 17.6 per 100 g, above 17.5. (It is also under the 21 g portion limit, so this is the per-100 g rule.)
    expect(fsaLight(n({ fat: 17.6, weight: 100 }), "fat")).toMatchObject({ light: "red", basis: "per100g" });
    expect(fsaLight(n({ fat: 17.5, weight: 100 }), "fat")).toMatchObject({ light: "amber", basis: "per100g" });
    expect(fsaLight(n({ salt: 0.76, weight: 50 }), "salt")).toMatchObject({ light: "red", basis: "per100g" }); // 1.52 per 100 g
  });
});

describe("FSA colour bands: the per-portion 'high' figure is red whatever the weight", () => {
  it.each(FSA_KEYS.map((k) => [k, FSA_PER_PORTION_HIGH[k]] as const))("%s over %f g per portion", (key, high) => {
    expect(fsaLight(n({ [key]: high + 0.1 }), key)).toMatchObject({ light: "red", basis: "portion" });
    expect(fsaLight(n({ [key]: high + 0.1, weight: 900 }), key)).toMatchObject({ light: "red", basis: "portion" });
    // exactly the limit is not "over" it
    expect(fsaLight(n({ [key]: high }), key).light).toBeUndefined();
  });
  it("a figure over the portion limit would be red per 100 g anyway for any serving up to 100 g (the two tables agree)", () => {
    for (const key of FSA_KEYS) expect(FSA_PER_PORTION_HIGH[key]).toBeGreaterThan(FSA_PER_100G[key].high);
  });
});

describe("FSA colour bands: no weight means no guess", () => {
  it("amber and green are not shown without a published serving weight", () => {
    const r = fsaLight(n({ fat: 5 }), "fat");
    expect(r).toEqual({ key: "fat", grams: 5, basis: "no-weight" });
    expect(r.light).toBeUndefined();
  });
  it("a zero or bad weight counts as no weight", () => {
    expect(fsaLight(n({ fat: 5, weight: 0 }), "fat").basis).toBe("no-weight");
    expect(fsaLight(n({ fat: 5, weight: Number.NaN }), "fat").basis).toBe("no-weight");
  });
  it("an unpublished figure is 'not-published', never zero", () => {
    expect(fsaLight(n({}), "salt")).toEqual({ key: "salt", basis: "not-published" });
    expect(fsaLight(n({ sodium: 800 }), "salt").basis).toBe("not-published"); // sodium is never turned into salt
  });
  it("drinks are not coloured", () => {
    expect(fsaLight(n({ sugar: 40, weight: 300 }), "sugar", true)).toMatchObject({ basis: "drink", grams: 40 });
    expect(fsaLight(n({ sugar: 40, weight: 300 }), "sugar", true).light).toBeUndefined();
  });
  it("lists the four, in label order", () => {
    expect(fsaLights(n({ fat: 30, saturatedFat: 8, sugar: 3, salt: 2.5 })).map((r) => [r.key, r.light])).toEqual([
      ["fat", "red"],
      ["saturatedFat", "red"],
      ["sugar", undefined],
      ["salt", "red"],
    ]);
  });
});

describe("percentOfReference: UK reference intakes (energy 2,000 kcal; fat 70, saturates 20, carbs 260, sugars 90, protein 50, salt 6)", () => {
  it("pins the published reference intakes", () => {
    expect(REFERENCE_INTAKE).toEqual({ calories: 2000, fat: 70, saturatedFat: 20, carbs: 260, sugar: 90, protein: 50, salt: 6 });
  });
  it("works out whole-number percentages", () => {
    expect(percentOfReference({ calories: 400 }, "calories")).toBe(20);
    expect(percentOfReference({ protein: 25 }, "protein")).toBe(50);
    expect(percentOfReference({ salt: 1.5 }, "salt")).toBe(25);
    expect(percentOfReference({ fat: 35 }, "fat")).toBe(50);
    expect(percentOfReference({ saturatedFat: 5 }, "saturatedFat")).toBe(25);
    expect(percentOfReference({ sugar: 9 }, "sugar")).toBe(10);
    expect(percentOfReference({ carbs: 130 }, "carbs")).toBe(50);
  });
  it("is undefined for an unpublished or invalid figure", () => {
    expect(percentOfReference({}, "salt")).toBeUndefined();
    expect(percentOfReference({ salt: -1 }, "salt")).toBeUndefined();
    expect(percentOfReference({ salt: Number.NaN }, "salt")).toBeUndefined();
  });
});

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir)
  .filter((f) => f.startsWith("chain-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain)
  .filter((c) => !c.sample);

describe("FSA lights: real menus", () => {
  it("every item of every chain gets four well-formed results, and colours only appear with the evidence for them", () => {
    let withWeight = 0;
    let red = 0;
    let total = 0;
    for (const c of chains) {
      for (const it of c.items) {
        for (const r of fsaLights(it.nutrients)) {
          total++;
          if (r.light === undefined) {
            expect(["no-weight", "not-published"]).toContain(r.basis);
          } else {
            expect(["red", "amber", "green"]).toContain(r.light);
            if (r.light !== "red" || r.basis === "per100g") expect(it.nutrients.weight).toBeGreaterThan(0);
            if (r.basis === "portion") {
              expect(r.light).toBe("red");
              expect(r.grams).toBeGreaterThan(FSA_PER_PORTION_HIGH[r.key]);
            }
            if (r.basis === "per100g") withWeight++;
            if (r.light === "red") red++;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(36000 * 4 - 1);
    expect(withWeight).toBeGreaterThan(1000);
    expect(red).toBeGreaterThan(1000);
  });
});
