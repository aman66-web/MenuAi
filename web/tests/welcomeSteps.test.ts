import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "../lib/mm/persist";
import { OWN_DATA_KEYS } from "../lib/mm/tour";
import {
  BODY_STEPS,
  FEATURE_STEPS,
  LEGACY_STEPS,
  NO_ANSWERS,
  QUESTION_STEPS,
  SKIP_STEPS,
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

// The welcome steps (onboarding in seven screens, founder 20 November 2026): the run's steps fixed before step 1 (8, or 7 for a run that starts signed in), jumps
// that only go forward, Back to the last screen shown, and carrying on after a relaunch from mm.v1.welcomeProgress.

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

describe("the steps and the bar", () => {
  it("has the seven screens in the founder's order, then the account, each named once", () => {
    expect(WELCOME_STEPS).toEqual(["goal", "avoid", "shops", "recipes", "about", "active", "plan", "save"]);
    expect(BODY_STEPS).toEqual(["about", "active"]);
    expect(QUESTION_STEPS).toEqual(["goal", "avoid", "shops"]);
    // Skip at the top right: the three questions and the two about the person, never the recipes, Your plan or the account
    expect(SKIP_STEPS).toEqual(["goal", "avoid", "shops", "about", "active"]);
    expect(FEATURE_STEPS).toEqual(["recipes", "plan"]);
  });

  it("fixes the run's steps: 8, or 7 for a run that starts signed in (no account step)", () => {
    expect(signedOut.total).toBe(8);
    expect(signedIn.total).toBe(7);
    expect(signedIn.steps).not.toContain("save");
    expect(WELCOME_STEPS.map((s) => stepCounter(signedOut, s))).toEqual(WELCOME_STEPS.map((_, i) => ({ step: i + 1, total: 8 })));
    expect(stepCounter(signedIn, "plan")).toEqual({ step: 7, total: 7 });
    expect(stepCounter(signedIn, "save")).toBeNull();
    // the run can't be changed afterwards (a sign-in during the run never changes it)
    expect(Object.isFrozen(signedOut) && Object.isFrozen(signedOut.steps)).toBe(true);
  });

  it("visits every screen of a whole run in order, never restarting", () => {
    for (const run of [signedOut, signedIn]) {
      const seen = walk(run);
      expect(seen).toEqual(run.steps);
      expect(seen.map((s) => n(run, s))).toEqual(seen.map((_, i) => i + 1));
    }
  });

  it("ends after the account, or after Your plan in a signed-in run ('Continue')", () => {
    expect(moveOn(signedOut, NO_ANSWERS, "plan").to).toBe("save");
    expect(moveOn(signedOut, NO_ANSWERS, "save").to).toBe("home");
    expect(moveOn(signedIn, NO_ANSWERS, "plan").to).toBe("home");
  });
});

describe("skips only jump forward", () => {
  it("Skip on About you or How active are you? goes to Your plan, and so does an age under 18", () => {
    for (const from of BODY_STEPS) {
      const r = moveOn(signedOut, NO_ANSWERS, from, "skipBody");
      expect(r.to, from).toBe("plan");
      expect(r.answers.bodySkipped).toBe(true);
    }
    expect([n(signedOut, "about"), n(signedOut, "plan")]).toEqual([5, 7]);
    const young = moveOn(signedOut, { ...NO_ANSWERS, under18: true }, "about");
    expect(young.to).toBe("plan");
    expect(walk(signedOut, () => "next", true)).toEqual(["goal", "avoid", "shops", "recipes", "about", "plan", "save"]);
    expect(walk(signedOut, (s) => (s === "about" ? "skipBody" : "next"))).toEqual(["goal", "avoid", "shops", "recipes", "about", "plan", "save"]);
  });

  it("never moves the bar back, whatever is tapped on whichever screen", () => {
    const moves: WelcomeMove[] = ["next", "skipBody"];
    const answerSets: WelcomeAnswers[] = [NO_ANSWERS, { ...NO_ANSWERS, bodySkipped: true }, { ...NO_ANSWERS, under18: true }];
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
    expect(moveOn(signedOut, NO_ANSWERS, "recipes", "skipBody").to).toBe("about");
  });
});

describe("Back", () => {
  it("goes to the screen before, and the cover before step 1", () => {
    expect(backFrom(signedOut, NO_ANSWERS, "goal")).toBe("cover");
    expect(backFrom(signedOut, NO_ANSWERS, "about")).toBe("recipes");
    expect(backFrom(signedOut, NO_ANSWERS, "plan")).toBe("active");
    expect(backFrom(signedOut, NO_ANSWERS, "save")).toBe("plan");
    expect(backFrom(signedIn, NO_ANSWERS, "plan")).toBe("active");
  });

  it("after a jump, goes to the last screen actually shown, never to a skipped one", () => {
    const skipped = moveOn(signedOut, NO_ANSWERS, "active", "skipBody").answers;
    expect(backFrom(signedOut, skipped, "plan")).toBe("about");
    expect(backFrom(signedOut, { ...NO_ANSWERS, under18: true }, "plan")).toBe("about");
  });

  it("after going back from a jump, a Continue takes the full way again", () => {
    const skipped = moveOn(signedOut, NO_ANSWERS, "about", "skipBody").answers;
    const answered = moveOn(signedOut, skipped, "about");
    expect(answered.to).toBe("active");
    expect(answered.answers.bodySkipped).toBe(false);
    expect(backFrom(signedOut, moveOn(signedOut, answered.answers, "active").answers, "plan")).toBe("active");
  });

  it("shows only the screens on the way (welcomePath)", () => {
    expect(welcomePath(signedOut, { ...NO_ANSWERS, bodySkipped: true })).toEqual(["goal", "avoid", "shops", "recipes", "about", "plan", "save"]);
    expect(welcomePath(signedIn, NO_ANSWERS)).toEqual(["goal", "avoid", "shops", "recipes", "about", "active", "plan"]);
  });
});

describe("carrying on after quitting (mm.v1.welcomeProgress)", () => {
  const today = "2026-11-20";

  it("reopens each step where it was left, the questions about the person at About you (their answers are never kept); step 1 has nothing to carry on", () => {
    const want: Record<WelcomeStepId, WelcomeStepId | null> = { goal: null, avoid: "avoid", shops: "shops", recipes: "recipes", about: "about", active: "about", plan: "plan", save: "save" };
    for (const step of WELCOME_STEPS) {
      const storage = new MemoryStorage();
      createWelcomeProgressStore(storage).set(progressNote({ step }, today));
      // a relaunch: a new page reads the note back
      const back = createWelcomeProgressStore(storage).get();
      const at = resumeAt(signedOut, back);
      expect(at?.step ?? null, step).toBe(want[step]);
      if (at) {
        // Carry on from step {n}: the same number as when it was left (5 for the questions about the person)
        expect(n(signedOut, at.step), step).toBe(BODY_STEPS.includes(step) ? 5 : WELCOME_STEPS.indexOf(step) + 1);
        // past the questions about the person their answers are gone, so Back from Your plan goes to About you
        if (at.step === "plan") expect(backFrom(signedOut, at.answers, "plan")).toBe("about");
      }
    }
    expect(resumeAt(signedOut, null)).toBeNull();
  });

  it("reads a note written by the eleven steps before 20 November in today's steps", () => {
    expect(LEGACY_STEPS).toEqual({ eatOut: "shops", size: "about", targets: "plan", week: "plan" });
    for (const [old, now] of Object.entries(LEGACY_STEPS)) {
      expect(sanitizeWelcomeProgress({ step: old, savedOn: today, firstRecipeId: "chicken-fajita-bowl" })).toEqual({ step: now, firstRecipeId: "chicken-fajita-bowl", savedOn: today });
    }
    // an old note's skippedSetup mark is dropped (the link it belonged to is gone)
    expect(sanitizeWelcomeProgress({ step: "save", savedOn: today, skippedSetup: true })).toEqual({ step: "save", savedOn: today });
    // a name that was never a step is still no note
    expect(sanitizeWelcomeProgress({ step: "toString", savedOn: today })).toBeNull();
    expect(sanitizeWelcomeProgress({ step: "__proto__", savedOn: today })).toBeNull();
  });

  it("the email-code trip to Mail (iOS ends the web view) comes back to the account step with the hints kept", () => {
    const storage = new MemoryStorage();
    const dish = { chainId: "greggs", itemId: "greggs-chicken-bake" };
    createWelcomeProgressStore(storage).set(progressNote({ step: "save", firstRecipeId: "chicken-fajita-bowl", firstDish: dish }, today));
    const back = createWelcomeProgressStore(storage).get();
    expect(back).toEqual({ step: "save", firstRecipeId: "chicken-fajita-bowl", firstDish: dish, savedOn: today });
    const at = resumeAt(signedOut, back)!;
    expect(at.step).toBe("save");
    expect(stepCounter(signedOut, at.step)).toEqual({ step: 8, total: 8 });
    expect(backFrom(signedOut, at.answers, "save")).toBe("plan");
  });

  it("someone signed in by the time they come back carries on at Your plan (7 of 7), whose button saves and goes to Home", () => {
    const at = resumeAt(signedIn, progressNote({ step: "save" }, today))!;
    expect(at.step).toBe("plan");
    expect(moveOn(signedIn, at.answers, at.step).to).toBe("home");
  });

  it("after Carry on past the questions about the person, their answers are gone, not skipped; answering or skipping them again clears that", () => {
    const at = resumeAt(signedOut, progressNote({ step: "plan" }, today))!;
    expect(at.step).toBe("plan");
    expect(at.answers.bodySkipped).toBe(true);
    expect(at.answers.bodyGone).toBe(true);
    expect(backFrom(signedOut, at.answers, "plan")).toBe("about");
    // Back to About you and answered: a normal run again
    const answered = moveOn(signedOut, at.answers, "about");
    expect(answered.answers.bodyGone).toBeUndefined();
    expect(answered.answers.bodySkipped).toBe(false);
    // Back to About you and skipped: a real skip now
    const skipped = moveOn(signedOut, at.answers, "about", "skipBody");
    expect(skipped.answers).toEqual({ bodySkipped: true, under18: false });
    // before the questions about the person nothing is gone
    expect(resumeAt(signedOut, progressNote({ step: "shops" }, today))!.answers.bodyGone).toBeUndefined();
    expect(resumeAt(signedOut, progressNote({ step: "active" }, today))!.answers.bodyGone).toBeUndefined();
  });

  it("notes whether step 1's goal was chosen, so Back to step 1 after Carry on shows it ticked", () => {
    const storage = new MemoryStorage();
    createWelcomeProgressStore(storage).set(progressNote({ step: "avoid", goalPicked: true }, today));
    expect(createWelcomeProgressStore(storage).get()).toEqual({ step: "avoid", goalPicked: true, savedOn: today });
    expect(progressNote({ step: "avoid", goalPicked: false }, today)).toEqual({ step: "avoid", savedOn: today });
    expect(sanitizeWelcomeProgress({ step: "avoid", goalPicked: "yes", savedOn: today })).toEqual({ step: "avoid", savedOn: today });
  });

  it("checks the note like anything stored", () => {
    for (const bad of [null, "save", 3, {}, { step: "tour" }, { step: "save" }, { step: "save", savedOn: "yesterday" }, { step: ["save"], savedOn: today }]) {
      expect(sanitizeWelcomeProgress(bad), JSON.stringify(bad)).toBeNull();
    }
    // a damaged hint is dropped on its own; the step is kept
    expect(sanitizeWelcomeProgress({ step: "recipes", savedOn: today, firstRecipeId: "<script>", firstDish: { chainId: "Greggs!", itemId: "x" } }))
      .toEqual({ step: "recipes", savedOn: today });
    expect(progressNote({ step: "plan", firstDish: { chainId: "kfc", itemId: "" }, firstRecipeId: null }, today)).toEqual({ step: "plan", savedOn: today });
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
    // Clear data's list moved to app/_lib/clearData.ts (20 November 2026); either place counts
    const settings = readFileSync(new URL("../app/app/settings/SettingsScreen.tsx", import.meta.url), "utf8");
    const clearData = existsSync(new URL("../app/app/_lib/clearData.ts", import.meta.url)) ? readFileSync(new URL("../app/app/_lib/clearData.ts", import.meta.url), "utf8") : "";
    expect(settings + clearData).toMatch(/welcomeProgress/);
  });
  it("holds no answer about the person's body, only the step and the two hints", () => {
    const note = progressNote({ step: "plan", ...({ age: 40, weightKg: 80 } as object) } as Parameters<typeof progressNote>[0], "2026-11-20");
    expect(Object.keys(note).sort()).toEqual(["savedOn", "step"]);
  });
});
