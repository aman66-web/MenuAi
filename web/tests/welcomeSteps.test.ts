import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "../lib/mm/persist";
import { OWN_DATA_KEYS } from "../lib/mm/tour";
import {
  BODY_STEPS,
  FEATURE_STEPS,
  NO_ANSWERS,
  QUESTION_STEPS,
  WELCOME_PROGRESS_KEY,
  WELCOME_STEPS,
  backFrom,
  createWelcomeProgressStore,
  moveOn,
  progressNote,
  resumeAt,
  sanitizeWelcomeProgress,
  startRun,
  stepCounter,
  welcomePath,
  type WelcomeAnswers,
  type WelcomeMove,
  type WelcomeRun,
  type WelcomeStepId,
} from "../lib/mm/welcomeSteps";

// The welcome steps (the onboarding redesign meeting of 20 November 2026, build list 1): one counter that never restarts, a total fixed per run (11, or 10 for a
// run that starts signed in), jumps that only go forward, Back to the last screen shown, and carrying on after a relaunch from mm.v1.welcomeProgress.

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const signedOut = startRun(false);
const signedIn = startRun(true);
const n = (run: WelcomeRun, s: WelcomeStepId) => stepCounter(run, s)?.step ?? null;

/** Every screen a run visits from step 1 to the end, taking `how` on the screen where it applies. */
function walk(run: WelcomeRun, choose: (s: WelcomeStepId) => WelcomeMove = () => "next", under18 = false): WelcomeStepId[] {
  const seen: WelcomeStepId[] = [];
  let at: WelcomeStepId | "home" = "goal";
  let answers: WelcomeAnswers = NO_ANSWERS;
  while (at !== "home" && seen.length < 20) {
    seen.push(at);
    const r = moveOn(run, { ...answers, under18: at === "about" ? under18 : answers.under18 }, at, choose(at));
    at = r.to;
    answers = r.answers;
  }
  return seen;
}

describe("the steps and the counter", () => {
  it("has the eleven steps in the meeting's order, each named once", () => {
    expect(WELCOME_STEPS).toEqual(["goal", "avoid", "eatOut", "shops", "recipes", "about", "size", "active", "targets", "week", "save"]);
    expect(BODY_STEPS).toEqual(["about", "size", "active"]);
    expect(QUESTION_STEPS).toEqual(["goal", "avoid", "shops"]);
    expect(FEATURE_STEPS).toEqual(["eatOut", "recipes", "week"]);
  });

  it("fixes N for the run: 11, or 10 for a run that starts signed in (no account step)", () => {
    expect(signedOut.total).toBe(11);
    expect(signedIn.total).toBe(10);
    expect(signedIn.steps).not.toContain("save");
    expect(WELCOME_STEPS.map((s) => stepCounter(signedOut, s))).toEqual(WELCOME_STEPS.map((_, i) => ({ step: i + 1, total: 11 })));
    expect(stepCounter(signedIn, "week")).toEqual({ step: 10, total: 10 });
    expect(stepCounter(signedIn, "save")).toBeNull();
    // the run can't be changed afterwards (a sign-in during the run never changes N)
    expect(Object.isFrozen(signedOut) && Object.isFrozen(signedOut.steps)).toBe(true);
  });

  it("numbers every screen of a whole run 1 to N, never restarting and never changing the total", () => {
    for (const run of [signedOut, signedIn]) {
      const seen = walk(run);
      expect(seen).toEqual(run.steps);
      expect(seen.map((s) => stepCounter(run, s)!.total)).toEqual(seen.map(() => run.total));
      expect(seen.map((s) => n(run, s))).toEqual(seen.map((_, i) => i + 1));
    }
  });

  it("ends after the account, or after Your week in a signed-in run ('Save and go to Home')", () => {
    expect(moveOn(signedOut, NO_ANSWERS, "week").to).toBe("save");
    expect(moveOn(signedOut, NO_ANSWERS, "save").to).toBe("home");
    expect(moveOn(signedIn, NO_ANSWERS, "week").to).toBe("home");
  });
});

