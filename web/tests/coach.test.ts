import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(coachAfterWelcome(stopped, { walkedTour: true })).toEqual(stopped);
  });
  it("remember a walked tour only when told so (only the replay's Done passes nothing; 'Look around first' passes walkedTour like the end of the questions, false after 'Skip tour')", () => {
    expect(coachAfterWelcome(NO_COACH, { walkedTour: true })).toEqual({ armed: true, seen: [], afterTour: true });
    expect("afterTour" in coachAfterWelcome(NO_COACH)).toBe(false);
    expect("afterTour" in coachAfterWelcome(NO_COACH, {})).toBe(false);
    expect("afterTour" in coachAfterWelcome(NO_COACH, { walkedTour: false })).toBe(false);
    // a second set-up without the walk doesn't keep the first one's flag
    expect("afterTour" in coachAfterWelcome({ armed: true, seen: ["home"], afterTour: true })).toBe(false);
    // Settings › "Show me the buttons on each screen" shows every tip
    expect("afterTour" in COACH_ARMED).toBe(false);
  });
  it("keep the walked tour while the tabs' tips are seen", () => {
    const walked = coachAfterWelcome(NO_COACH, { walkedTour: true });
    expect(coachSeen(walked, "home")).toEqual({ armed: true, seen: ["home"], afterTour: true });
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
    expect(sanitizeCoach({ armed: true, seen: [], afterTour: true })).toEqual({ armed: true, seen: [], afterTour: true });
    expect("afterTour" in sanitizeCoach({ armed: true, seen: [], afterTour: "yes" })).toBe(false);
    expect("afterTour" in sanitizeCoach({ armed: true, seen: [] })).toBe(false);
  });
});

describe("the tips on each tab", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("has two to seven tips a tab, each with a title and a short plain line, no figures and no good/bad words (CLAUDE.md rules 1 and 3)", async () => {
    const { COACH_STEPS, coachStepsFor } = await import("../app/app/_components/coachSteps");
    for (const screen of COACH_SCREENS) {
      for (const state of [undefined, { afterTour: true }]) {
        const steps = coachStepsFor(screen, state);
        expect(steps.length, screen).toBeGreaterThanOrEqual(2);
        expect(steps.length, screen).toBeLessThanOrEqual(7);
      }
      // every wording, the ones for other builds too (the + tip's Premium line is 136 characters)
      for (const s of COACH_STEPS[screen]) {
        expect(s.title.length, s.title).toBeLessThanOrEqual(24);
        expect(s.text.length, s.text).toBeLessThanOrEqual(140);
        expect(/\b(healthy|unhealthy|good|bad|junk)\b/i.test(s.text), s.text).toBe(false);
        expect(/\d/.test(s.text), s.text).toBe(false);
      }
    }
  });

  it("teach each button once: after a walked tour Home has no 'Moving around'; after 'Skip tour' or from Settings it does", async () => {
    const { coachStepsFor } = await import("../app/app/_components/coachSteps");
    const titles = (state?: Parameters<typeof coachStepsFor>[1]) => coachStepsFor("home", state).map((s) => s.title);
    expect(titles(coachAfterWelcome(NO_COACH, { walkedTour: true }))).not.toContain("Moving around");
    expect(titles(coachAfterWelcome(NO_COACH, { walkedTour: false }))).toContain("Moving around");
    expect(titles(coachAfterWelcome(NO_COACH))).toContain("Moving around");
    expect(titles(COACH_ARMED)).toContain("Moving around");
    expect(titles(sanitizeCoach(JSON.parse(JSON.stringify(coachAfterWelcome(NO_COACH, { walkedTour: true })))))).not.toContain("Moving around");
  });

  it("each tab's tips, in order: no tip for a card that names itself, an empty list or a button another tab teaches", async () => {
    const { coachStepsFor } = await import("../app/app/_components/coachSteps");
    const titles = (screen: (typeof COACH_SCREENS)[number]) => coachStepsFor(screen).map((s) => s.title);
    const home = titles("home").filter((t) => t !== "Scan your food"); // Scan your food only where it's built
    expect(home).toEqual(["Your day", "Add what you ate", "Shopping list, Settings", "Moving around"]);
    expect(titles("eatOut")).toEqual(["Search", "Near me", "Restaurants"]);
    expect(titles("groceries")).toEqual(["Your supermarkets", "Search every shop", "Scan a barcode"]);
    expect(titles("recipes")).toEqual(["Choose a meal", "My recipes"]);
    // the Your day line stays as the Home pages have it
    expect(coachStepsFor("home")[0]!.text).toBe("What you've eaten today and what's left. Slide the cards or tap the dots to see your week.");
    expect(coachStepsFor("home")[0]!.at).toBe('[data-coach="home-numbers"]');
  });

  it("the + tip (tip 2 on Home) says 'Premium' exactly when adding a meal is paid on the build (LOG_IS_PAID), never from bare needsPaywall", async () => {
    // [env, is logging paid]: the website and free builds (no gating), the iPhone app's In-App Purchase build (PAID_TIER_ONLY keeps logging free), Pro on
    const builds: Array<[Record<string, string>, boolean]> = [
      [{}, false],
      [{ NEXT_PUBLIC_APP_BUILD: "1", NEXT_PUBLIC_IAP: "1" }, false],
      [{ NEXT_PUBLIC_PRO: "1" }, true],
    ];
    for (const [env, paid] of builds) {
      vi.unstubAllEnvs();
      vi.resetModules();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { coachStepsFor } = await import("../app/app/_components/coachSteps");
      const { LOG_IS_PAID } = await import("../lib/mm/entitlements");
      const tip = coachStepsFor("home")[1]!;
      expect(LOG_IS_PAID, JSON.stringify(env)).toBe(paid);
      expect(tip.title).toBe("Add what you ate");
      expect(tip.text.includes("Premium"), `${JSON.stringify(env)}: ${tip.text}`).toBe(LOG_IS_PAID);
      expect(coachStepsFor("home").filter((s) => s.title === "Add what you ate")).toHaveLength(1);
    }
  });

  it("points only at controls the screens mark (each data-coach name is on its page) or at a link's own address", async () => {
    const { COACH_STEPS } = await import("../app/app/_components/coachSteps");
    const files: Record<string, string> = {
      home: "app/app/page.tsx",
      // Home's numbers moved into their own pages (2026-11-19): the "Your day" tip's marker is on them
      homePages: "app/app/_components/HomePages.tsx",
      eatOut: "app/app/eat-out/page.tsx",
      groceries: "app/app/groceries/page.tsx",
      recipes: "app/app/recipes/page.tsx",
    };
    const shell = readFileSync("app/app/_components/AppShell.tsx", "utf8") + readFileSync("app/app/_components/Shortcut.tsx", "utf8") + readFileSync("app/app/groceries/PageBits.tsx", "utf8") + readFileSync("app/app/_components/RecipeTools.tsx", "utf8") + readFileSync("app/app/_components/TopActions.tsx", "utf8");
    for (const screen of COACH_SCREENS) {
      const page = readFileSync(files[screen]!, "utf8") + (screen === "home" ? readFileSync(files.homePages!, "utf8") : "") + shell;
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
