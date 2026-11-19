import { describe, expect, it } from "vitest";
import { lastWeekAverage, weekSummary, type WeekEntry } from "../lib/mm/week";

// Home's second page (the 20-person meeting, 2026-11-19): only what was logged, a day with nothing logged never counted as 0, today never in an average.

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();
const food = (when: string, calories: number, protein?: number, estimate = false): WeekEntry => ({ loggedAt: when, nutrients: { calories, ...(protein === undefined ? {} : { protein }) }, ...(estimate ? { estimate: true as const } : {}) });
const thursday = new Date(2026, 10, 19, 20, 0); // Thursday 19 November 2026

describe("this week's calories and protein", () => {
  it("adds each day's foods and averages over the days before today that have food, never dividing by seven", () => {
    const log = [food(at(2026, 10, 16), 1800, 90), food(at(2026, 10, 16, 19), 200, 10), food(at(2026, 10, 18), 1600, 80), food(at(2026, 10, 19), 900, 50)];
    const w = weekSummary(log, thursday, 2000);
    expect(w.days.map((d) => d.state)).toEqual(["past", "past", "past", "today", "future", "future", "future"]);
    expect(w.days.map((d) => d.calories)).toEqual([2000, 0, 1600, 900, 0, 0, 0]);
    expect(w.days.map((d) => d.entries)).toEqual([2, 0, 1, 1, 0, 0, 0]);
    expect(w.countedDays).toBe(2); // Monday and Wednesday: Tuesday had nothing, today is still going
    expect(w.caloriesAverage).toBe(1800);
    expect(w.proteinAverage).toBe(90);
    expect(w.proteinGap).toBe(false);
  });
  it("has no average on a Monday or when only today has food", () => {
    const monday = new Date(2026, 10, 16, 9);
    const w = weekSummary([food(at(2026, 10, 16, 8), 400, 20)], monday, 2000);
    expect(w.countedDays).toBe(0);
    expect(w.caloriesAverage).toBeNull();
    expect(w.proteinAverage).toBeNull();
    expect(w.days[0]!.calories).toBe(400);
    expect(weekSummary([food(at(2026, 10, 19, 8), 400, 20)], thursday, 2000).caloriesAverage).toBeNull();
  });
  it("counts a food with no protein as a gap, and leaves a day with no protein figure at all out of protein's days", () => {
    const log = [food(at(2026, 10, 16), 1000, 60), food(at(2026, 10, 16, 18), 500), food(at(2026, 10, 17), 1200)];
    const w = weekSummary(log, thursday, 2000);
    expect(w.caloriesAverage).toBe(1350);
    expect(w.proteinAverage).toBe(60); // only Monday gave protein
    expect(w.proteinGap).toBe(true);
  });
  it("puts a food at 23:59 and at 00:01 on their own local days, and ignores foods after today and outside the week", () => {
    const log = [food(at(2026, 10, 17, 23, 59), 300, 10), food(at(2026, 10, 18, 0, 1), 200, 5), food(at(2026, 10, 21), 5000, 5), food(at(2026, 10, 15), 9999, 1)];
    const w = weekSummary(log, thursday, 2000);
    expect(w.days[1]!.calories).toBe(300);
    expect(w.days[2]!.calories).toBe(200);
    expect(w.days[5]!.calories).toBe(0);
    expect(w.days[5]!.entries).toBe(0);
    expect(w.days.reduce((s, d) => s + d.calories, 0)).toBe(500);
  });
  it("tops the scale at the target or the highest day, whichever is higher, plus 15%", () => {
    expect(weekSummary([], thursday, 2000).scaleTop).toBeCloseTo(2300);
    expect(weekSummary([food(at(2026, 10, 17), 3000, 1)], thursday, 2000).scaleTop).toBeCloseTo(3450);
  });
  it("notes photo estimates logged this week up to now", () => {
    expect(weekSummary([food(at(2026, 10, 17), 500, 20, true)], thursday, 2000).estimates).toBe(true);
    expect(weekSummary([food(at(2026, 10, 17), 500, 20)], thursday, 2000).estimates).toBe(false);
    expect(weekSummary([food(at(2026, 10, 12), 500, 20, true)], thursday, 2000).estimates).toBe(false);
  });
  it("skips a food whose time can't be read", () => {
    expect(weekSummary([{ loggedAt: "nope", nutrients: { calories: 500 } }], thursday, 2000).days.every((d) => d.entries === 0)).toBe(true);
  });
});

describe("last week's average (said on a Monday)", () => {
  it("averages last Monday to Sunday over the days with food, or is null when none has", () => {
    const monday = new Date(2026, 10, 23, 9);
    const log = [food(at(2026, 10, 16), 1800, 90), food(at(2026, 10, 20), 2200, 100), food(at(2026, 10, 23), 300, 5)];
    expect(lastWeekAverage(log, monday)).toBe(2000);
    expect(lastWeekAverage([food(at(2026, 10, 23), 300, 5)], monday)).toBeNull();
  });
});
