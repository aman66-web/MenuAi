import { describe, expect, it } from "vitest";
import { weekAverage, WEEK_DAYS } from "../lib/mm/weekAverage";
import type { Nutrients } from "../lib/mm/types";

/** An entry `daysAgo` days before 20 October 2026 at hour `h` (local time). */
const at = (daysAgo: number, h: number, m = 0) => new Date(2026, 9, 20 - daysAgo, h, m).toISOString();
const entry = (loggedAt: string, nutrients: Nutrients) => ({ loggedAt, nutrients });
const SHOWN = new Date(2026, 9, 20, 15, 30);

describe("weekAverage: the last 7 days ending on the shown day", () => {
  it("averages calories and protein over the days that have food, never counting an empty day as zero", () => {
    const log = [
      entry(at(0, 8), { calories: 500, protein: 30, carbs: 50, fat: 10 }),
      entry(at(0, 13), { calories: 700, protein: 40, carbs: 60, fat: 20 }),
      entry(at(2, 19), { calories: 1800, protein: 90, carbs: 200, fat: 60 }),
      entry(at(6, 9), { calories: 900, protein: 50, carbs: 100, fat: 30 }),
    ];
    // three days with food: (1200 + 1800 + 900) / 3 = 1300 kcal, (70 + 90 + 50) / 3 = 70 g
    expect(weekAverage(log, SHOWN)).toEqual({ days: 3, calories: 1300, protein: 70 });
    expect(WEEK_DAYS).toBe(7);
  });

  it("starts at local midnight six days before and ends at the end of the shown day", () => {
    const log = [
      entry(at(7, 23, 59), { calories: 5000, protein: 300 }), // the day before the window
      entry(at(6, 0, 0), { calories: 400, protein: 20 }), // the window's first minute
      entry(at(-1, 0, 0), { calories: 9000, protein: 900 }), // the day after the shown day
      entry(at(0, 23, 59), { calories: 600, protein: 40 }), // the shown day's last minute
    ];
    expect(weekAverage(log, SHOWN)).toEqual({ days: 2, calories: 500, protein: 30 });
  });

  it("is the same for any time of the shown day (it is the day that counts)", () => {
    const log = [entry(at(1, 12), { calories: 1000, protein: 50 })];
    expect(weekAverage(log, new Date(2026, 9, 20, 0, 0))).toEqual(weekAverage(log, new Date(2026, 9, 20, 23, 59)));
  });

  it("leaves the protein average out when any entry in the window has no protein figure (never a 0)", () => {
    const log = [
      entry(at(0, 8), { calories: 500, protein: 30 }),
      entry(at(3, 8), { calories: 300 }), // typed in with calories only
    ];
    expect(weekAverage(log, SHOWN)).toEqual({ days: 2, calories: 400, protein: null });
    // an entry without protein outside the window doesn't matter
    expect(weekAverage([entry(at(0, 8), { calories: 500, protein: 30 }), entry(at(9, 8), { calories: 300 })], SHOWN)).toEqual({ days: 1, calories: 500, protein: 30 });
  });

  it("is null when no day in the window has food", () => {
    expect(weekAverage([], SHOWN)).toBeNull();
    expect(weekAverage([entry(at(8, 12), { calories: 500, protein: 30 })], SHOWN)).toBeNull();
  });

  it("skips an entry whose time can't be read", () => {
    expect(weekAverage([entry("not a date", { calories: 500, protein: 30 }), entry(at(0, 9), { calories: 800, protein: 60 })], SHOWN)).toEqual({ days: 1, calories: 800, protein: 60 });
  });

  it("counts days in local time across the clocks going back (25 October 2026 in the UK)", () => {
    // the window for 27 October runs from 21 to 27 October; 25 October is 25 hours long in London but still one day
    const shown = new Date(2026, 9, 27, 12);
    const log = [
      entry(new Date(2026, 9, 21, 0, 30).toISOString(), { calories: 600, protein: 30 }),
      entry(new Date(2026, 9, 25, 23, 30).toISOString(), { calories: 1000, protein: 50 }),
      entry(new Date(2026, 9, 20, 23, 59).toISOString(), { calories: 9999, protein: 999 }),
    ];
    expect(weekAverage(log, shown)).toEqual({ days: 2, calories: 800, protein: 40 });
  });

  it("returns the raw averages: the page rounds them as it rounds Today's figures", () => {
    const log = [entry(at(0, 8), { calories: 1001, protein: 20.4 }), entry(at(1, 8), { calories: 1000, protein: 20.4 }), entry(at(2, 8), { calories: 1000, protein: 20.5 })];
    const avg = weekAverage(log, SHOWN)!;
    expect(avg.calories).toBeCloseTo(1000.333, 2);
    expect(avg.protein).toBeCloseTo(20.433, 2);
  });
});