describe("skips only jump forward", () => {
  it("'Skip these questions' goes from 6 (or 7 or 8) to 9, and so does an age under 18", () => {
    for (const from of BODY_STEPS) {
      const r = moveOn(signedOut, NO_ANSWERS, from, "skipBody");
      expect(r.to, from).toBe("targets");
      expect(r.answers.bodySkipped).toBe(true);
    }
    expect(n(signedOut, "about")).toBe(6);
    expect(n(signedOut, "targets")).toBe(9);
    const young = moveOn(signedOut, { ...NO_ANSWERS, under18: true }, "about");
    expect(young.to).toBe("targets");
    expect(walk(signedOut, () => "next", true)).toEqual(["goal", "avoid", "eatOut", "shops", "recipes", "about", "targets", "week", "save"]);
  });

  it("step 3's link goes from 3 to 11, or finishes a signed-in run ('Skip the rest and go to Home')", () => {
    const r = moveOn(signedOut, NO_ANSWERS, "eatOut", "skipSetup");
    expect(r).toEqual({ to: "save", answers: { ...NO_ANSWERS, skippedSetup: true } });
    expect([n(signedOut, "eatOut"), n(signedOut, "save")]).toEqual([3, 11]);
    expect(moveOn(signedIn, NO_ANSWERS, "eatOut", "skipSetup").to).toBe("home");
    expect(walk(signedOut, (s) => (s === "eatOut" ? "skipSetup" : "next"))).toEqual(["goal", "avoid", "eatOut", "save"]);
  });

  it("never moves the counter back, whatever is tapped on whichever screen", () => {
    const moves: WelcomeMove[] = ["next", "skipBody", "skipSetup"];
    const answerSets: WelcomeAnswers[] = [NO_ANSWERS, { ...NO_ANSWERS, bodySkipped: true }, { ...NO_ANSWERS, under18: true }, { ...NO_ANSWERS, skippedSetup: true }];
    for (const run of [signedOut, signedIn]) {
      for (const from of run.steps) {
        for (const how of moves) {
          for (const a of answerSets) {
            const { to } = moveOn(run, a, from, how);
            if (to !== "home") expect(n(run, to)!, `${from} ${how} ${JSON.stringify(a)}`).toBeGreaterThan(n(run, from)!);
          }
        }
      }
    }
  });

  it("a skip used on a screen it doesn't belong to is a plain Next", () => {
    expect(moveOn(signedOut, NO_ANSWERS, "goal", "skipBody").to).toBe("avoid");
    expect(moveOn(signedOut, NO_ANSWERS, "recipes", "skipSetup").to).toBe("about");
  });
});

describe("Back", () => {
  it("goes to the screen before, and the cover before step 1", () => {
    expect(backFrom(signedOut, NO_ANSWERS, "goal")).toBe("cover");
    expect(backFrom(signedOut, NO_ANSWERS, "about")).toBe("recipes");
    expect(backFrom(signedOut, NO_ANSWERS, "targets")).toBe("active");
    expect(backFrom(signedOut, NO_ANSWERS, "save")).toBe("week");
    expect(backFrom(signedIn, NO_ANSWERS, "week")).toBe("targets");
  });

  it("after a jump, goes to the last screen actually shown, never to a skipped one", () => {
    const skipped = moveOn(signedOut, NO_ANSWERS, "active", "skipBody").answers;
    expect(backFrom(signedOut, skipped, "targets")).toBe("about");
    expect(backFrom(signedOut, { ...NO_ANSWERS, under18: true }, "targets")).toBe("about");
    const linked = moveOn(signedOut, NO_ANSWERS, "eatOut", "skipSetup").answers;
    expect(backFrom(signedOut, linked, "save")).toBe("eatOut");
  });

  it("after going back from a jump, a Next takes the full way again", () => {
    const linked = moveOn(signedOut, NO_ANSWERS, "eatOut", "skipSetup").answers;
    const again = moveOn(signedOut, linked, "eatOut");
    expect(again).toEqual({ to: "shops", answers: NO_ANSWERS });
    const skipped = moveOn(signedOut, NO_ANSWERS, "about", "skipBody").answers;
    const answered = moveOn(signedOut, skipped, "about");
    expect(answered.to).toBe("size");
    expect(answered.answers.bodySkipped).toBe(false);
    expect(backFrom(signedOut, moveOn(signedOut, answered.answers, "active").answers, "targets")).toBe("active");
  });

  it("shows only the screens on the way (welcomePath)", () => {
    expect(welcomePath(signedOut, { ...NO_ANSWERS, bodySkipped: true })).toEqual(["goal", "avoid", "eatOut", "shops", "recipes", "about", "targets", "week", "save"]);
    expect(welcomePath(signedIn, { ...NO_ANSWERS, skippedSetup: true })).toEqual(["goal", "avoid", "eatOut"]);
  });
});

