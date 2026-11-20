import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PIP_BODY, PIP_BROW_WIDTH, PIP_EYE_TOP, PIP_MOODS, pipArms, pipBrows, type PipMood } from "../app/app/_components/Mascot";

// Pip's poses (onboarding review, 19 November 2026), checked on the tables the drawing reads, without rendering: hands clear of the
// body so he never looks one-armed, 'point' aiming down at what is under him and 'pointUp' up, eyebrows clear of the eyes at tip
// size, and none on cheer.

const distance = (h: { x: number; y: number }) => Math.hypot(h.x - PIP_BODY.cx, h.y - PIP_BODY.cy);
/** The y of every point in a path's commands (M, L and Q all take x y pairs). A quadratic curve stays inside its control points, so
 *  the largest of these bounds the curve's lowest edge. */
const ys = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

describe("Pip's arms", () => {
  it("has every mood the app uses, the old names included", () => {
    expect([...PIP_MOODS].sort()).toEqual(["cheer", "listen", "point", "pointUp", "think", "wave"]);
  });

  it("shows two hands clear of the body in every mood but think", () => {
    for (const mood of PIP_MOODS.filter((m) => m !== "think")) {
      const arms = pipArms(mood);
      expect(arms, mood).toHaveLength(2);
      for (const arm of arms) expect(distance(arm.hand), `${mood} ${arm.d}`).toBeGreaterThan(PIP_BODY.r);
    }
  });

  it("holds think's hand at his chin, in front of the body, with the other hand clear", () => {
    const arms = pipArms("think");
    expect(arms).toHaveLength(2);
    expect(arms.filter((a) => distance(a.hand) > PIP_BODY.r)).toHaveLength(1);
    const chin = arms.filter((a) => a.front);
    expect(chin).toHaveLength(1);
    expect(distance(chin[0].hand)).toBeLessThan(PIP_BODY.r);
  });

  it("points down with 'point' and up with 'pointUp'", () => {
    const hand = (mood: PipMood) => pipArms(mood).map((a) => a.hand).sort((a, b) => b.x - a.x)[0];
    expect(hand("point").y).toBeGreaterThan(PIP_BODY.cy);
    expect(hand("pointUp").y).toBeLessThan(PIP_BODY.cy);
  });

  it("waves only in 'wave'", () => {
    for (const mood of PIP_MOODS) expect(pipArms(mood).some((a) => a.wave), mood).toBe(mood === "wave");
  });
});

describe("Pip's eyebrows", () => {
  it("has none on cheer, and two on every other mood", () => {
    expect(pipBrows("cheer")).toHaveLength(0);
    for (const mood of PIP_MOODS.filter((m) => m !== "cheer")) expect(pipBrows(mood), mood).toHaveLength(2);
  });

  it("keeps every eyebrow's lowest edge, stroke included, at least 3 units above the eye whites", () => {
    for (const mood of PIP_MOODS) {
      for (const d of pipBrows(mood)) expect(Math.max(...ys(d)) + PIP_BROW_WIDTH / 2, `${mood} ${d}`).toBeLessThanOrEqual(PIP_EYE_TOP - 3);
    }
  });
});

// Pip is a guide, never decoration (founder 2026-11-20, "keep him as the guide, not the decoration"; the Pip and Premium findings of the 30-person audit the
// same night): he never stands beside a figure, a price or a label. These checks keep him where he was put: only the screens below draw him (a new one is
// added here on purpose, after checking he isn't next to a number, a price or a food label there), and Meal plan's steps that carry calories (meals) or money
// (budget), its "Making your plan" and the household person cards carry plain words instead.

/** Every screen that may draw Pip (imports app/app/_components/Mascot.tsx), as of 20 November 2026. */
const MAY_DRAW_PIP = [
  "app/app/_components/CoachMarks.tsx",
  "app/app/_components/SignIn.tsx",
  "app/app/_components/SignInScreen.tsx",
  "app/app/compare/PipsPick.tsx",
  "app/app/eat-out/favourites/page.tsx",
  "app/app/error.tsx",
  "app/app/meals/MyRecipes.tsx",
  "app/app/meals/RestaurantMeals.tsx",
  "app/app/plan/page.tsx",
  "app/app/recipes/fridge/page.tsx",
  "app/app/recipes/make/page.tsx",
  "app/app/recipes/page.tsx",
  "app/app/recipes/photo/PhotoCamera.tsx",
  "app/app/recipes/photo/page.tsx",
  "app/app/settings/page.tsx",
  "app/app/welcome/BodySteps.tsx",
  "app/app/welcome/Cover.tsx",
  "app/app/welcome/QuestionSteps.tsx",
  "app/not-found.tsx",
];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORTS_MASCOT = /from\s+"(?:\.{1,2}\/)+(?:_components\/)?Mascot"|from\s+"\.\/Mascot"|from\s+"@\/app\/app\/_components\/Mascot"/;
const plan = readFileSync("app/app/plan/page.tsx", "utf8");

/** The source of one top-level function in the plan page (from its declaration to the next one). */
function fn(name: string): string {
  const start = plan.indexOf(`function ${name}(`);
  expect(start, `${name} is in app/app/plan/page.tsx`).toBeGreaterThan(-1);
  const next = plan.slice(start + 1).search(/\n(?:export )?(?:default )?function [A-Z]/);
  return plan.slice(start, next < 0 ? undefined : start + 1 + next);
}

describe("where Pip is drawn", () => {
  it("only the screens on the list import him (add a screen here only after checking he isn't beside a figure, a price or a label)", () => {
    const importers = files("app").filter((f) => !f.endsWith("Mascot.tsx") && IMPORTS_MASCOT.test(readFileSync(f, "utf8"))).sort();
    expect(importers.filter((f) => !MAY_DRAW_PIP.includes(f)), "new screens drawing Pip").toEqual([]);
  });

  it("Meal plan's meals (calories) and budget (£) steps have no Pip mood, so their words are plain", () => {
    const m = /const STEP_PIP[^=]*=\s*\{([^}]*)\}/.exec(plan);
    expect(m, "STEP_PIP in app/app/plan/page.tsx").not.toBeNull();
    const keys = [...m![1]!.matchAll(/(\w+)\s*:/g)].map((k) => k[1]);
    expect(keys).not.toContain("meals");
    expect(keys).not.toContain("budget");
    // the check screen waits; it never cheers before anything is made
    expect(m![1]).not.toMatch(/check:\s*"cheer"/);
  });

  it("'Making your plan' and the Premium intro carry plain words, no Pip (their screens show calories and prices)", () => {
    expect(fn("Making")).not.toMatch(/<PipSays|<Pip\b/);
    expect(fn("PremiumIntro")).not.toMatch(/<PipSays|<Pip\b/);
    expect(fn("Week")).not.toMatch(/<PipSays|<Pip\b/);
  });

  it("the household person cards say their portion in plain words (one Pip a screen)", () => {
    expect(IMPORTS_MASCOT.test(readFileSync("app/app/plan/HouseholdSteps.tsx", "utf8"))).toBe(false);
  });
});
