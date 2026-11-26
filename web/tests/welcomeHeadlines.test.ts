import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGN_IN_HEADING } from "../lib/mm/signInGate";

// The welcome screens have a headline only (founder 2026-11-26: "in onboarding currently a lot of text is going there. So just have a headline, don't have
// subtitles. Make sure it's clear [so people] know actually what is going on"), and Pip is met as "your food guide and nutrition coach" (founder: Pip "can be a
// food guide and also a nutrition coach"), never a dietitian or nutritionist and never medical advice (CLAUDE.md rule 3; "dietitian" is a protected title).

const read = (f: string) => readFileSync(f, "utf8");
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const STRINGS = /\bt[k]?\(\s*"((?:[^"\\]|\\.)*)"/g;
const words = (f: string) => [...read(f).matchAll(STRINGS)].map((m) => m[1]!);

describe("Pip", () => {
  it("is met on the welcome cover as your food guide and nutrition coach", () => {
    expect(words("app/app/welcome/Cover.tsx")).toContain("Meet Pip, your food guide and nutrition coach");
  });

  it("is never called a dietitian or nutritionist, and never gives medical advice, anywhere in the app", () => {
    const bad = [...files("app/app"), ...files("lib/mm")]
      .flatMap((f) => words(f).map((w) => [f, w] as const))
      // a line saying what Pip is NOT ("not a doctor or dietitian", "doesn't give medical advice") is fine
      .filter(([, w]) => /\bPip\b/.test(w) && /dietitian|nutritionist|medical advice|prescri/i.test(w) && !/\bnot\b|n't\b/i.test(w));
    expect(bad).toEqual([]);
  });
});

describe("a headline only", () => {
  it("no welcome screen has a grey line under its headline except About you's data line (optional, never saved or sent)", () => {
    const users = files("app/app/welcome").filter((f) => !f.endsWith("parts.tsx") && /\bSUBLINE\b/.test(read(f)));
    expect(users).toEqual(["app/app/welcome/BodySteps.tsx"]);
    expect(words("app/app/welcome/BodySteps.tsx")).toContain("Optional. Never saved or sent.");
  });

  it("the old subtitles are gone", () => {
    const welcome = files("app/app/welcome").flatMap(words);
    for (const gone of ["Tap one to cook first.", "Starting numbers.", "What Meal plan could make you.", "Welcome to {app}", "Calories and protein", "Every menu free", "Only used to work out your numbers. Never saved or sent."]) {
      expect(welcome, gone).not.toContain(gone);
    }
    const signIn = words("app/app/_components/SignInScreen.tsx");
    for (const gone of ["Welcome back. Your plan is still here.", "Use the same Apple ID, Google account or email as last time.", "Waiting for you on Home: {recipe}."]) {
      expect(signIn, gone).not.toContain(gone);
    }
    expect(words("app/app/_components/SignIn.tsx")).not.toContain("We'll send you a code.");
  });

  it("the account step's and the cover's sign-in headlines carry what their grey lines said", () => {
    expect(SIGN_IN_HEADING.setup).toBe("Save your plan for free");
    expect(SIGN_IN_HEADING.returning).toBe("Sign in the same way as last time");
  });

  it("keeps the lines that must stay: not affiliated, Terms and Privacy, what the account keeps, not medical advice", () => {
    expect(words("app/app/welcome/Cover.tsx")).toEqual(expect.arrayContaining(["Terms", "Privacy", "Not affiliated with any restaurant or shop shown."]));
    expect(words("app/app/welcome/RestaurantRow.tsx")).toContain("Not affiliated with any restaurant or shop shown.");
    expect(read("app/app/welcome/PlanStep.tsx")).toMatch(/SUGGESTION_NOTE/);
    expect(words("app/app/_components/SignIn.tsx")).toContain("We keep your email and what you save. No ads, no tracking.");
  });
});

// The onboarding's examples of the app are pictures on a phone (founder 2026-11-26: "the meal plan screen, people often think that that is like that their current
// meal plan, and they try and click it ... show it within a phone because it helps").
describe("examples of the app are drawn on a phone that can't be tapped", () => {
  const frame = read("app/app/welcome/PhoneFrame.tsx");
  it("the phone is one image for a screen reader, and nothing inside it can be tapped, focused or selected", () => {
    expect(frame).toMatch(/role="img" aria-label=\{label\}/);
    expect(frame).toMatch(/<div inert className="pointer-events-none select-none/);
    // a plain outline: no device picture, no brand
    expect(frame).not.toMatch(/<img|iphone|apple|android|pixel|galaxy/i);
  });
  it("the example meal plan and the restaurant dishes are inside it, each with a name that says it is an example", () => {
    expect(read("app/app/welcome/WeekShowcase.tsx")).toMatch(/<PhoneFrame label=\{costs \? t\("Example of a meal plan/);
    const row = read("app/app/welcome/RestaurantRow.tsx");
    expect(row).toContain("<PhoneFrame");
    expect(row).toContain('t("Example of restaurant dishes in the app.")');
    // nothing tappable or focusable is left in the row (it was a scrollable list a keyboard could focus)
    expect(row).not.toMatch(/tabIndex|onClick|href=/);
  });
});
