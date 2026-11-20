import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COACH_ARMED, COACH_KEEP_CLEAR, COACH_ROUNDS, COACH_SCREENS, COACH_STOPPED, coachAfterWelcome, coachDue, coachRoundFor, coachScreenFor, coachSeen, NO_COACH, placeTip,
  sanitizeCoach, TIP_CARD_MIN, type Span,
} from "../lib/mm/coach";

// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"): lib/mm/coach.ts and the tips each tab has. The onboarding
// redesign meeting (20 November 2026): after the welcome screens the tips follow the showcases (Eat out's "Restaurants" goes), Home's come over two visits,
// and the card never covers Home's numbers or the Start here card.
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
    expect(coachDue(afterHome, "home")).toBe(false); // from Settings, Home's tips are all on one visit
    expect(coachDue(afterHome, "recipes")).toBe(true);
    expect(coachSeen(afterHome, "home")).toEqual(afterHome); // seeing a tab twice changes nothing
  });
  it("come on at the end of the welcome screens, following the showcases, but not for a phone that has been through them all or stopped them", () => {
    expect(coachAfterWelcome(NO_COACH)).toEqual({ armed: true, seen: [], afterShowcase: true });
    expect(coachAfterWelcome({ armed: false, seen: ["home"] })).toEqual({ armed: true, seen: [], afterShowcase: true });
    const stopped = { armed: false, seen: [...COACH_SCREENS] };
    expect(coachAfterWelcome(stopped)).toEqual(stopped);
    expect(coachAfterWelcome(COACH_STOPPED)).toEqual(COACH_STOPPED);
    // the old walk round the tabs is gone: an old caller's walkedTour changes nothing
    expect(coachAfterWelcome(NO_COACH, { walkedTour: true })).toEqual(coachAfterWelcome(NO_COACH, { walkedTour: false }));
    // Settings › "Show me the buttons on each screen" shows every tip
    expect("afterShowcase" in COACH_ARMED).toBe(false);
  });
  it("after the welcome screens Home's tips come over two visits: its first round, then the later one, then the tabs; then they switch off", () => {
    let s = coachAfterWelcome(NO_COACH);
    expect(coachRoundFor(s, "home")).toBe("home");
    s = coachSeen(s, "home");
    expect(coachRoundFor(s, "home")).toBe("homeLater");
    expect(coachDue(s, "home")).toBe(true);
    s = coachSeen(s, "homeLater");
    expect(coachRoundFor(s, "home")).toBeNull();
    for (const screen of ["eatOut", "groceries"] as const) s = coachSeen(s, screen);
    expect(s.armed).toBe(true);
    s = coachSeen(s, "recipes");
    expect(s.armed).toBe(false);
    // the tabs before Home's second visit: still owed, still armed
    let t = coachAfterWelcome(NO_COACH);
    for (const screen of COACH_SCREENS) t = coachSeen(t, screen);
    expect(t.armed).toBe(true);
    expect(coachRoundFor(t, "home")).toBe("homeLater");
    expect(coachSeen(t, "homeLater").armed).toBe(false);
  });
  it("switch themselves off once every tab's have been seen (from Settings: no second Home round)", () => {
    let s = COACH_ARMED;
    for (const screen of COACH_SCREENS) s = coachSeen(s, screen);
    expect(s.armed).toBe(false);
    expect(s.seen).toEqual([...COACH_SCREENS]);
    expect(coachRoundFor(s, "home")).toBeNull();
  });
  it("'Stop the tips' stops every round", () => {
    for (const screen of COACH_SCREENS) expect(coachRoundFor(COACH_STOPPED, screen), screen).toBeNull();
    expect(COACH_STOPPED.seen).toEqual([...COACH_ROUNDS]);
  });
  it("keep only what they should from storage (anything else is dropped, an old afterTour too)", () => {
    expect(sanitizeCoach(null)).toEqual(NO_COACH);
    expect(sanitizeCoach("yes")).toEqual(NO_COACH);
    expect(sanitizeCoach({ armed: "true", seen: ["home"] })).toEqual({ armed: false, seen: ["home"] });
    expect(sanitizeCoach({ armed: true, seen: ["recipes", "nope", "home", 3, "homeLater"] })).toEqual({ armed: true, seen: ["home", "homeLater", "recipes"] });
    expect(sanitizeCoach({ armed: true, seen: [], afterShowcase: true })).toEqual({ armed: true, seen: [], afterShowcase: true });
    expect(sanitizeCoach({ armed: true, seen: [], afterTour: true })).toEqual({ armed: true, seen: [] });
    expect("afterShowcase" in sanitizeCoach({ armed: true, seen: [], afterShowcase: "yes" })).toBe(false);
    const after = coachAfterWelcome(NO_COACH);
    expect(sanitizeCoach(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });
});

