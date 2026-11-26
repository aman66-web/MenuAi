import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaidState } from "../lib/mm/paid";

// Meal plan after the free week (founder, 26 November 2026: "If they click a meal plan, it will show up saying they'll have to get a membership ... buy a year
// or buy a month ... if they click a meal plan and it's after the 7-day free trial and they haven't purchased"). lib/mm/mealPlanGate.ts decides; these check
// its answer on each build and for each kind of access, and that every way into Meal plan asks it.

const NOW = Date.UTC(2026, 10, 26, 12);
const DAY = 86_400_000;
const paid = (patch: Partial<PaidState> = {}): PaidState => ({ token: null, plan: null, until: null, unlockUntil: null, ...patch });
const TOKEN = "v1.eyJwbGFuIjoidHJpYWwifQ.c2lnbmF0dXJlLWZvci10ZXN0cw";

const NOTHING = paid();
const FREE_WEEK_RUNNING = paid({ token: TOKEN, plan: "trial", until: NOW + 3 * DAY });
const FREE_WEEK_ENDED = paid({ token: TOKEN, plan: "trial", until: NOW - DAY });
const FREE_WEEK_ENDS_NOW = paid({ token: TOKEN, plan: "trial", until: NOW });
const BOUGHT_YEAR = paid({ token: TOKEN, plan: "annual", until: NOW + 300 * DAY });
const BOUGHT_MONTH = paid({ token: TOKEN, plan: "monthly", until: NOW + 20 * DAY });
const MONTH_LAPSED = paid({ token: TOKEN, plan: "monthly", until: NOW - DAY });
const GIFT = paid({ token: TOKEN, plan: "gift", until: NOW + 30 * DAY });
const SHARE_UNLOCK = paid({ unlockUntil: NOW + DAY });

/** Loads the gate as a build made with `env` would have it (the switches are read when lib/mm/config.ts loads). */
async function build(env: Record<string, string>) {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("../lib/mm/mealPlanGate");
}

const IPHONE = { NODE_ENV: "production", NEXT_PUBLIC_APP_BUILD: "1", NEXT_PUBLIC_IAP: "1", NEXT_PUBLIC_APP_VERSION: "1.1 (21)" };
const ANDROID = { NODE_ENV: "production", NEXT_PUBLIC_APP_BUILD: "1", NEXT_PUBLIC_IAP: "1", NEXT_PUBLIC_APP_VERSION: "Android 1.1 (3)" };
const WEBSITE = { NODE_ENV: "production" };
/** The browser tests' build (NEXT_PUBLIC_PRO=1, samples on): Premium is told apart, and the testers' Premium preview (devProOverride) counts. */
const TEST_BUILD = { NODE_ENV: "production", NEXT_PUBLIC_PRO: "1", NEXT_PUBLIC_SHOW_SAMPLE_DATA: "1" };

