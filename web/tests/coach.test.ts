import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { COACH_ARMED, COACH_SCREENS, coachAfterWelcome, coachDue, coachScreenFor, coachSeen, NO_COACH, sanitizeCoach } from "../lib/mm/coach";

// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"): lib/mm/coach.ts and the tips each tab has.
vi.mock("../app/app/_lib/i18n", () => ({ useT: () => (s: string) => s }));

describe("which page is which tab", () => {
  it("knows each tab's own first page, the iPhone app's file names too", () => {
    expect(coachScreenFor("/app")).toBe("home");
    expect(coachScreenFor("/app/")).toBe("home");
    expect(coachScreenFor("/app/index.html")).toBe("home");
    expect(coachScreenFor("/app/eat-out")).toBe("eatOut");
    expect(coachScreenFor("/app/groceries/")).toBe("groceries");
    expect(coachScreenFor("/app/recipes/index.html")).toBe("recipes");
  });
  it("has no tips on any other page (a shop, a recipe, Settings, the welcome screens)", () => {
    for (const p of ["/app/groceries/shop", "/app/recipes/recipe", "/app/settings", "/app/welcome", "/app/plan", "/app/scan", "/"]) expect(coachScreenFor(p), p).toBeNull();
  });
});

describe("when the tips show", () => {
  it("never on their own: only once switched on, and each tab once", () => {
    expect(coachDue(NO_COACH, "home")).toBe(false);
    expect(coachDue(COACH_ARMED, "home")).toBe(true);
    expect(coachDue(COACH_ARMED, null)).toBe(false);
    const afterHome = coachSeen(COACH_ARMED, "home");
    expect(coachDue(afterHome, "home")).toBe(false);
    expect(coachDue(afterHome, "recipes")).toBe(true);
    expect(coachSeen(afterHome, "home")).toEqual(afterHome); // seeing a tab twice changes nothing
  });
  it("come on at the end of the welcome screens, but not for a phone that has been through them all or stopped them", () => {
    expect(coachAfterWelcome(NO_COACH)).toEqual(COACH_ARMED);
    expect(coachAfterWelcome({ armed: false, seen: ["home"] })).toEqual(COACH_ARMED);
    const stopped = { armed: false, seen: [...COACH_SCREENS] };
    expect(coachAfterWelcome(stopped)).toEqual(stopped);
  });
  it("switch themselves off once every tab's have been seen", () => {
    let s = COACH_ARMED;
    for (const screen of COACH_SCREENS) s = coachSeen(s, screen);
    expect(s.armed).toBe(false);
    expect(s.seen).toEqual([...COACH_SCREENS]);
  });
  it("keep only what they should from storage (anything else is dropped)", () => {
    expect(sanitizeCoach(null)).toEqual(NO_COACH);
    expect(sanitizeCoach("yes")).toEqual(NO_COACH);
    expect(sanitizeCoach({ armed: "true", seen: ["home"] })).toEqual({ armed: false, seen: ["home"] });
    expect(sanitizeCoach({ armed: true, seen: ["recipes", "nope", "home", 3] })).toEqual({ armed: true, seen: ["home", "recipes"] });
  });
});

describe("the tips on each tab", () => {
  it("has two to seven tips a tab, each with a title and one plain sentence, no figures and no good/bad words (CLAUDE.md rules 1 and 3)", async () => {
    const { coachStepsFor } = await import("../app/app/_components/coachSteps");
    for (const screen of COACH_SCREENS) {
      const steps = coachStepsFor(screen);
      expect(steps.length, screen).toBeGreaterThanOrEqual(2);
      expect(steps.length, screen).toBeLessThanOrEqual(7);
      for (const s of steps) {
        expect(s.title.length, s.title).toBeLessThanOrEqual(24);
        expect(s.text.length, s.text).toBeLessThanOrEqual(130);
        expect(/\b(healthy|unhealthy|good|bad|junk)\b/i.test(s.text), s.text).toBe(false);
        expect(/\d/.test(s.text), s.text).toBe(false);
      }
    }
  });

  it("points only at controls the screens mark (each data-coach name is on its page) or at a link's own address", async () => {
    const { COACH_STEPS } = await import("../app/app/_components/coachSteps");
    const files: Record<string, string> = {
      home: "app/app/page.tsx",
      eatOut: "app/app/eat-out/page.tsx",
      groceries: "app/app/groceries/page.tsx",
      recipes: "app/app/recipes/page.tsx",
    };
    const shell = readFileSync("app/app/_components/AppShell.tsx", "utf8") + readFileSync("app/app/_components/Shortcut.tsx", "utf8") + readFileSync("app/app/groceries/PageBits.tsx", "utf8");
    for (const screen of COACH_SCREENS) {
      const page = readFileSync(files[screen]!, "utf8") + shell;
      for (const step of COACH_STEPS[screen]) {
        const name = /data-coach="([^"]+)"/.exec(step.at)?.[1];
        const href = /href="([^"]+)"/.exec(step.at)?.[1];
        if (name) expect(page.includes(`data-coach="${name}"`) || page.includes(`coach="${name}"`) || page.includes(`"${name}"`), `${screen}: ${name}`).toBe(true);
        else expect(href && page.includes(`href="${href}"`), `${screen}: ${step.at}`).toBe(true);
      }
    }
  });

  it("every title and sentence is a tk() key, listed in keys.json", async () => {
    const { COACH_STEPS } = await import("../app/app/_components/coachSteps");
    const keys = new Set(JSON.parse(readFileSync("lib/mm/locales/keys.json", "utf8")) as string[]);
    const source = readFileSync("app/app/_components/coachSteps.ts", "utf8");
    for (const screen of COACH_SCREENS) {
      for (const s of COACH_STEPS[screen]) {
        for (const line of [s.title, s.text]) {
          expect(source, line).toContain(`tk(${JSON.stringify(line)})`);
          expect(keys.has(line), `run WRITE_I18N=1 npx vitest run tests/i18n.test.ts: "${line}" is not in keys.json`).toBe(true);
        }
      }
    }
  });
});
