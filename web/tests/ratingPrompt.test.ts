import { describe, expect, it } from "vitest";
import { EMPTY_RATING, answered, daysBetween, noteUse, ratingDue, sanitizeRating, type RatingState } from "../lib/mm/ratingPrompt";

// Used on 5 different days over two weeks: the first point the question may come.
function used(days: string[]): RatingState {
  return days.reduce((s, d) => noteUse(s, d), EMPTY_RATING);
}
const five = used(["2026-11-01", "2026-11-02", "2026-11-05", "2026-11-09", "2026-11-14"]);

describe("Are you enjoying Numbite? (founder 2026-11-17)", () => {
  it("counts each day once", () => {
    const s = used(["2026-11-01", "2026-11-01", "2026-11-02"]);
    expect(s.daysUsed).toBe(2);
    expect(s.firstDay).toBe("2026-11-01");
  });
  it("is asked only after 5 days of use and 14 days since the first", () => {
    expect(ratingDue(five, "2026-11-14")).toBe(false); // 13 days
    expect(ratingDue(five, "2026-11-15")).toBe(true);
    expect(ratingDue(used(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]), "2026-12-30")).toBe(false); // only 4 days of use
    expect(ratingDue(EMPTY_RATING, "2026-12-30")).toBe(false);
  });
  it("after Not now or 1 to 4, not again for 90 days", () => {
    for (const r of [null, 1, 2, 3, 4]) {
      const s = answered(five, "2026-11-15", r);
      expect(s.reviewAsked).toBe(false);
      expect(ratingDue(s, "2026-11-16")).toBe(false);
      expect(ratingDue(s, "2027-02-12")).toBe(false); // 89 days
      expect(ratingDue(s, "2027-02-13")).toBe(true); // 90 days
    }
  });
  it("after a 5 (Apple's review pop-up asked for) never again", () => {
    const s = answered(five, "2026-11-15", 5);
    expect(s.reviewAsked).toBe(true);
    expect(ratingDue(s, "2028-01-01")).toBe(false);
    expect(answered(s, "2028-01-01", 2).reviewAsked).toBe(true);
  });
  it("counts calendar days across the clock change and the new year", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
  it("tidies whatever storage holds", () => {
    expect(sanitizeRating(null)).toEqual(EMPTY_RATING);
    expect(sanitizeRating({ firstDay: "x", daysUsed: -3, reviewAsked: "yes" })).toEqual(EMPTY_RATING);
    expect(sanitizeRating({ ...five, daysUsed: 5.7 }).daysUsed).toBe(5);
  });
});
