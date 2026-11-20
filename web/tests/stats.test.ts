import { describe, expect, it } from "vitest";
import { averageOf, calorieStats, dayValue, macroStats, nutrientStats, rangeDates, scaleTop, sharesOf, statsDays, weeklyCalories, type StatsEntry } from "../lib/mm/stats";
import { dayLabelTotals, todayLabelTotals } from "../lib/mm/labelTotals";
import { weekSummary } from "../lib/mm/week";

// The Stats screen behind Home's numbers (founder 2026-11-20): every figure from the food log, a day with nothing logged never a 0, today never in an
// average, a food without a figure left out and counted as left out.

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();
const food = (when: string, nutrients: StatsEntry["nutrients"], estimate = false): StatsEntry => ({ loggedAt: when, nutrients, ...(estimate ? { estimate: true as const } : {}) });
const thursday = new Date(2026, 10, 19, 20, 0); // Thursday 19 November 2026

describe("the days", () => {
  it("adds each day's foods, keeps a day with nothing logged empty, and shows nothing after today", () => {
    const log = [food(at(2026, 10, 16), { calories: 500, protein: 30 }), food(at(2026, 10, 16, 19), { calories: 700 }), food(at(2026, 10, 21), { calories: 900, protein: 40 })];
    const days = statsDays(log, rangeDates(thursday, "week"), thursday);
    expect(days.map((d) => d.state)).toEqual(["past", "past", "past", "today", "future", "future", "future"]);
    expect(days.map((d) => d.entries)).toEqual([2, 0, 0, 0, 0, 0, 0]);
    expect(dayValue(days[0]!, "calories")).toBe(1200);
    expect(dayValue(days[0]!, "protein")).toBe(30);
    expect(days[0]!.figures.protein.count).toBe(1);
    expect(dayValue(days[1]!, "calories")).toBeNull(); // nothing logged: never 0
    expect(dayValue(days[5]!, "calories")).toBeNull(); // a food dated in the future is not shown
  });
  it("puts 23:59 and 00:01 on their own local days and skips a time that can't be read", () => {
    const log = [food(at(2026, 10, 17, 23, 59), { calories: 300 }), food(at(2026, 10, 18, 0, 1), { calories: 200 }), { loggedAt: "nope", nutrients: { calories: 9 } }];
    const days = statsDays(log, rangeDates(thursday, "week"), thursday);
    expect(dayValue(days[1]!, "calories")).toBe(300);
    expect(dayValue(days[2]!, "calories")).toBe(200);
    expect(days.reduce((s, d) => s + d.entries, 0)).toBe(2);
  });
  it("averages only the days before today that gave the figure", () => {
    const log = [food(at(2026, 10, 16), { calories: 1000, sugar: 20 }), food(at(2026, 10, 17), { calories: 1500 }), food(at(2026, 10, 18), { calories: 900, sugar: 40 }), food(at(2026, 10, 19), { calories: 400, sugar: 90 })];
    const days = statsDays(log, rangeDates(thursday, "week"), thursday);
    expect(averageOf(days, "calories")).toEqual({ average: 3400 / 3, days: 3 });
    expect(averageOf(days, "sugar")).toEqual({ average: 30, days: 2 }); // Tuesday gave no sugar; today is still going
  });
  it("tops a chart's scale at the target or the highest day, plus 15%, and never at 0", () => {
    const days = statsDays([food(at(2026, 10, 17), { calories: 3000 })], rangeDates(thursday, "week"), thursday);
    expect(scaleTop(days, "calories", 2000)).toBeCloseTo(3450);
    expect(scaleTop(days, "protein", 150)).toBeCloseTo(172.5);
    expect(scaleTop(days, "sugar")).toBeCloseTo(1.15);
  });
});

