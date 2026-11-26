import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanNativeResult, nativeSteps } from "../lib/mm/native";
import {
  cleanStepDays, cleanStepGoal, DEFAULT_STEP_GOAL, isStepDate, MAX_STEP_GOAL, MIN_STEP_GOAL, NO_STEPS, nudgeStepGoal, sanitizeSteps, STEP_DAYS, stepFraction, stepGoal,
  stepsCardView, stepsOn, stepWeek, stepWeekSummary,
} from "../lib/mm/steps";
import { SYNC_STORES } from "../lib/mm/syncMerge";

// Steps (founder 2026-11-26): the phone counts them, the page cleans what the phone says, shows today on Home and the last seven days on /app/steps, and
// keeps only "on" and the goal on this device (lib/mm/steps.ts, lib/mm/native.ts "steps.*").

describe("what the phone says about steps is cleaned", () => {
  it("keeps real days with whole step counts, oldest first, each date once", () => {
    expect(cleanStepDays([
      { date: "2026-11-26", steps: 4210, extra: "x" },
      { date: "2026-11-25", steps: 9034, partial: true },
      { date: "2026-11-25", steps: 1 }, // the same day twice: the first is kept
      { date: "2026-02-30", steps: 10 }, // no such day
      { date: "26/11/2026", steps: 10 },
      { date: "2026-11-24", steps: -5 },
      { date: "2026-11-23", steps: 12.5 },
      { date: "2026-11-22", steps: 150_001 },
      { date: "2026-11-21", steps: "900" },
      { date: "2026-11-20", steps: 0, partial: "yes" },
      null,
      "2026-11-19",
    ])).toEqual([
      { date: "2026-11-20", steps: 0 },
      { date: "2026-11-25", steps: 9034, partial: true },
      { date: "2026-11-26", steps: 4210 },
    ]);
  });

  it("a list too long, or no list, is not an answer", () => {
    expect(cleanStepDays("lots")).toBeUndefined();
    expect(cleanStepDays({ date: "2026-11-26", steps: 1 })).toBeUndefined();
    expect(cleanStepDays(Array.from({ length: 32 }, (_, i) => ({ date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, steps: 1 })))).toBeUndefined();
    expect(cleanStepDays([])).toEqual([]);
  });

  it("dates are real calendar days", () => {
    expect(isStepDate("2028-02-29")).toBe(true);
    expect(isStepDate("2027-02-29")).toBe(false);
    expect(isStepDate("1999-12-31")).toBe(false);
    expect(isStepDate("2026-13-01")).toBe(false);
  });

  it("the bridge passes the days through cleanNativeResult, and an empty list is a real answer", () => {
    expect(cleanNativeResult({ steps: [{ date: "2026-11-26", steps: 300 }] })).toEqual({ steps: [{ date: "2026-11-26", steps: 300 }] });
    expect(cleanNativeResult({ steps: [] })).toEqual({ steps: [] });
    expect(cleanNativeResult({ steps: "300" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ permission: "notDetermined" })).toEqual({ permission: "notDetermined" });
  });
});

describe("the steps bridge", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A pretend phone: answers each action from `answers`. */
  function phone(answers: Record<string, unknown>) {
    const posted: Array<{ id: string; action: string; payload: Record<string, unknown> }> = [];
    const win: Record<string, unknown> = {
      webkit: {
        messageHandlers: {
          menumath: {
            postMessage: (m: { id: string; action: string; payload: Record<string, unknown> }) => {
              posted.push(m);
              queueMicrotask(() => (win.__menumathReply as (id: string, r: unknown) => void)(m.id, answers[m.action] ?? { error: "unavailable" }));
            },
          },
        },
      },
    };
    vi.stubGlobal("window", win);
    return posted;
  }

  it("on the website there are no steps and nothing is asked", async () => {
    vi.stubGlobal("window", {});
    await expect(nativeSteps.status()).resolves.toBe("unavailable");
    await expect(nativeSteps.read(true)).resolves.toEqual({ kind: "unavailable" });
  });

  it("asks for seven days, and asks the phone's question only when told to", async () => {
    const posted = phone({ "steps.get": { steps: [{ date: "2026-11-26", steps: 4210 }] } });
    await expect(nativeSteps.read(false)).resolves.toEqual({ kind: "days", days: [{ date: "2026-11-26", steps: 4210 }] });
    await nativeSteps.read(true);
    expect(posted.map((m) => [m.action, m.payload])).toEqual([
      ["steps.get", { days: STEP_DAYS, ask: false }],
      ["steps.get", { days: STEP_DAYS, ask: true }],
    ]);
  });

  it("not asked yet, said no, or no step counter", async () => {
    phone({ "steps.get": { permission: "notDetermined" }, "steps.status": { permission: "denied" } });
    await expect(nativeSteps.read(false)).resolves.toEqual({ kind: "notDetermined" });
    await expect(nativeSteps.status()).resolves.toBe("denied");
    phone({ "steps.get": { error: "denied" } });
    await expect(nativeSteps.read(false)).resolves.toEqual({ kind: "denied" });
    // an app from before steps answers "unavailable" to an action it doesn't know: nothing is shown
    phone({});
    await expect(nativeSteps.status()).resolves.toBe("unavailable");
    await expect(nativeSteps.read(false)).resolves.toEqual({ kind: "unavailable" });
  });
});