describe("carrying on after quitting (mm.v1.welcomeProgress)", () => {
  const today = "2026-11-20";

  it("reopens each step where it was left, the questions about the person at About you (their answers are never kept); step 1 has nothing to carry on", () => {
    const want: Record<WelcomeStepId, WelcomeStepId | null> = {
      goal: null, avoid: "avoid", eatOut: "eatOut", shops: "shops", recipes: "recipes", about: "about", size: "about", active: "about", targets: "targets", week: "week", save: "save",
    };
    for (const step of WELCOME_STEPS) {
      const storage = new MemoryStorage();
      createWelcomeProgressStore(storage).set(progressNote({ step }, today));
      // a relaunch: a new page reads the note back
      const back = createWelcomeProgressStore(storage).get();
      const at = resumeAt(signedOut, back);
      expect(at?.step ?? null, step).toBe(want[step]);
      if (at) {
        // Carry on from step {n}: the same number as when it was left (6 for the questions about the person)
        expect(n(signedOut, at.step), step).toBe(BODY_STEPS.includes(step) ? 6 : WELCOME_STEPS.indexOf(step) + 1);
        // past the questions about the person their answers are gone, so Back from the targets goes to About you
        if (at.step === "targets") expect(backFrom(signedOut, at.answers, "targets")).toBe("about");
      }
    }
    expect(resumeAt(signedOut, null)).toBeNull();
  });

  it("the email-code trip to Mail (iOS ends the web view) comes back to the account step with the hints kept", () => {
    const storage = new MemoryStorage();
    const dish = { chainId: "greggs", itemId: "greggs-chicken-bake" };
    createWelcomeProgressStore(storage).set(progressNote({ step: "save", firstRecipeId: "chicken-fajita-bowl", firstDish: dish }, today));
    const back = createWelcomeProgressStore(storage).get();
    expect(back).toEqual({ step: "save", firstRecipeId: "chicken-fajita-bowl", firstDish: dish, savedOn: today });
    const at = resumeAt(signedOut, back)!;
    expect(at.step).toBe("save");
    expect(stepCounter(signedOut, at.step)).toEqual({ step: 11, total: 11 });
    expect(backFrom(signedOut, at.answers, "save")).toBe("week");
  });

  it("after step 3's link, Back from the account still returns to step 3 after a relaunch", () => {
    const linked = moveOn(signedOut, NO_ANSWERS, "eatOut", "skipSetup").answers;
    const note = progressNote({ step: "save", answers: linked }, today);
    expect(note.skippedSetup).toBe(true);
    const at = resumeAt(signedOut, sanitizeWelcomeProgress(JSON.parse(JSON.stringify(note))))!;
    expect(at.step).toBe("save");
    expect(backFrom(signedOut, at.answers, "save")).toBe("eatOut");
    // the jump is only noted while the account step shows
    expect(progressNote({ step: "eatOut", answers: linked }, today).skippedSetup).toBeUndefined();
  });

  it("someone signed in by the time they come back carries on at Your week (step 10 of 10), whose button saves and goes to Home", () => {
    const at = resumeAt(signedIn, progressNote({ step: "save" }, today))!;
    expect(at.step).toBe("week");
    expect(moveOn(signedIn, at.answers, at.step).to).toBe("home");
  });

  it("checks the note like anything stored", () => {
    for (const bad of [null, "save", 3, {}, { step: "tour" }, { step: "save" }, { step: "save", savedOn: "yesterday" }, { step: ["save"], savedOn: today }]) {
      expect(sanitizeWelcomeProgress(bad), JSON.stringify(bad)).toBeNull();
    }
    // a damaged hint is dropped on its own; the step is kept
    expect(sanitizeWelcomeProgress({ step: "recipes", savedOn: today, firstRecipeId: "<script>", firstDish: { chainId: "Greggs!", itemId: "x" }, skippedSetup: "yes" }))
      .toEqual({ step: "recipes", savedOn: today });
    expect(progressNote({ step: "eatOut", firstDish: { chainId: "kfc", itemId: "" }, firstRecipeId: null }, today)).toEqual({ step: "eatOut", savedOn: today });
    // text that isn't the app's envelope, or isn't JSON, reads as no note
    const storage = new MemoryStorage();
    storage.setItem(WELCOME_PROGRESS_KEY, "{not json");
    expect(createWelcomeProgressStore(storage).get()).toBeNull();
  });

  it("'Start again' and the end of the welcome screens remove it", () => {
    const storage = new MemoryStorage();
    const store = createWelcomeProgressStore(storage);
    store.set(progressNote({ step: "shops" }, today));
    expect(storage.data.has(WELCOME_PROGRESS_KEY)).toBe(true);
    store.reset();
    expect(storage.data.has(WELCOME_PROGRESS_KEY)).toBe(false);
    expect(store.get()).toBeNull();
  });
});

describe("the note stays on this phone and never counts as the person's own data", () => {
  it("is mm.v1.welcomeProgress, not one of the person's own stores (so it never stops the welcome screens opening)", () => {
    expect(WELCOME_PROGRESS_KEY).toBe("mm.v1.welcomeProgress");
    expect(OWN_DATA_KEYS).not.toContain(WELCOME_PROGRESS_KEY);
  });
  it("is never synced, and a sign-in doesn't empty it (it isn't one of prepareFor's stores)", () => {
    expect(readFileSync(new URL("../lib/mm/syncStores.ts", import.meta.url), "utf8")).not.toMatch(/welcomeProgress/i);
    expect(readFileSync(new URL("../app/app/_lib/account.ts", import.meta.url), "utf8")).not.toMatch(/welcomeProgress/i);
  });
  it("Settings › Clear everything removes it", () => {
    expect(readFileSync(new URL("../app/app/settings/page.tsx", import.meta.url), "utf8")).toMatch(/welcomeProgress/);
  });
  it("holds no answer about the person's body, only the step and the two hints", () => {
    const note = progressNote({ step: "targets", ...({ age: 40, weightKg: 80 } as object) } as Parameters<typeof progressNote>[0], "2026-11-20");
    expect(Object.keys(note).sort()).toEqual(["savedOn", "step"]);
  });
});
