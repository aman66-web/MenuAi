import { describe, expect, it } from "vitest";
import {
  AGE_MAX, AGE_MIN, CM_PER_INCH, HEIGHT_CM_MAX, HEIGHT_CM_MIN, INCHES_PER_FOOT, KG_PER_LB, LB_PER_STONE, WEIGHT_KG_MAX, WEIGHT_KG_MIN,
  cmToFeetInches, cmToInches, heightFromBoxes, heightInputFromCm, inchesToCm, isPartNumber, kgToLb, kgToStonePounds, lbToKg, parseAge, parseBox, readAge,
  readHeightCm, readWeightKg, toCm, toKg, weightFromBoxes, weightInputFromKg, type HeightInput, type WeightInput,
} from "../lib/mm/bodyUnits";

// Body units for the onboarding plan: exact factors, conversions both ways, the accepted ranges (inclusive), and reading what a text box holds.

describe("exact factors", () => {
  it("uses the factors SPEC §6.2 uses", () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(LB_PER_STONE).toBe(14);
    expect(CM_PER_INCH).toBe(2.54);
    expect(INCHES_PER_FOOT).toBe(12);
    expect(lbToKg(1)).toBe(0.45359237);
    expect(lbToKg(100)).toBeCloseTo(45.359237, 10);
    expect(inchesToCm(1)).toBe(2.54);
    expect(inchesToCm(12)).toBeCloseTo(30.48, 10);
  });
  it("converts back with the same factors", () => {
    expect(kgToLb(lbToKg(172))).toBeCloseTo(172, 10);
    expect(cmToInches(inchesToCm(70))).toBeCloseTo(70, 10);
  });
});