describe("where the tip's card goes (clear of Home's numbers and the Start here card where it fits, never cut short)", () => {
  const overlaps = (a: Span, b: Span) => a.top < b.bottom && b.top < a.bottom;
  const VH = 844;
  /** The stretches of the screen (16 px from each edge) the hole and the keep-clear parts leave, with 12 px round each. */
  const freeRoom = (hole: Span, clear: readonly Span[], vh: number) => {
    const taken = [hole, ...clear].map((s) => ({ top: s.top - 12, bottom: s.bottom + 12 })).sort((a, b) => a.top - b.top);
    const out: Span[] = [];
    let at = 16;
    for (const s of taken) {
      if (s.top > at) out.push({ top: at, bottom: Math.min(s.top, vh - 16) });
      at = Math.max(at, s.bottom);
    }
    if (at < vh - 16) out.push({ top: at, bottom: vh - 16 });
    return out;
  };
  it("with nothing to keep clear: under the lit control if it fits, else over it", () => {
    expect(placeTip({ hole: { top: 100, bottom: 200 }, clear: [], card: 220, vh: VH })).toEqual({ top: 212, maxHeight: VH - 16 - 212, below: true });
    expect(placeTip({ hole: { top: 600, bottom: 700 }, clear: [], card: 220, vh: VH })).toEqual({ top: 600 - 12 - 220, maxHeight: 600 - 12 - 16, below: false });
  });
  it("'Your day': the numbers lit (never kept clear of themselves) with the Start here card right under them, so the page scrolls once and the card goes under the Start here card", () => {
    const start = { top: 510, bottom: 760 };
    const first = placeTip({ hole: { top: 194, bottom: 506 }, clear: [start], card: 230, vh: VH });
    expect("scroll" in first).toBe(true);
    const by = "scroll" in first ? first.scroll : 0;
    expect(194 - by).toBeGreaterThanOrEqual(16); // the lit numbers stay wholly on the screen
    const shift = (s: Span) => ({ top: s.top - by, bottom: s.bottom - by });
    const then = placeTip({ hole: { top: 194 - by, bottom: 506 - by }, clear: [shift(start)], card: 230, vh: VH, scrolled: true });
    expect("top" in then).toBe(true);
    if ("top" in then) {
      const card = { top: then.top, bottom: then.top + Math.min(230, then.maxHeight) };
      expect(then.maxHeight).toBeGreaterThanOrEqual(230);
      expect(overlaps(card, shift(start))).toBe(false);
      expect(overlaps(card, { top: 194 - by, bottom: 506 - by })).toBe(false);
      expect(card.bottom).toBeLessThanOrEqual(VH - 16);
    }
    // a taller Start here card: the scroll stops with the numbers' top on the screen, and the card, whole, covers the Start here card instead
    const tall = { top: 510, bottom: 790 };
    const scroll = placeTip({ hole: { top: 194, bottom: 506 }, clear: [tall], card: 230, vh: VH });
    expect(scroll).toEqual({ scroll: 194 - 16 });
    const after = placeTip({ hole: { top: 16, bottom: 328 }, clear: [{ top: tall.top - 178, bottom: tall.bottom - 178 }], card: 230, vh: VH, scrolled: true });
    expect(after).toEqual({ top: 340, maxHeight: VH - 16 - 340, below: true });
  });
  it("'Moving around': the fixed tab bar lit, the page scrolled so both cards sit above the tip's card", () => {
    const bar = { top: 712, bottom: 838 };
    const clear = [{ top: 200, bottom: 500 }, { top: 510, bottom: 790 }];
    const first = placeTip({ hole: bar, clear, card: 230, vh: VH, fixed: true });
    expect("scroll" in first).toBe(true);
    const by = "scroll" in first ? first.scroll : 0;
    const then = placeTip({ hole: bar, clear: clear.map((s) => ({ top: s.top - by, bottom: s.bottom - by })), card: 230, vh: VH, fixed: true, scrolled: true });
    expect(then).toMatchObject({ below: false });
    if ("top" in then) {
      const card = { top: then.top, bottom: then.top + 230 };
      expect(card.bottom).toBeLessThanOrEqual(bar.top);
      for (const c of clear) expect(overlaps(card, { top: c.top - by, bottom: c.bottom - by })).toBe(false);
    }
  });
  it("'Shopping list, Settings' at the top right, the numbers and the Start here card filling the screen under it: the card goes under it whole, over the numbers", () => {
    const out = placeTip({ hole: { top: 4, bottom: 56 }, clear: [{ top: 280, bottom: 560 }, { top: 572, bottom: 830 }], card: 243, vh: VH });
    expect(out).toEqual({ top: 68, maxHeight: VH - 16 - 68, below: true });
  });
  it("a lit control taller than the screen: the card still shows whole, on the screen (Next and 'Stop the tips' never cut off)", () => {
    const hole = { top: 4, bottom: 900 };
    const out = placeTip({ hole, clear: [hole], card: 243, vh: 568 });
    expect("top" in out).toBe(true);
    if ("top" in out) {
      expect(out.maxHeight).toBeGreaterThanOrEqual(243);
      expect(out.top).toBeGreaterThanOrEqual(16);
      expect(out.top + 243).toBeLessThanOrEqual(568 - 16);
    }
  });
  it("'Your day' on a 667 px phone with 300 px of numbers: one scroll keeps the numbers wholly on the screen and the card whole under them", () => {
    const vh = 667;
    const numbers = { top: 150, bottom: 450 };
    const hole = { top: numbers.top - 6, bottom: numbers.bottom + 6 };
    const start = { top: 460, bottom: 740 };
    const first = placeTip({ hole, clear: [start], card: 250, vh });
    expect("scroll" in first).toBe(true);
    const by = "scroll" in first ? first.scroll : 0;
    expect(hole.top - by).toBeGreaterThanOrEqual(16);
    const lit = { top: hole.top - by, bottom: hole.bottom - by };
    const then = placeTip({ hole: lit, clear: [{ top: start.top - by, bottom: start.bottom - by }], card: 250, vh, scrolled: true });
    expect("top" in then).toBe(true);
    if ("top" in then) {
      expect(then.maxHeight).toBeGreaterThanOrEqual(250);
      expect(then.top + 250).toBeLessThanOrEqual(vh - 16);
      expect(overlaps({ top: then.top, bottom: then.top + 250 }, lit)).toBe(false);
    }
  });
  it("on any screen, after its one scroll: never shorter than the card's minimum, always on the screen, and clear of what it keeps clear whenever the screen has room for it whole", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) {
      const vh = 560 + Math.round(rnd() * 400);
      const top = Math.round(rnd() * (vh - 100));
      const hole = { top, bottom: top + 40 + Math.round(rnd() * 200) };
      const c = Math.round(rnd() * vh);
      const clear = [{ top: c, bottom: c + 60 + Math.round(rnd() * 300) }];
      const height = 180 + Math.round(rnd() * 80);
      const out = placeTip({ hole, clear, card: height, vh, scrolled: true });
      const say = JSON.stringify({ vh, hole, clear, out });
      expect("top" in out, say).toBe(true);
      if ("top" in out) {
        expect(out.maxHeight, say).toBeGreaterThanOrEqual(TIP_CARD_MIN);
        expect(out.top, say).toBeGreaterThanOrEqual(16);
        const card = { top: out.top, bottom: out.top + Math.min(height, out.maxHeight) };
        expect(card.bottom, say).toBeLessThanOrEqual(vh - 16);
        if (freeRoom(hole, clear, vh).some((s) => s.bottom - s.top >= height)) {
          expect(out.maxHeight, say).toBeGreaterThanOrEqual(height);
          for (const k of clear) expect(overlaps(card, k), say).toBe(false);
          expect(overlaps(card, hole), say).toBe(false);
        } else if (Math.max(vh - 16 - (hole.bottom + 12), hole.top - 12 - 16) >= height) {
          // no room clear of everything: what is kept clear gives way, but never the lit control while there is room beside it
          expect(out.maxHeight, say).toBeGreaterThanOrEqual(height);
          expect(overlaps(card, hole), say).toBe(false);
        }
      }
    }
  });
  it("Home keeps its numbers and the Start here card clear, and both are marked on the page", () => {
    expect(COACH_KEEP_CLEAR.home).toEqual(['[data-coach="home-numbers"]', '[data-coach="home-start"]']);
    expect(readFileSync("app/app/_components/HomePages.tsx", "utf8")).toContain('data-coach="home-numbers"');
    expect(readFileSync("app/app/_components/StartHere.tsx", "utf8")).toContain('data-coach="home-start"');
  });
});

