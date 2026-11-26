import { describe, expect, it } from "vitest";
import {
  bodyBurn, exerciseWeek, goalOutcome, leanOf, lowestGoalKg, mifflinBurn, sanitizeBody, sanitizeSavedGoal, sessionKcal, weeksAfter, weeksToGoal,
  type BodyGoal, type GoalOutcome,
} from "../lib/mm/bodyGoal";

const ok = (o: GoalOutcome) => {
  if (o.kind !== "ok") throw new Error(`expected ok, got ${o.kind}`);
  return o;
};

const her: BodyGoal = { set: "female", age: 30, weightKg: 80, bodyFat: 35, goalKg: 70, dayToDay: "light" };

describe("a session's burn (Compendium METs, net of rest)", () => {
  it("is (MET − 1) × kg × hours, to the nearest 10", () => {
    expect(sessionKcal(3.5, 80, 60)).toBe(200);
    expect(sessionKcal(4.3, 80, 45)).toBe(200);
    expect(sessionKcal(3.0, 80, 30)).toBe(80);
  });
});

describe("the week's exercise", () => {
  it("losing fat, not training yet: strength twice (Mon, Thu), brisk walks, an easy walk on Sunday", () => {
    const w = exerciseWeek("loseFat", 80, { training: "none", exercise: "plan" });
    expect(w.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(w.map((d) => d.kind)).toEqual(["strength", "brisk", "brisk", "strength", "brisk", "brisk", "easy"]);
    expect(w[0]).toMatchObject({ minutes: 45, focus: "whole", kcal: 150 });
  });
  it("building muscle 3 to 4 days: four strength days, upper and lower in turn, two brisk walks, rest", () => {
    const w = exerciseWeek("muscle", 70, { training: "3-4", exercise: "plan", lifting: "fewYears" });
    const strength = w.filter((d) => d.kind === "strength");
    expect(strength.map((d) => d.day)).toEqual([1, 2, 4, 5]);
    expect(strength.map((d) => d.focus)).toEqual(["upper", "lower", "upper", "lower"]);
    expect(strength.every((d) => d.minutes === 60)).toBe(true);
    expect(w.filter((d) => d.kind === "brisk")).toHaveLength(2);
    expect(w.filter((d) => d.kind === "rest")).toHaveLength(1);
  });
  it("someone new to weights starts with three whole-body sessions", () => {
    const w = exerciseWeek("muscle", 70, { training: "5+", exercise: "plan", lifting: "new" });
    expect(w.filter((d) => d.kind === "strength").map((d) => d.focus)).toEqual(["whole", "whole", "whole"]);
  });
  it("puts strength on the person's own training days", () => {
    const w = exerciseWeek("loseFat", 80, { training: "3-4", trainingDays: [2, 4, 6], exercise: "plan" });
    expect(w.filter((d) => d.kind === "strength").map((d) => d.day)).toEqual([2, 4, 6]);
  });
  it("their own training: their kind, length and days, nothing added", () => {
    const w = exerciseWeek("loseFat", 80, { training: "3-4", trainingDays: [2, 4, 6], trainingKind: "cardio", sessionMinutes: 45, exercise: "own" });
    expect(w.filter((d) => d.kind !== "rest").map((d) => [d.day, d.kind, d.minutes])).toEqual([[2, "cardio", 45], [4, "cardio", 45], [6, "cardio", 45]]);
    expect(w.find((d) => d.day === 2)!.kcal).toBe(sessionKcal(7, 80, 45));
  });
  it("their own training, and they don't train: a week of rest", () => {
    expect(exerciseWeek("muscle", 80, { training: "none", exercise: "own" }).every((d) => d.kind === "rest" && d.kcal === 0)).toBe(true);
  });
});

describe("losing fat", () => {
  it("eats what they burn less 0.5% of their weight a week, protein 2 g a kg of lean mass", () => {
    const o = ok(goalOutcome("loseFat", her, { training: "none", exercise: "plan", pace: "steady" }));
    const lean = leanOf(80, 35);
    const exercise = exerciseWeek("loseFat", 80, { training: "none", exercise: "plan" }).reduce((n, d) => n + d.kcal, 0) / 7;
    const burn = bodyBurn(lean, "light") + exercise;
    expect(o.kcal).toBe(Math.round((burn - (0.4 * 7700) / 7) / 10) * 10);
    expect(o.protein).toBe(105);
    expect(o.floored).toBe(false);
    expect(o.weeklyKg).toBeCloseTo(-0.4, 1);
  });
  it("gives a realistic range of weeks: the slower end assumes three quarters of the plan happens", () => {
    const o = ok(goalOutcome("loseFat", her, { training: "none", exercise: "plan", pace: "steady" }));
    expect(o.weeks).not.toBeNull();
    const [quick, slow] = o.weeks!;
    // 10 kg at about 0.4 kg a week, a little slower as she gets lighter
    expect(quick).toBeGreaterThanOrEqual(24);
    expect(quick).toBeLessThanOrEqual(30);
    expect(slow).toBeGreaterThan(quick);
    expect(slow).toBeLessThanOrEqual(42);
  });
  it("faster is quicker, and never more than 1 kg a week", () => {
    const steady = ok(goalOutcome("loseFat", her, { training: "none", exercise: "plan", pace: "steady" }));
    const faster = ok(goalOutcome("loseFat", her, { training: "none", exercise: "plan", pace: "faster" }));
    expect(faster.weeks![0]).toBeLessThan(steady.weeks![0]);
    const big = ok(goalOutcome("loseFat", { ...her, weightKg: 150, goalKg: 120, bodyFat: 45 }, { training: "none", exercise: "plan", pace: "faster" }));
    expect(big.weeklyKg).toBeGreaterThanOrEqual(-1.01);
  });
  it("never under 1,200 kcal or 75% of what they burn: the food is held and the time grows", () => {
    const small: BodyGoal = { set: "female", age: 40, weightKg: 55, bodyFat: 30, goalKg: 50, dayToDay: "sedentary" };
    const o = ok(goalOutcome("loseFat", small, { training: "none", exercise: "own", pace: "faster" }));
    expect(o.kcal).toBe(1200);
    expect(o.floored).toBe(true);
  });
});

describe("building muscle", () => {
  it("eats 250 (Steady) or 500 (Faster) over what they burn", () => {
    const him: BodyGoal = { set: "male", age: 25, weightKg: 70, bodyFat: 15, goalKg: 75, dayToDay: "light" };
    const t = { training: "3-4" as const, exercise: "plan" as const, lifting: "underYear" as const };
    const steady = ok(goalOutcome("muscle", him, { ...t, pace: "steady" }));
    const faster = ok(goalOutcome("muscle", him, { ...t, pace: "faster" }));
    expect(faster.kcal - steady.kcal).toBe(250);
    // burnBody and burnExercise are shown rounded to 10, so their sum is within 10 of the unrounded one
    expect(Math.abs(steady.kcal - (steady.burnBody + steady.burnExercise + 250))).toBeLessThanOrEqual(10);
    expect(steady.protein).toBe(120);
    // 5 kg at about 0.45 kg a week (Faster)
    expect(faster.weeks![0]).toBeGreaterThanOrEqual(10);
    expect(faster.weeks![0]).toBeLessThanOrEqual(14);
  });
});

describe("training for a sport", () => {
  it("covers their own sessions on Mifflin-St Jeor, protein 1.6 g a kg, no goal date", () => {
    const b: BodyGoal = { set: "male", age: 25, weightKg: 75, heightCm: 180, dayToDay: "light" };
    const o = ok(goalOutcome("sport", b, { training: "5+", sportKind: "endurance", sessionMinutes: 60 }));
    const body = mifflinBurn({ set: "male", age: 25, weightKg: 75, heightCm: 180 }, "light");
    expect(o.exercise.filter((d) => d.kind === "cardio")).toHaveLength(5);
    expect(o.kcal).toBe(Math.round((body + (5 * sessionKcal(7, 75, 60)) / 7) / 10) * 10);
    expect(o.protein).toBe(120);
    expect(o.weeks).toBeNull();
  });
  it("needs height, not body fat", () => {
    expect(goalOutcome("sport", { set: "female", age: 30, weightKg: 60, dayToDay: "active" }, { training: "3-4" }).kind).toBe("incomplete");
  });
});

describe("what is never planned", () => {
  it("under 18", () => expect(goalOutcome("loseFat", { ...her, age: 16 }, {}).kind).toBe("under18"));
  it("pregnant or breastfeeding, for a weight goal", () => expect(goalOutcome("loseFat", { ...her, pregnant: true }, {}).kind).toBe("pregnant"));
  it("a goal the wrong way for the aim", () => {
    expect(goalOutcome("loseFat", { ...her, goalKg: 82 }, {}).kind).toBe("wrongWay");
    expect(goalOutcome("muscle", { ...her, goalKg: 75 }, {}).kind).toBe("wrongWay");
  });
  it("a goal lighter than 10% (men) or 18% (women) body fat would be", () => {
    const o = goalOutcome("loseFat", { set: "male", age: 30, weightKg: 70, bodyFat: 12, goalKg: 66, dayToDay: "light" }, {});
    expect(o).toEqual({ kind: "tooLean", lowestKg: Math.ceil(lowestGoalKg(leanOf(70, 12), "male")) });
  });
  it("nothing until every answer is in", () => expect(goalOutcome("loseFat", { set: "female", age: 30, weightKg: 80 }, {}).kind).toBe("incomplete"));
});

describe("weeks to the goal", () => {
  it("stops (null) past three years", () => {
    expect(weeksToGoal({ aim: "muscle", pace: "steady", kg: 60, lean: 50, goalKg: 200, dayToDay: "light", exerciseWeekKcal: 0 })).toBeNull();
  });
  it("names the day weeks after the plan's start", () => {
    expect(weeksAfter("2026-11-26", 2).toDateString()).toBe(new Date(2026, 11, 10).toDateString());
  });
});

describe("kept on the phone", () => {
  it("keeps only known values", () => {
    expect(sanitizeBody({ set: "male", age: 30.4, weightKg: 80.04, bodyFat: 99, goalKg: "75", dayToDay: "x", pregnant: false, heightCm: 181.2 }))
      .toEqual({ set: "male", age: 30, weightKg: 80, pregnant: false, heightCm: 181 });
  });
  it("reads a saved goal back, and drops a damaged one", () => {
    const o = ok(goalOutcome("loseFat", her, { training: "none", exercise: "plan", pace: "steady" }));
    const saved = { aim: "loseFat", body: her, kcal: o.kcal, protein: o.protein, weeks: o.weeks, weeklyKg: o.weeklyKg, floored: o.floored, exercise: o.exercise };
    expect(sanitizeSavedGoal(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(sanitizeSavedGoal({ aim: "fly", kcal: 2000, protein: 100 })).toBeUndefined();
    expect(sanitizeSavedGoal({ ...saved, exercise: [{ day: 9, kind: "strength", minutes: 45, kcal: 100 }] })!.exercise).toEqual([]);
  });
});

describe("the biggest meal of the day (mealPlan.ts slotTargets)", () => {
  it("gives the chosen meal 1.3 times an even share and the others what is left", async () => {
    const { slotTargets } = await import("../lib/mm/mealPlan");
    const even = slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 }, { kcal: 1800, protein: 120 });
    const big = slotTargets({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 }, { kcal: 1800, protein: 120 }, null, "dinner");
    expect(even.dinner!.kcal).toBe(600);
    expect(big.dinner!.kcal).toBe(780);
    expect(big.breakfast!.kcal).toBe(510);
    expect(big.lunch!.kcal).toBe(510);
    // one meal a day: nothing to move
    expect(slotTargets({ meals: ["dinner"], snacks: 0 }, { kcal: 1800, protein: 120 }, null, "dinner").dinner!.kcal).toBe(1800);
  });
});

describe("what Pip may be told (planAi.ts sanitizeAnswers)", () => {
  it("keeps the flowchart's choices for their own aim only, and never a body answer", async () => {
    const { sanitizeAnswers } = await import("../lib/mm/planAi");
    const a = sanitizeAnswers({ aim: "loseFat", training: "3-4", trainingKind: "weights", exercise: "plan", pace: "faster", lifting: "new", sportKind: "team", bigMeal: "lunch", weightKg: 80, bodyFat: 30 });
    expect(a).toEqual({ aim: "loseFat", training: "3-4", trainingKind: "weights", exercise: "plan", pace: "faster", bigMeal: "lunch" });
    expect(sanitizeAnswers({ aim: "sport", sportKind: "endurance", sessionMinutes: 90, pace: "steady" })).toEqual({ aim: "sport", sportKind: "endurance", sessionMinutes: 90 });
  });
});