describe("toKg and toCm", () => {
  it("12 st 4 lb is 78.0 kg to one decimal place", () => {
    const kg = toKg({ unit: "st", st: 12, lb: 4 });
    expect(kg).toBeDefined();
    expect(kg!.toFixed(1)).toBe("78.0");
    expect(kg).toBeCloseTo(172 * 0.45359237, 10);
  });
  it("5 ft 10 in is 177.8 cm", () => {
    expect(toCm({ unit: "ft", ft: 5, inch: 10 })).toBeCloseTo(177.8, 10);
    expect(toCm({ unit: "ft", ft: 0, inch: 70 })).toBeCloseTo(177.8, 10);
    expect(toCm({ unit: "ft", ft: 6, inch: 0 })).toBeCloseTo(182.88, 10);
  });
  it("metric values pass through unchanged", () => {
    expect(toKg({ unit: "kg", kg: 70.5 })).toBe(70.5);
    expect(toCm({ unit: "cm", cm: 170.5 })).toBe(170.5);
  });
  it("weight range is 30 to 300 kg, both ends included", () => {
    for (const [kg, ok] of [[29.9, false], [29.99, false], [30, true], [300, true], [300.1, false], [0, false], [-70, false]] as const) {
      expect(toKg({ unit: "kg", kg }) !== undefined, `${kg} kg`).toBe(ok);
    }
    expect(WEIGHT_KG_MIN).toBe(30);
    expect(WEIGHT_KG_MAX).toBe(300);
  });
  it("height range is 100 to 230 cm, both ends included", () => {
    for (const [cm, ok] of [[99, false], [99.9, false], [100, true], [230, true], [231, false], [230.1, false], [0, false], [-170, false]] as const) {
      expect(toCm({ unit: "cm", cm }) !== undefined, `${cm} cm`).toBe(ok);
    }
    expect(HEIGHT_CM_MIN).toBe(100);
    expect(HEIGHT_CM_MAX).toBe(230);
  });
  it("range is checked after converting stone-pounds and feet-inches", () => {
    expect(toKg({ unit: "st", st: 4, lb: 10 })).toBeUndefined(); // 66 lb = 29.9 kg
    expect(toKg({ unit: "st", st: 4, lb: 11 })).toBeDefined(); // 67 lb = 30.4 kg
    expect(toKg({ unit: "st", st: 47, lb: 0 })).toBeDefined(); // 658 lb = 298.5 kg
    expect(toKg({ unit: "st", st: 47, lb: 8 })).toBeUndefined(); // 666 lb = 302.1 kg
    expect(toCm({ unit: "ft", ft: 3, inch: 3 })).toBeUndefined(); // 39 in = 99.06 cm
    expect(toCm({ unit: "ft", ft: 3, inch: 4 })).toBeDefined(); // 40 in = 101.6 cm
    expect(toCm({ unit: "ft", ft: 7, inch: 6 })).toBeDefined(); // 90 in = 228.6 cm
    expect(toCm({ unit: "ft", ft: 7, inch: 7 })).toBeUndefined(); // 91 in = 231.1 cm
  });
  it("refuses anything that is not a usable number", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      expect(toKg({ unit: "kg", kg: bad })).toBeUndefined();
      expect(toCm({ unit: "cm", cm: bad })).toBeUndefined();
      expect(toKg({ unit: "st", st: bad, lb: 0 })).toBeUndefined();
      expect(toKg({ unit: "st", st: 12, lb: bad })).toBeUndefined();
      expect(toCm({ unit: "ft", ft: bad, inch: 0 })).toBeUndefined();
      expect(toCm({ unit: "ft", ft: 5, inch: bad })).toBeUndefined();
    }
    expect(toKg({ unit: "lb" } as unknown as WeightInput)).toBeUndefined();
    expect(toCm({ unit: "in" } as unknown as HeightInput)).toBeUndefined();
  });
  it("refuses a number written as text (kg '70'), and nothing at all (null, undefined) without throwing", () => {
    expect(toKg({ unit: "kg", kg: "70" } as unknown as WeightInput)).toBeUndefined();
    expect(toCm({ unit: "cm", cm: "170" } as unknown as HeightInput)).toBeUndefined();
    expect(toKg({ unit: "st", st: "12", lb: 4 } as unknown as WeightInput)).toBeUndefined();
    expect(toCm({ unit: "ft", ft: 5, inch: "10" } as unknown as HeightInput)).toBeUndefined();
    for (const nothing of [null, undefined, "70", 70]) {
      expect(toKg(nothing as unknown as WeightInput)).toBeUndefined();
      expect(toCm(nothing as unknown as HeightInput)).toBeUndefined();
    }
  });
  it("does not change what it is given", () => {
    const w: WeightInput = Object.freeze({ unit: "st", st: 12, lb: 4 });
    const h: HeightInput = Object.freeze({ unit: "ft", ft: 5, inch: 10 });
    toKg(w);
    toCm(h);
    expect(w).toEqual({ unit: "st", st: 12, lb: 4 });
    expect(h).toEqual({ unit: "ft", ft: 5, inch: 10 });
  });
});