describe("the tips on each tab", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("has two to seven tips a tab (Home's later visit one or two), each with a title and a short plain line, no figures and no good/bad words (CLAUDE.md rules 1 and 3)", async () => {
    const { COACH_STEPS, coachStepsFor } = await import("../app/app/_components/coachSteps");
    for (const screen of COACH_SCREENS) {
      for (const state of [undefined, { afterShowcase: true }]) {
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
    const later = coachStepsFor("homeLater", { afterShowcase: true });
    expect(later.length).toBeGreaterThanOrEqual(1);
    expect(later.length).toBeLessThanOrEqual(2);
  });

  it("after the welcome screens: Home's first visit teaches 'Your day', the + and 'Moving around'; its second the Scan your food card and the top right; Eat out leaves out 'Restaurants'", async () => {
    const { coachStepsFor } = await import("../app/app/_components/coachSteps");
    const after = coachAfterWelcome(NO_COACH);
    const titles = (round: Parameters<typeof coachStepsFor>[0], state?: Parameters<typeof coachStepsFor>[1]) => coachStepsFor(round, state).map((s) => s.title);
    expect(titles("home", after)).toEqual(["Your day", "Add what you ate", "Moving around"]);
    expect(titles("homeLater", after).filter((t) => t !== "Scan your food")).toEqual(["Shopping list, Settings"]);
    expect(titles("eatOut", after)).toEqual(["Search", "Near me"]);
    expect(titles("groceries", after)).toEqual(["Your supermarkets", "Search every shop", "Scan a barcode"]);
    // stored and read back, the same
    expect(titles("eatOut", sanitizeCoach(JSON.parse(JSON.stringify(after))))).toEqual(["Search", "Near me"]);
    // the + is left out on the page while the Start here card (which teaches it) is there; only "Moving around" has Pip hop along the tab bar
    const home = coachStepsFor("home", after);
    expect(home.find((s) => s.title === "Add what you ate")!.unless).toBe('[data-coach="home-start"]');
    expect(home.filter((s) => s.hop).map((s) => s.title)).toEqual(["Moving around"]);
  });

  it("each tab's tips, in order, from Settings (every tip, Home's on one visit): no tip for a card that names itself, an empty list or a button another tab teaches", async () => {
    const { COACH_STEPS, coachStepsFor } = await import("../app/app/_components/coachSteps");
    const titles = (screen: (typeof COACH_SCREENS)[number]) => coachStepsFor(screen, COACH_ARMED).map((s) => s.title);
    const home = titles("home").filter((t) => t !== "Scan your food"); // Scan your food only where it's built
    expect(home).toEqual(["Your day", "Add what you ate", "Shopping list, Settings", "Moving around"]);
    expect(titles("eatOut")).toEqual(["Search", "Near me", "Restaurants"]);
    expect(titles("groceries")).toEqual(["Your supermarkets", "Search every shop", "Scan a barcode"]);
    expect(titles("recipes")).toEqual(["Choose a meal", "My recipes"]);
    // the Your day line is true whether Home's pages slide with dots or stack with none (the 30-person audit, 20 November 2026)
    expect(coachStepsFor("home")[0]!.text).toBe("What you've eaten today and what's left, and your week.");
    expect(coachStepsFor("home")[0]!.text).not.toMatch(/slide|dots|swipe/i);
    // the Scan your food tip says what its card and button say: calories and macros
    expect(COACH_STEPS.home.find((s) => s.title === "Scan your food")!.text).toContain("calories and macros");
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
    const shell = readFileSync("app/app/_components/AppShell.tsx", "utf8") + readFileSync("app/app/_components/Shortcut.tsx", "utf8") + readFileSync("app/app/groceries/PageBits.tsx", "utf8") + readFileSync("app/app/_components/RecipeTools.tsx", "utf8") + readFileSync("app/app/_components/TopActions.tsx", "utf8") + readFileSync("app/app/_components/StartHere.tsx", "utf8");
    for (const screen of COACH_SCREENS) {
      const page = readFileSync(files[screen]!, "utf8") + (screen === "home" ? readFileSync(files.homePages!, "utf8") : "") + shell;
      for (const step of COACH_STEPS[screen]) {
        const name = /data-coach="([^"]+)"/.exec(step.at)?.[1];
        const href = /href="([^"]+)"/.exec(step.at)?.[1];
        if (name) expect(page.includes(`data-coach="${name}"`) || page.includes(`coach="${name}"`) || page.includes(`"${name}"`), `${screen}: ${name}`).toBe(true);
        else expect(href && page.includes(`href="${href}"`), `${screen}: ${step.at}`).toBe(true);
        const unless = step.unless && /data-coach="([^"]+)"/.exec(step.unless)?.[1];
        if (step.unless) expect(unless && page.includes(`data-coach="${unless}"`), `${screen}: ${step.unless}`).toBe(true);
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
