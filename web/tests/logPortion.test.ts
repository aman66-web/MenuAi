import { describe, expect, it } from "vitest";
import { sanitizeLog, withPortion, type LogEntry } from "../lib/mm/user-data";

// Usability test 2026-11-19 (George): a logged food's amount can be changed (half, one and a half, two portions), its figures scaled with it.
const entry: LogEntry = { id: "a", loggedAt: "2026-11-19T08:00:00.000Z", chainId: "", chainName: "", name: "Porridge", nutrients: { calories: 369, protein: 11.2, carbs: 60, fat: 8 }, source: "product" };

describe("a logged food's portion", () => {
  it("scales every figure from the portion it is now, and back again", () => {
    const two = withPortion(entry, 2);
    expect(two.portion).toBe(2);
    expect(two.nutrients).toEqual({ calories: 738, protein: 22.4, carbs: 120, fat: 16 });
    const half = withPortion(two, 0.5);
    expect(half.nutrients.calories).toBeCloseTo(184.5, 5);
    const back = withPortion(half, 1);
    expect(back.portion).toBeUndefined();
    expect(back.nutrients.calories).toBe(369);
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
});