describe("switching units keeps the value", () => {
  it("kilograms to stone-pounds: whole stones, pounds under 14 to one decimal place", () => {
    expect(kgToStonePounds(78.0195)).toEqual({ st: 12, lb: 4 });
    expect(kgToStonePounds(70)).toEqual({ st: 11, lb: 0.3 }); // 154.3 lb
    for (let kg = 31; kg <= 299; kg += 0.7) {
      const { st, lb } = kgToStonePounds(kg);
      expect(Number.isInteger(st)).toBe(true);
      expect(lb).toBeGreaterThanOrEqual(0);
      expect(lb).toBeLessThan(14);
      expect(Math.abs(Math.round(lb * 10) - lb * 10)).toBeLessThan(1e-9);
    }
  });
  it("centimetres to feet-inches: whole feet, inches under 12 to one decimal place", () => {
    expect(cmToFeetInches(177.8)).toEqual({ ft: 5, inch: 10 });
    expect(cmToFeetInches(182.88)).toEqual({ ft: 6, inch: 0 });
    // the inches are exactly one decimal place, with no floating-point tail (180 cm is 70.866 in = 5 ft 10.9 in; 168 cm is 66.14 in = 5 ft 6.1 in)
    expect(cmToFeetInches(180)).toEqual({ ft: 5, inch: 10.9 });
    expect(cmToFeetInches(168)).toEqual({ ft: 5, inch: 6.1 });
    for (let cm = 101; cm <= 229; cm += 0.37) {
      const { ft, inch } = cmToFeetInches(cm);
      expect(Number.isInteger(ft)).toBe(true);
      expect(inch).toBeGreaterThanOrEqual(0);
      expect(inch).toBeLessThan(12);
      expect(Math.abs(Math.round(inch * 10) - inch * 10)).toBeLessThan(1e-9);
    }
  });
  it("round trips stay within the rounding of one decimal place", () => {
    // 0.05 lb = 0.0227 kg and 0.05 in = 0.127 cm at the most
    for (let kg = 31; kg <= 299; kg += 0.37) {
      const back = toKg(weightInputFromKg(kg, "st"));
      expect(back).toBeDefined();
      expect(Math.abs(back! - kg)).toBeLessThanOrEqual(0.05 * KG_PER_LB + 1e-9);
      expect(toKg(weightInputFromKg(kg, "kg"))).toBe(kg);
    }
    for (let cm = 101; cm <= 229; cm += 0.37) {
      const back = toCm(heightInputFromCm(cm, "ft"));
      expect(back).toBeDefined();
      expect(Math.abs(back! - cm)).toBeLessThanOrEqual(0.05 * CM_PER_INCH + 1e-9);
      expect(toCm(heightInputFromCm(cm, "cm"))).toBe(cm);
    }
  });
  it("a whole number of stone-pounds or feet-inches comes back as itself", () => {
    for (const [st, lb] of [[9, 0], [10, 7], [12, 4], [15, 13]] as const) {
      expect(kgToStonePounds(toKg({ unit: "st", st, lb })!)).toEqual({ st, lb });
    }
    for (const [ft, inch] of [[5, 0], [5, 7], [5, 10], [6, 3]] as const) {
      expect(cmToFeetInches(toCm({ unit: "ft", ft, inch })!)).toEqual({ ft, inch });
    }
  });
  it("at the very edge of the range a unit switch stays inside it (30 kg is 66.1 lb is 29.98 kg; 300 kg is 661.4 lb is 300.006 kg; 230 cm is 7 ft 6.6 in is 230.12 cm)", () => {
    // the pounds and inches are rounded to one decimal place, so these land half a decimal outside the range: let through and brought to the edge
    expect(toKg(weightInputFromKg(30, "st"))).toBe(30);
    expect(toKg(weightInputFromKg(300, "st"))).toBe(300);
    expect(toCm(heightInputFromCm(230, "ft"))).toBe(230);
    expect(toCm(heightInputFromCm(100, "ft"))).toBeDefined();
    expect(toKg(weightInputFromKg(31, "st"))).toBeDefined();
    expect(toKg(weightInputFromKg(299, "st"))).toBeDefined();
  });
  it("every value in range, however finely stepped, is still in range after switching to stone-pounds or feet-inches and back", () => {
    for (let kg = 30; kg <= 300; kg = Math.round((kg + 0.01) * 100) / 100) {
      const back = toKg(weightInputFromKg(kg, "st"));
      expect(back, `${kg} kg`).toBeDefined();
      expect(back!, `${kg} kg`).toBeGreaterThanOrEqual(WEIGHT_KG_MIN);
      expect(back!, `${kg} kg`).toBeLessThanOrEqual(WEIGHT_KG_MAX);
    }
    for (let cm = 100; cm <= 230; cm = Math.round((cm + 0.01) * 100) / 100) {
      const back = toCm(heightInputFromCm(cm, "ft"));
      expect(back, `${cm} cm`).toBeDefined();
      expect(back!, `${cm} cm`).toBeGreaterThanOrEqual(HEIGHT_CM_MIN);
      expect(back!, `${cm} cm`).toBeLessThanOrEqual(HEIGHT_CM_MAX);
    }
  });
  it("only the unit switch gets that slack: typed in kg or cm, or in stone-pounds well outside, the range is exact", () => {
    expect(toKg({ unit: "kg", kg: 29.99 })).toBeUndefined();
    expect(toKg({ unit: "kg", kg: 300.01 })).toBeUndefined();
    expect(toCm({ unit: "cm", cm: 99.99 })).toBeUndefined();
    expect(toCm({ unit: "cm", cm: 230.01 })).toBeUndefined();
    expect(toKg({ unit: "st", st: 4, lb: 10 })).toBeUndefined(); // 66 lb = 29.94 kg: more than half a decimal place under
    expect(toCm({ unit: "ft", ft: 7, inch: 7 })).toBeUndefined(); // 91 in = 231.1 cm
  });
});