describe("what tapping Meal plan does (lib/mm/mealPlanGate.ts)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  for (const [name, env] of [["the iPhone app", IPHONE], ["the Android app", ANDROID]] as const) {
    it(`${name}: after the free week, with nothing bought, the Premium sheet; during it, or with Premium, the plan`, async () => {
      const m = await build(env);
      const off = { devProOverride: false };
      expect(m.mealPlanDoorFor(off, NOTHING, NOW)).toBe("premium");
      expect(m.mealPlanDoorFor(off, FREE_WEEK_ENDED, NOW)).toBe("premium");
      expect(m.mealPlanDoorFor(off, FREE_WEEK_ENDS_NOW, NOW), "the week's last moment has gone").toBe("premium");
      expect(m.mealPlanDoorFor(off, MONTH_LAPSED, NOW), "a month that ran out").toBe("premium");
      expect(m.mealPlanDoorFor(off, FREE_WEEK_RUNNING, NOW)).toBe("plan");
      expect(m.mealPlanDoorFor(off, BOUGHT_YEAR, NOW)).toBe("plan");
      expect(m.mealPlanDoorFor(off, BOUGHT_MONTH, NOW)).toBe("plan");
      expect(m.mealPlanDoorFor(off, GIFT, NOW)).toBe("plan");
      expect(m.mealPlanDoorFor(off, SHARE_UNLOCK, NOW)).toBe("plan");
      expect(m.mealPlanDoor(false)).toBe("premium");
      expect(m.mealPlanDoor(true)).toBe("plan");
    });

    it(`${name}: the testers' Premium preview switch does nothing in a store build`, async () => {
      const m = await build(env);
      expect(m.mealPlanDoorFor({ devProOverride: true }, NOTHING, NOW)).toBe("premium");
      expect(m.mealPlanDoorFor({ devProOverride: true }, FREE_WEEK_ENDED, NOW)).toBe("premium");
    });
  }

  it("the website, which sells nothing: always the plan, whatever the phone keeps", async () => {
    const m = await build(WEBSITE);
    for (const p of [NOTHING, FREE_WEEK_ENDED, MONTH_LAPSED, FREE_WEEK_RUNNING, BOUGHT_YEAR]) {
      expect(m.mealPlanDoorFor({ devProOverride: false }, p, NOW)).toBe("plan");
    }
    // even where a caller passes "not Premium": with no gating the door never shows the sheet
    expect(m.mealPlanDoor(false)).toBe("plan");
  });

  it("the browser tests' build: Premium preview off is the sheet, on is the plan, as are the free week and a purchase", async () => {
    const m = await build(TEST_BUILD);
    expect(m.mealPlanDoorFor({ devProOverride: false }, NOTHING, NOW)).toBe("premium");
    expect(m.mealPlanDoorFor({ devProOverride: false }, FREE_WEEK_ENDED, NOW)).toBe("premium");
    expect(m.mealPlanDoorFor({ devProOverride: true }, NOTHING, NOW)).toBe("plan");
    expect(m.mealPlanDoorFor({ devProOverride: false }, FREE_WEEK_RUNNING, NOW)).toBe("plan");
    expect(m.mealPlanDoorFor({ devProOverride: false }, BOUGHT_YEAR, NOW)).toBe("plan");
  });

  it("the free week's end is the moment it ends: the same phone opens the plan before it and the sheet after it", async () => {
    const m = await build(IPHONE);
    const ends = paid({ token: TOKEN, plan: "trial", until: NOW });
    expect(m.mealPlanDoorFor({ devProOverride: false }, ends, NOW - 1)).toBe("plan");
    expect(m.mealPlanDoorFor({ devProOverride: false }, ends, NOW + 1)).toBe("premium");
  });
});

// Every way into Meal plan asks the gate: a link or button to /app/plan anywhere in the app, other than the page itself and the tab bar's list of which
// addresses light Home (app/app/_lib/tabs.ts, which opens nothing), sits in a file that uses mealPlanDoor or gate("mealPlan", ...).
describe("every way into Meal plan asks the gate", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  walk("app");
  walk("lib");
  const opens = files
    .filter((f) => !f.startsWith(join("app", "app", "plan")) && f !== join("app", "app", "_lib", "tabs.ts"))
    .filter((f) => /["'`]\/app\/plan(?:[?#"'`]|\/["'`])/.test(readFileSync(f, "utf8")));

  it("finds the ways in: Home's card, the plan-ready notice and Ask Pip's button", () => {
    expect(opens.map((f) => f.split(/[\\/]/).pop()).sort()).toEqual(["AskPip.tsx", "PlanMakingBanner.tsx", "RecipeTools.tsx"]);
  });

  it("each of them asks mealPlanDoor or gates on mealPlan", () => {
    for (const f of opens) expect(readFileSync(f, "utf8"), f).toMatch(/mealPlanDoor|gate\("mealPlan"/);
  });

  it("the page itself shows the Premium sheet in place of the plan, and no preview page", () => {
    const page = readFileSync("app/app/plan/page.tsx", "utf8");
    expect(page).toMatch(/mealPlanDoor\(pro\) === "premium"/);
    expect(page).toMatch(/showPaywall\("mealPlan"/);
    expect(page).not.toMatch(/function PremiumIntro|<PremiumIntro|t\("See Premium"\)|function WeekPreview/);
  });
});