describe("what Home shows", () => {
  const on = { ...NO_STEPS, on: true };
  it("nothing on the website, on a phone with no step counter, or before the phone answers", () => {
    expect(stepsCardView({ inApp: false, permission: "granted", state: on })).toBe("hidden");
    expect(stepsCardView({ inApp: true, permission: "unavailable", state: on })).toBe("hidden");
    expect(stepsCardView({ inApp: true, permission: null, state: on })).toBe("hidden");
  });

  it("the offer until it is turned on, and never again after Not now", () => {
    expect(stepsCardView({ inApp: true, permission: "notDetermined", state: NO_STEPS })).toBe("offer");
    expect(stepsCardView({ inApp: true, permission: "granted", state: NO_STEPS })).toBe("offer");
    expect(stepsCardView({ inApp: true, permission: "notDetermined", state: { ...NO_STEPS, dismissed: true } })).toBe("hidden");
  });

  it("turned on: today's steps, or a calm line when the phone's permission is off", () => {
    expect(stepsCardView({ inApp: true, permission: "granted", state: on })).toBe("showing");
    expect(stepsCardView({ inApp: true, permission: "denied", state: on })).toBe("denied");
    expect(stepsCardView({ inApp: true, permission: "notDetermined", state: on })).toBe("offer");
  });
});

describe("the week", () => {
  const now = new Date(2026, 10, 26, 15, 30); // Thursday 26 November 2026, local time
  const days = cleanStepDays([
    { date: "2026-11-26", steps: 4210 },
    { date: "2026-11-25", steps: 9034 },
    { date: "2026-11-23", steps: 6000 },
    { date: "2026-11-22", steps: 3000, partial: true },
    { date: "2026-11-10", steps: 99 }, // more than a week ago: not in the week
  ])!;

  it("today and the six days before it, oldest first, with no count where the phone has none", () => {
    const week = stepWeek(days, now);
    expect(week.map((d) => [d.date, d.steps, d.partial, d.today])).toEqual([
      ["2026-11-20", null, false, false],
      ["2026-11-21", null, false, false],
      ["2026-11-22", 3000, true, false],
      ["2026-11-23", 6000, false, false],
      ["2026-11-24", null, false, false],
      ["2026-11-25", 9034, false, false],
      ["2026-11-26", 4210, false, true],
    ]);
    expect(stepsOn(days, now)?.steps).toBe(4210);
    expect(stepsOn(days, "2026-11-24")).toBeUndefined();
  });

  it("the total counts every day; the average only whole days (not today, not a partial day)", () => {
    expect(stepWeekSummary(stepWeek(days, now))).toEqual({ total: 22244, average: 7517, wholeDays: 2 });
    expect(stepWeekSummary(stepWeek([{ date: "2026-11-26", steps: 50 }], now))).toEqual({ total: 50, average: null, wholeDays: 0 });
  });

  it("the bar is full at the goal and never more", () => {
    expect(stepFraction(4000, 8000)).toBe(0.5);
    expect(stepFraction(12000, 8000)).toBe(1);
    expect(stepFraction(-1, 8000)).toBe(0);
    expect(stepFraction(100, 0)).toBe(0);
  });
});

describe("the goal and what this device keeps", () => {
  it("starts at 8,000 and moves 500 at a time between 1,000 and 30,000", () => {
    expect(stepGoal(NO_STEPS)).toBe(DEFAULT_STEP_GOAL);
    expect(nudgeStepGoal(8000, 1)).toBe(8500);
    expect(nudgeStepGoal(8000, -1)).toBe(7500);
    expect(nudgeStepGoal(MIN_STEP_GOAL, -1)).toBe(MIN_STEP_GOAL);
    expect(nudgeStepGoal(MAX_STEP_GOAL, 1)).toBe(MAX_STEP_GOAL);
    expect(cleanStepGoal(10_240)).toBe(10_000);
    expect(cleanStepGoal(500)).toBeNull();
    expect(cleanStepGoal("9000")).toBeNull();
  });

  it("only on, Not now and the goal are kept; anything else is dropped", () => {
    expect(sanitizeSteps({ on: true, dismissed: false, goal: 10_000, days: [{ date: "2026-11-26", steps: 1 }] })).toEqual({ on: true, dismissed: false, goal: 10_000 });
    expect(sanitizeSteps({ on: "yes", goal: 99 })).toEqual(NO_STEPS);
    expect(sanitizeSteps({ on: true, goal: DEFAULT_STEP_GOAL })).toEqual({ on: true, dismissed: false });
    expect(sanitizeSteps(null)).toEqual(NO_STEPS);
  });

  it("steps are never one of the synced stores", () => {
    expect(SYNC_STORES.some((s) => /step/i.test(s))).toBe(false);
  });
});
