import { describe, expect, it } from "vitest";
import { todayLabelTotals } from "../lib/mm/labelTotals";
import { HINT_DAYS, NO_HOME_PAGES, hintShows, sanitizeHomePages, withHintShown } from "../lib/mm/homePages";
import { sanitizeLog } from "../lib/mm/user-data";

// Home's third page and the swipe pages' hint (the 20-person meeting, 2026-11-19).

const now = new Date(2026, 10, 19, 20);
const today = (h: number) => new Date(2026, 10, 19, h).toISOString();

describe("today's sugar, salt and fibre", () => {
  it("adds only the figures a label or menu printed, and says how many foods gave each", () => {
    const t = todayLabelTotals([
      { loggedAt: today(8), nutrients: { sugar: 12, salt: 0.45, fiber: 3 } },
      { loggedAt: today(13), nutrients: { sugar: 5.5, salt: 1.2 } },
      { loggedAt: today(18), nutrients: {} }, // typed numbers, or a photo estimate
    ], now);
    expect(t.entries).toBe(3);
    expect(t.sugar).toEqual({ total: 17.5, count: 2 });
    expect(t.salt.total).toBeCloseTo(1.65);
    expect(t.salt.count).toBe(2);
    expect(t.fiber).toEqual({ total: 3, count: 1 });
  });
  it("reads as not published when no food gave a figure, and skips a stored value that isn't an amount", () => {
    const t = todayLabelTotals([
      { loggedAt: today(8), nutrients: { sugar: Number.NaN, salt: -1 } },
      { loggedAt: today(9), nutrients: { fiber: "3" as unknown as number } },
    ], now);
    expect(t.sugar).toEqual({ total: undefined, count: 0 });
    expect(t.salt).toEqual({ total: undefined, count: 0 });
    expect(t.fiber).toEqual({ total: undefined, count: 0 });
    expect(t.entries).toBe(2);
  });
  it("never turns sodium into salt, and counts only today's foods", () => {
    const t = todayLabelTotals([
      { loggedAt: today(8), nutrients: { sodium: 800 } as never },
      { loggedAt: new Date(2026, 10, 18, 23, 59).toISOString(), nutrients: { salt: 2 } },
    ], now);
    expect(t.salt.total).toBeUndefined();
    expect(t.entries).toBe(1);
  });
});

describe("the swipe pages' hint", () => {
  it("shows until page 2 or 3 is seen, on at most five different days, a second visit the same day not counting again", () => {
    let s = NO_HOME_PAGES;
    for (let d = 0; d < HINT_DAYS; d++) {
      const day = new Date(2026, 10, 19 + d, 9);
      expect(hintShows(s, day)).toBe(true);
      s = withHintShown(s, day);
      s = withHintShown(s, new Date(2026, 10, 19 + d, 18));
      expect(hintShows(s, new Date(2026, 10, 19 + d, 20))).toBe(true); // still today: still showing
    }
    expect(s.hintDays).toBe(HINT_DAYS);
    expect(hintShows(s, new Date(2026, 10, 19 + HINT_DAYS, 9))).toBe(false); // a sixth day: gone for good
    expect(hintShows({ ...NO_HOME_PAGES, seen: true }, now)).toBe(false);
  });
  it("keeps only the four known fields and resets anything malformed", () => {
    expect(sanitizeHomePages({ seen: true, slid: "yes", hintDays: 2, lastHintDay: "2026-11-19", email: "x@y.z" })).toEqual({ seen: true, slid: false, hintDays: 2, lastHintDay: "2026-11-19" });
    expect(sanitizeHomePages({ hintDays: -3, lastHintDay: "yesterday" })).toEqual(NO_HOME_PAGES);
    expect(sanitizeHomePages(null)).toEqual(NO_HOME_PAGES);
  });
});

describe("a photo estimate in the food log", () => {
  it("keeps estimate only when it is exactly true", () => {
    const base = { id: "a", loggedAt: today(8), chainId: "", chainName: "", name: "Plate (estimate)", nutrients: { calories: 500, protein: 20, carbs: 50, fat: 20 }, source: "custom" };
    const [kept, dropped, odd] = sanitizeLog([{ ...base, estimate: true }, { ...base, id: "b" }, { ...base, id: "c", estimate: "true" }]);
    expect(kept!.estimate).toBe(true);
    expect("estimate" in dropped!).toBe(false);
    expect("estimate" in odd!).toBe(false);
  });
});
