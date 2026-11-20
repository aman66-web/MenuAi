import { describe, expect, it } from "vitest";
import { dayTitle } from "../lib/mm/day";
import { halves, PORTIONS, sanitizeLog, withPortion, type LogEntry } from "../lib/mm/user-data";

// Usability test 2026-11-19 (George): a logged food's amount can be changed (half, one and a half, two portions), its figures scaled with it.
const entry: LogEntry = { id: "a", loggedAt: "2026-11-19T08:00:00.000Z", chainId: "", chainName: "", name: "Porridge", nutrients: { calories: 369, protein: 11.2, carbs: 60, fat: 8 }, source: "product" };

describe("a logged food's portion", () => {
  it("scales every figure from the one portion as logged, and back again", () => {
    const two = withPortion(entry, 2);
    expect(two.portion).toBe(2);
    expect(two.nutrients).toEqual({ calories: 738, protein: 22.4, carbs: 120, fat: 16 });
    expect(two.perPortion).toEqual(entry.nutrients);
    const half = withPortion(two, 0.5);
    expect(half.nutrients.calories).toBe(185); // calories are whole, as on a label (half up), never 184.5
    const back = withPortion(half, 1);
    expect(back.portion).toBeUndefined();
    expect(back.perPortion).toBeUndefined();
    expect(back.nutrients.calories).toBe(369);
  });
  it("½ and back to one portion gives back the entry as logged, exactly", () => {
    expect(withPortion(withPortion(entry, 0.5), 1)).toEqual(entry);
    expect(withPortion(entry, 1)).toEqual(entry);
  });
  it("never drifts: 3, then ½, then one portion keeps a label's salt and protein (0.07 g salt, 7.3 g protein), calories always whole", () => {
    const label: LogEntry = { ...entry, nutrients: { calories: 123, protein: 7.3, carbs: 15.5, fat: 2.1, salt: 0.07, sugar: 1.14, sodium: 28 } };
    const three = withPortion(label, 3);
    expect(three.nutrients).toEqual({ calories: 369, protein: 21.9, carbs: 46.5, fat: 6.3, salt: 0.21, sugar: 3.4, sodium: 84 });
    const half = withPortion(three, 0.5);
    expect(half.nutrients).toEqual({ calories: 62, protein: 3.7, carbs: 7.8, fat: 1.1, salt: 0.04, sugar: 0.6, sodium: 14 });
    const one = withPortion(half, 1);
    expect(one).toEqual(label);
    // half of 523 kcal is the same 262 whichever portions came before it (the old way gave 261.5, then other figures after a few changes)
    const whole: LogEntry = { ...entry, nutrients: { calories: 523, protein: 7.3 } };
    expect(withPortion(withPortion(whole, 3), 0.5).nutrients.calories).toBe(withPortion(whole, 0.5).nutrients.calories);
    for (const p of [0.5, 1.5, 2, 3]) expect(Number.isInteger(withPortion(withPortion(label, 1.5), p).nutrients.calories), String(p)).toBe(true);
  });
  it("an entry changed before the one portion was kept works it out once from its figures", () => {
    const old: LogEntry = { ...entry, nutrients: { calories: 738, protein: 22.4, carbs: 120, fat: 16 }, portion: 2 };
    expect(withPortion(old, 1).nutrients).toEqual(entry.nutrients);
    expect(withPortion(old, 0.5).perPortion).toEqual(entry.nutrients);
  });
  it("keeps a calories-only entry calories-only (no figure is made up)", () => {
    const only: LogEntry = { ...entry, nutrients: { calories: 472 } };
    expect(withPortion(only, 1.5).nutrients).toEqual({ calories: 708 });
  });
  it("keeps a sensible portion when the log is read back, and drops a strange one", () => {
    const [ok] = sanitizeLog([{ ...entry, portion: 1.5 }]);
    expect(ok!.portion).toBe(1.5);
    for (const bad of [0, -1, 50, "2", Number.NaN, 1]) expect(sanitizeLog([{ ...entry, portion: bad }])[0]!.portion).toBeUndefined();
  });
  it("keeps the one portion as logged through storage and sync, checked as the figures are, and only beside a portion", () => {
    const half = withPortion(entry, 0.5);
    expect(sanitizeLog(JSON.parse(JSON.stringify([half])))).toEqual([half]);
    expect(sanitizeLog([{ ...half, perPortion: { calories: "369" } }])[0]!.perPortion).toBeUndefined();
    expect(sanitizeLog([{ ...half, perPortion: { calories: 369, protein: Number.NaN } }])[0]!.perPortion).toBeUndefined();
    expect(sanitizeLog([{ ...entry, perPortion: entry.nutrients }])[0]!.perPortion).toBeUndefined(); // no portion: nothing to keep it for
    const calOnly = withPortion({ ...entry, nutrients: { calories: 472 } }, 2);
    expect(sanitizeLog([calOnly])[0]!.perPortion).toEqual({ calories: 472 });
  });
});

describe("the day page's words (the 30-person audit, 20 November 2026)", () => {
  it("writes halves one way everywhere: ½, 1½, 2½ (never 1.5 in one place and 1½ in another)", () => {
    expect(PORTIONS.map(halves)).toEqual(["½", "1", "1½", "2", "3"]);
    expect([2.5, 6, 0.25].map(halves)).toEqual(["2½", "6", "0.25"]);
  });
  it("titles a day as Home writes its date: weekday, then month first in English", () => {
    const thu = new Date(2026, 10, 19, 9, 0);
    expect(dayTitle(thu, "en-GB")).toBe("Thu, Nov 19");
    expect(dayTitle(thu, "en")).toBe("Thu, Nov 19");
    expect(dayTitle(thu, "not a language")).toBe("Thu, Nov 19");
    expect(dayTitle(thu, "pl")).not.toBe("Thu, Nov 19");
  });
});