describe("reading a text box", () => {
  it("reads whole and part numbers, with a point or a comma", () => {
    expect(parseBox("70")).toBe(70);
    expect(parseBox(" 70.5 ")).toBe(70.5);
    expect(parseBox("70,5")).toBe(70.5);
    expect(parseBox("0")).toBe(0);
  });
  it("reads digits typed in another numeral system", () => {
    expect(parseBox("٧٠")).toBe(70); // Arabic-Indic
    expect(parseBox("۱۷۵")).toBe(175); // Urdu
    expect(parseBox("৭০")).toBe(70); // Bengali
    expect(parseBox("૭૦")).toBe(70); // Gujarati
    expect(parseBox("੭੦")).toBe(70); // Gurmukhi
  });
  it("gives undefined for empty, a minus sign, letters or mixed text", () => {
    for (const raw of ["", "   ", "-5", "abc", "12 st", "1.2.3", "5'10", "NaN", "Infinity", "1e3", "--"]) {
      expect(parseBox(raw), JSON.stringify(raw)).toBeUndefined();
    }
  });
  it("weight: kilograms in one box, stones and pounds in two (one may be empty, not both)", () => {
    expect(weightFromBoxes("kg", "78")).toEqual({ unit: "kg", kg: 78 });
    expect(weightFromBoxes("kg", "78", "ignored")).toEqual({ unit: "kg", kg: 78 });
    // a number in the other box is ignored too, not added on
    expect(weightFromBoxes("kg", "78", "5")).toEqual({ unit: "kg", kg: 78 });
    expect(weightFromBoxes("kg", "")).toBeUndefined();
    expect(weightFromBoxes("st", "12", "4")).toEqual({ unit: "st", st: 12, lb: 4 });
    expect(weightFromBoxes("st", "12", "")).toEqual({ unit: "st", st: 12, lb: 0 });
    expect(weightFromBoxes("st", "", "170")).toEqual({ unit: "st", st: 0, lb: 170 });
    expect(weightFromBoxes("st", "", "")).toBeUndefined();
    expect(weightFromBoxes("st", "12", "x")).toBeUndefined();
    expect(weightFromBoxes("st", "x", "4")).toBeUndefined();
    expect(weightFromBoxes("st", "-1", "4")).toBeUndefined();
  });
  it("height: centimetres in one box, feet and inches in two", () => {
    expect(heightFromBoxes("cm", "177,8")).toEqual({ unit: "cm", cm: 177.8 });
    expect(heightFromBoxes("ft", "5", "10")).toEqual({ unit: "ft", ft: 5, inch: 10 });
    expect(heightFromBoxes("ft", "6", "")).toEqual({ unit: "ft", ft: 6, inch: 0 });
    expect(heightFromBoxes("ft", "", "70")).toEqual({ unit: "ft", ft: 0, inch: 70 });
    expect(heightFromBoxes("ft", "", "")).toBeUndefined();
    expect(heightFromBoxes("cm", "tall")).toBeUndefined();
    expect(heightFromBoxes("cm", "177", "5")).toEqual({ unit: "cm", cm: 177 }); // the inches box means nothing in cm
  });
  it("the feet and stone boxes take whole numbers only: '5.10' is how people write 5 ft 10, not 5.1 feet (22 cm shorter)", () => {
    for (const raw of ["5.10", "5,10", "5.8", "5.5", "6.0.1"]) {
      expect(heightFromBoxes("ft", raw, ""), raw).toBeUndefined();
      expect(heightFromBoxes("ft", raw, "10"), raw).toBeUndefined();
      expect(readHeightCm("ft", raw, ""), raw).toBeUndefined();
    }
    for (const raw of ["11.7", "11,7", "12.5", "9.25"]) {
      expect(weightFromBoxes("st", raw, ""), raw).toBeUndefined();
      expect(weightFromBoxes("st", raw, "4"), raw).toBeUndefined();
      expect(readWeightKg("st", raw, ""), raw).toBeUndefined();
    }
    // a whole number written with a point is still whole, and the part goes in the inches / pounds box
    expect(heightFromBoxes("ft", "5.0", "10")).toEqual({ unit: "ft", ft: 5, inch: 10 });
    expect(weightFromBoxes("st", "11,0", "7")).toEqual({ unit: "st", st: 11, lb: 7 });
    expect(readHeightCm("ft", "5", "10")!).toBeCloseTo(177.8, 10);
    expect(readWeightKg("st", "11", "7")!).toBeCloseTo(73.0, 1);
    // pounds and inches (and kg and cm) may be part numbers
    expect(heightFromBoxes("ft", "5", "10.5")).toEqual({ unit: "ft", ft: 5, inch: 10.5 });
    expect(heightFromBoxes("ft", "", "70,5")).toEqual({ unit: "ft", ft: 0, inch: 70.5 });
    expect(weightFromBoxes("st", "11", "7.5")).toEqual({ unit: "st", st: 11, lb: 7.5 });
    expect(weightFromBoxes("kg", "78,5")).toEqual({ unit: "kg", kg: 78.5 });
    expect(heightFromBoxes("cm", "177.8")).toEqual({ unit: "cm", cm: 177.8 });
  });
  it("isPartNumber says when a box holds a fraction (so the screen can point to the inches or pounds box)", () => {
    expect(isPartNumber("5.10")).toBe(true);
    expect(isPartNumber("5,10")).toBe(true);
    expect(isPartNumber("11.7")).toBe(true);
    expect(isPartNumber("٥.١٠")).toBe(true); // Arabic-Indic digits
    for (const raw of ["5", "5.0", "5,0", "11", "", "  ", "abc", "-5", "1.2.3"]) expect(isPartNumber(raw), JSON.stringify(raw)).toBe(false);
  });
  it("readWeightKg and readHeightCm also check the range", () => {
    expect(readWeightKg("kg", "78")!).toBe(78);
    expect(readWeightKg("st", "12", "4")!.toFixed(1)).toBe("78.0");
    expect(readWeightKg("kg", "29.9")).toBeUndefined();
    expect(readWeightKg("kg", "300")).toBe(300);
    expect(readWeightKg("kg", "300.1")).toBeUndefined();
    expect(readWeightKg("st", "", "")).toBeUndefined();
    expect(readHeightCm("cm", "99")).toBeUndefined();
    expect(readHeightCm("cm", "100")).toBe(100);
    expect(readHeightCm("cm", "230")).toBe(230);
    expect(readHeightCm("cm", "231")).toBeUndefined();
    expect(readHeightCm("ft", "5", "10")!).toBeCloseTo(177.8, 10);
    expect(readHeightCm("ft", "", "")).toBeUndefined();
  });
});