describe("shares", () => {
  it("are whole numbers that add up to exactly 100", () => {
    expect(sharesOf([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesOf([100, 250, 70])!.reduce((s, v) => s + v, 0)).toBe(100);
    expect(sharesOf([50, 0, 50])).toEqual([50, 0, 50]);
    expect(sharesOf([0, 0, 0])).toBeNull();
  });
});

describe("calories", () => {
  it("this week agrees with Home's week card exactly", () => {
    const log = [food(at(2026, 10, 16), { calories: 1800, protein: 90 }), food(at(2026, 10, 16, 19), { calories: 200, protein: 10 }), food(at(2026, 10, 18), { calories: 1600 }), food(at(2026, 10, 19), { calories: 900 })];
    const s = calorieStats(log, thursday, "week", 2000);
    const home = weekSummary(log.map((e) => ({ loggedAt: e.loggedAt, nutrients: { calories: e.nutrients.calories!, protein: e.nutrients.protein } })), thursday, 2000);
    expect(s.average).toBe(home.caloriesAverage);
    expect(s.countedDays).toBe(home.countedDays);
    expect(s.days.map((d) => d.figures.calories.total)).toEqual(home.days.map((d) => d.calories));
    expect(s.scaleTop).toBeCloseTo(home.scaleTop);
    expect(s.average).toBe(1800);
  });
  it("the last 4 weeks are 28 days, Monday three weeks back to this Sunday, averaged over the days logged before today", () => {
    const dates = rangeDates(thursday, "4weeks");
    expect(dates).toHaveLength(28);
    expect(dates[0]!.getDay()).toBe(1);
    expect(dates[0]!.getDate()).toBe(26); // Monday 26 October
    expect(dates[27]!.getDate()).toBe(22); // Sunday 22 November
    const log = [food(at(2026, 9, 26), { calories: 1000 }), food(at(2026, 9, 25), { calories: 9999 }), food(at(2026, 10, 10), { calories: 2000 }), food(at(2026, 10, 19), { calories: 5000 })];
    const s = calorieStats(log, thursday, "4weeks", 2000);
    expect(s.countedDays).toBe(2); // 25 October is before the range; today is still going
    expect(s.average).toBe(1500);
  });
  it("the last 4 weeks as a bar a week: each week's calories a day over its logged days before today, this week's equal to the week's own figure", () => {
    const log = [
      food(at(2026, 9, 26), { calories: 1000 }), food(at(2026, 9, 27), { calories: 2000 }), // week of 26 October
      // nothing in the week of 2 November
      food(at(2026, 10, 10), { calories: 2400 }), // week of 9 November
      food(at(2026, 10, 16), { calories: 1800 }), food(at(2026, 10, 18), { calories: 1600 }), food(at(2026, 10, 19), { calories: 5000 }), // this week; today still going
    ];
    const weeks = weeklyCalories(calorieStats(log, thursday, "4weeks", 2000).days);
    expect(weeks.map((w) => w.start.getDate())).toEqual([26, 2, 9, 16]);
    expect(weeks.map((w) => w.current)).toEqual([false, false, false, true]);
    expect(weeks.map((w) => w.average)).toEqual([1500, null, 2400, 1700]);
    expect(weeks.map((w) => w.days)).toEqual([2, 0, 1, 2]);
    expect(weeks[3]!.average).toBe(calorieStats(log, thursday, "week", 2000).average);
  });
  it("has no average when nothing before today was logged, and notes photo estimates", () => {
    const s = calorieStats([food(at(2026, 10, 19, 8), { calories: 400 }, true)], thursday, "week", 2000);
    expect(s.average).toBeNull();
    expect(s.countedDays).toBe(0);
    expect(s.estimates).toBe(true);
    expect(calorieStats([], thursday, "week", 2000).estimates).toBe(false);
  });
});

describe("protein, carbs and fat", () => {
  it("averages each over the days that gave it and splits the week by weight from foods with all three", () => {
    const log = [
      food(at(2026, 10, 16), { calories: 600, protein: 40, carbs: 50, fat: 10 }),
      food(at(2026, 10, 17), { calories: 700 }), // a calories-only restaurant
      food(at(2026, 10, 19), { calories: 500, protein: 20, carbs: 30, fat: 50 }),
    ];
    const m = macroStats(log, thursday, { protein: 150, carbs: 200, fat: 70 });
    expect(m.macros.protein).toMatchObject({ average: 40, days: 1 }); // today's 20 is not in the average
    expect(m.macros.fat.scaleTop).toBeCloseTo(80.5);
    expect(m.split!.grams).toEqual({ protein: 60, carbs: 80, fat: 60 }); // today counts in the week's split
    expect(m.split!.shares).toEqual({ protein: 30, carbs: 40, fat: 30 });
    expect(m.gap).toBe(true);
    expect(dayValue(m.days[1]!, "protein")).toBeNull();
  });
  it("has no split when nothing this week gave all three, and ignores last week", () => {
    const m = macroStats([food(at(2026, 10, 12), { calories: 600, protein: 40, carbs: 50, fat: 10 })], thursday, {});
    expect(m.split).toBeNull();
    expect(m.gap).toBe(false);
    expect(m.macros.carbs.average).toBeNull();
  });
});

describe("sugar, saturates, salt and fibre", () => {
  it("takes today's figures from labelTotals and averages the week over the days before today that gave each", () => {
    const log = [
      food(at(2026, 10, 16), { calories: 500, sugar: 10, salt: 1.2, saturatedFat: 4 }),
      food(at(2026, 10, 16, 18), { calories: 400, sugar: 6 }),
      food(at(2026, 10, 17), { calories: 300 }),
      food(at(2026, 10, 19, 8), { calories: 200, sugar: 12, fiber: 3 }),
      food(at(2026, 10, 19, 9), { calories: 100 }),
    ];
    const n = nutrientStats(log, thursday);
    expect(n.todayEntries).toBe(2);
    expect(n.nutrients.sugar.today).toEqual(todayLabelTotals(log, thursday).sugar);
    expect(n.nutrients.sugar.today).toEqual({ total: 12, count: 1 });
    expect(n.nutrients.saturatedFat.today).toEqual({ total: undefined, count: 0 });
    expect(n.nutrients.sugar).toMatchObject({ average: 16, days: 1, weekCount: 2, weekEntries: 3 });
    expect(n.nutrients.salt).toMatchObject({ days: 1, weekCount: 1, weekEntries: 3 });
    expect(n.nutrients.salt.average).toBeCloseTo(1.2);
    expect(n.nutrients.fiber).toMatchObject({ average: null, days: 0, weekCount: 0 });
  });
  it("never turns sodium into salt, and skips a stored value that isn't an amount", () => {
    const log = [food(at(2026, 10, 18), { calories: 100, sodium: 800, sugar: -2 } as StatsEntry["nutrients"]), food(at(2026, 10, 18, 13), { calories: 100, saturatedFat: Number.NaN })];
    const n = nutrientStats(log, thursday);
    expect(n.nutrients.salt.average).toBeNull();
    expect(n.nutrients.sugar.average).toBeNull();
    expect(n.nutrients.saturatedFat.weekCount).toBe(0);
    expect(n.nutrients.sugar.weekEntries).toBe(2);
  });
  it("labelTotals adds saturates for any day without changing Home's three", () => {
    const log = [food(at(2026, 10, 18), { calories: 100, saturatedFat: 2.5 }), food(at(2026, 10, 18, 14), { calories: 100, saturatedFat: 1 })];
    expect(dayLabelTotals(log, new Date(2026, 10, 18), ["saturatedFat"] as const)).toEqual({ entries: 2, totals: { saturatedFat: { total: 3.5, count: 2 } } });
    expect(Object.keys(todayLabelTotals(log, new Date(2026, 10, 18))).sort()).toEqual(["entries", "fiber", "salt", "sugar"]);
  });
});