describe("the age box", () => {
  it("18 to 100 is ok, 1 to 17 is under 18, the rest is invalid", () => {
    expect(AGE_MIN).toBe(18);
    expect(AGE_MAX).toBe(100);
    expect(readAge("18")).toEqual({ kind: "ok", age: 18 });
    expect(readAge("30")).toEqual({ kind: "ok", age: 30 });
    expect(readAge("100")).toEqual({ kind: "ok", age: 100 });
    expect(readAge("17")).toEqual({ kind: "under18" });
    expect(readAge("1")).toEqual({ kind: "under18" });
    // a part number is not an age, under 18 or not (17.5 must not count as "under 18" and 99.9 must not count as 99)
    for (const raw of ["101", "0", "", "abc", "-5", "30.5", "17.5", "99.9", "0.5", "18.0.1", "1000"]) {
      expect(readAge(raw), JSON.stringify(raw)).toEqual({ kind: "invalid" });
    }
  });
  it("reads digits typed in another numeral system", () => {
    expect(readAge("٣٠")).toEqual({ kind: "ok", age: 30 });
    expect(readAge("৪৫")).toEqual({ kind: "ok", age: 45 });
  });
  it("parseAge is the age only when it is ok", () => {
    expect(parseAge("45")).toBe(45);
    expect(parseAge("17")).toBeUndefined();
    expect(parseAge("101")).toBeUndefined();
    expect(parseAge("")).toBeUndefined();
  });
});
