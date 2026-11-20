import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analytics,
  createSetupScreenReporter,
  INSTALL_ID_KEY,
  reportSetupScreen,
  SETUP_SCREEN_SIGNAL,
  SETUP_SCREENS,
  TELEMETRY_URL,
  type SetupScreen,
  type SetupScreenReporterDeps,
} from "../lib/mm/analytics";
import { TELEMETRY_APP_ID, TELEMETRY_ENABLED } from "../lib/mm/config";
import type { KeyValueStorage } from "../lib/mm/persist";
import { WELCOME_STEPS } from "../lib/mm/welcomeSteps";

// The setup screen counts (the onboarding meeting of 19 November 2026, question 10): TelemetryDeck by plain fetch, BUILT SWITCHED OFF. Off, nothing is sent and
// nothing is stored; on, a signal carries only "setupScreen", the screen's name and a hash of a random number kept on the device (mm.v1.installId).

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  writes = 0;
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => {
    this.writes++;
    this.data.set(k, v);
  };
  removeItem = (k: string) => void this.data.delete(k);
}

const ID = "0123456789abcdef0123456789abcdef";
// a stand-in for SHA-256 that, like it, doesn't contain the text it was made from
const hashOf = (text: string) => `hashed:${[...text].reverse().join("")}`;
const settle = () => new Promise((r) => setTimeout(r, 0));

function deps(over: Partial<SetupScreenReporterDeps> = {}) {
  const storage = new MemoryStorage();
  const fetch = vi.fn(async () => new Response("1"));
  const randomId = vi.fn(() => ID);
  const sha256 = vi.fn(async (t: string) => hashOf(t));
  const d: SetupScreenReporterDeps = { appId: "APP-ID", fetch: fetch as unknown as typeof globalThis.fetch, storage: () => storage, randomId, sha256, testMode: false, ...over };
  return { d, storage, fetch, randomId, sha256 };
}

/** The signals in each request sent. */
const bodies = (fetch: ReturnType<typeof deps>["fetch"]) => fetch.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)) as unknown[]);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("setup screen counts: switched off", () => {
  it("is off in this build: NEXT_PUBLIC_TELEMETRY_APP_ID is not set", () => {
    expect(process.env.NEXT_PUBLIC_TELEMETRY_APP_ID ?? "").toBe("");
    expect(TELEMETRY_APP_ID).toBe("");
    expect(TELEMETRY_ENABLED).toBe(false);
  });

  it("with no app ID, nothing is sent, no number is made and nothing is stored", async () => {
    const { d, storage, fetch, randomId, sha256 } = deps({ appId: "" });
    const r = createSetupScreenReporter(d);
    for (const s of SETUP_SCREENS) r.report(s);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(randomId).not.toHaveBeenCalled();
    expect(sha256).not.toHaveBeenCalled();
    expect(storage.writes).toBe(0);
    expect(storage.data.size).toBe(0);
  });

  it("an app ID of spaces only counts as unset", async () => {
    const { d, fetch } = deps({ appId: "   " });
    createSetupScreenReporter(d).report("cover");
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the app's own reportSetupScreen sends nothing and stores nothing with the variable unset", async () => {
    const fetch = vi.fn(async () => new Response("1"));
    const storage = new MemoryStorage();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", storage);
    for (const s of SETUP_SCREENS) reportSetupScreen(s);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.data.has(INSTALL_ID_KEY)).toBe(false);
    expect(storage.writes).toBe(0);
  });
});

describe("setup screen counts: switched on", () => {
  it("sends exactly the screen's name and the hashed number, to TelemetryDeck, with no cookies or referrer", async () => {
    const { d, storage, fetch } = deps();
    createSetupScreenReporter(d).report("cover");
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TELEMETRY_URL);
    expect(url).toBe("https://nom.telemetrydeck.com/v2/");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(bodies(fetch)[0]).toEqual([{ appID: "APP-ID", clientUser: hashOf(ID), type: SETUP_SCREEN_SIGNAL, payload: { "Setup.screen": "cover" } }]);
    expect(SETUP_SCREEN_SIGNAL).toBe("setupScreen");
    // the raw number never leaves the device; it stays in its own key
    expect(String(init.body)).not.toContain(ID);
    expect(storage.data.get(INSTALL_ID_KEY)).toBe(ID);
    expect(INSTALL_ID_KEY).toBe("mm.v1.installId");
  });

  it("counts each screen once per page load, with the same number for every screen", async () => {
    const { d, fetch, randomId } = deps();
    const r = createSetupScreenReporter(d);
    r.report("cover");
    r.report("cover");
    r.report("goal");
    r.report("eatOut");
    r.report("goal");
    await settle();
    expect(bodies(fetch).map((b) => (b[0] as { payload: Record<string, string> }).payload["Setup.screen"])).toEqual(["cover", "goal", "eatOut"]);
    expect(new Set(bodies(fetch).map((b) => (b[0] as { clientUser: string }).clientUser))).toEqual(new Set([hashOf(ID)]));
    expect(randomId).toHaveBeenCalledTimes(1);
  });

  it("keeps the number made earlier on this device", async () => {
    const { d, storage, fetch, randomId } = deps();
    storage.data.set(INSTALL_ID_KEY, "f".repeat(32));
    createSetupScreenReporter(d).report("goal");
    await settle();
    expect(randomId).not.toHaveBeenCalled();
    expect((bodies(fetch)[0]![0] as { clientUser: string }).clientUser).toBe(hashOf("f".repeat(32)));
  });

  it("replaces a stored value that isn't one of its numbers", async () => {
    const { d, storage } = deps();
    storage.data.set(INSTALL_ID_KEY, "someone@example.com");
    createSetupScreenReporter(d).report("goal");
    await settle();
    expect(storage.data.get(INSTALL_ID_KEY)).toBe(ID);
  });

  it("drops any name that isn't a setup screen", async () => {
    const { d, fetch } = deps();
    const r = createSetupScreenReporter(d);
    for (const bad of ["", "someone@example.com", "goal:lose", "2000 kcal", "Cover"]) r.report(bad as SetupScreen);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends nothing where the phone can't hash (the raw number is never sent instead)", async () => {
    const { d, fetch } = deps({ sha256: async () => null });
    createSetupScreenReporter(d).report("cover");
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks test builds' signals as test signals", async () => {
    const { d, fetch } = deps({ testMode: true });
    createSetupScreenReporter(d).report("save");
    await settle();
    expect(bodies(fetch)[0]).toEqual([{ appID: "APP-ID", clientUser: hashOf(ID), type: "setupScreen", payload: { "Setup.screen": "save" }, isTestMode: true }]);
  });

  it("never throws: offline, refused, or storage blocked", async () => {
    const offline = deps({ fetch: (async () => { throw new TypeError("Load failed"); }) as unknown as typeof fetch });
    expect(() => createSetupScreenReporter(offline.d).report("cover")).not.toThrow();
    const blocked = deps({ storage: () => { throw new Error("SecurityError"); } });
    const r = createSetupScreenReporter(blocked.d);
    expect(() => r.report("cover")).not.toThrow();
    expect(() => r.forget()).not.toThrow();
    await settle();
    // blocked storage: a number for this page load only, still hashed
    expect((bodies(blocked.fetch)[0]![0] as { clientUser: string }).clientUser).toBe(hashOf(ID));
  });

  it("Clear data removes the number, and the next screens count as a new phone", async () => {
    const { d, storage, fetch, randomId } = deps();
    const r = createSetupScreenReporter(d);
    r.report("cover");
    await settle();
    expect(storage.data.has(INSTALL_ID_KEY)).toBe(true);
    r.forget();
    expect(storage.data.has(INSTALL_ID_KEY)).toBe(false);
    randomId.mockReturnValue("a".repeat(32));
    r.report("cover");
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((bodies(fetch)[1]![0] as { clientUser: string }).clientUser).toBe(hashOf("a".repeat(32)));
  });

  it("the app's own reportSetupScreen sends once the variable is set at build time (real hashing, random number in localStorage)", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_APP_ID", " MY-APP ");
    const fetch = vi.fn(async () => new Response("1"));
    const storage = new MemoryStorage();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const config = await import("../lib/mm/config");
    const fresh = await import("../lib/mm/analytics");
    expect(config.TELEMETRY_ENABLED).toBe(true);
    expect(config.TELEMETRY_APP_ID).toBe("MY-APP");
    fresh.reportSetupScreen("save");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const id = storage.data.get(INSTALL_ID_KEY)!;
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const [signal] = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Array<Record<string, unknown>>;
    expect(Object.keys(signal!).sort()).toEqual(["appID", "clientUser", "isTestMode", "payload", "type"]);
    expect(signal!.appID).toBe("MY-APP");
    expect(signal!.payload).toEqual({ "Setup.screen": "save" });
    expect(signal!.clientUser).toMatch(/^[0-9a-f]{64}$/);
    expect(signal!.clientUser).not.toContain(id);
    fresh.forgetInstallId();
    expect(storage.data.has(INSTALL_ID_KEY)).toBe(false);
  });
});

describe("the number stays on the device", () => {
  it("is not one of the synced stores or settings", () => {
    const sync = readFileSync(new URL("../lib/mm/syncStores.ts", import.meta.url), "utf8");
    expect(sync).not.toMatch(/installId/i);
  });
  it("Settings › Clear data removes it", () => {
    // Clear data is one function since 20 November 2026 (app/app/_lib/clearData.ts; tests/clearData.test.ts checks every store is in it), called by Settings
    const settings = readFileSync(new URL("../app/app/settings/page.tsx", import.meta.url), "utf8");
    const clear = readFileSync(new URL("../app/app/_lib/clearData.ts", import.meta.url), "utf8");
    expect(settings).toContain("await clearDeviceData();");
    expect(clear).toContain('"mm.v1.installId": () => forgetInstallId()');
  });
});

// The onboarding redesign meeting (20 November 2026, build list 15): the counts follow the welcome steps by name; no event carries the goal (GLP-1 is health
// data), a body answer or a nutrition figure; and all of it stays silent until the founder switches TelemetryDeck on.
describe("the welcome steps' events", () => {
  it("names the cover, the eleven steps and the returning sign-in, and none of the screens that were removed", () => {
    expect(SETUP_SCREENS).toEqual(["cover", ...WELCOME_STEPS, "returning"]);
    for (const gone of ["arrival", "textSize", "tour.home", "fork", "signIn.look", "allSet", "aboutYou", "yourSize", "activity"]) {
      expect((SETUP_SCREENS as readonly string[]).includes(gone), gone).toBe(false);
    }
  });

  it("carries no goal on onboardingCompleted, and a step's name (never a number) on onboardingSkipped and welcomeStep", () => {
    analytics.track({ name: "onboardingCompleted" });
    analytics.track({ name: "onboardingSkipped", step: "about" });
    analytics.track({ name: "welcomeStep", step: "eatOut" });
    // @ts-expect-error the goal is health data ("glp1"): never part of the event
    analytics.track({ name: "onboardingCompleted", goal: "glp1" });
    // @ts-expect-error a step is named, not numbered
    analytics.track({ name: "onboardingSkipped", step: 6 });
    // @ts-expect-error only a step's name, never an answer or a figure
    analytics.track({ name: "welcomeStep", step: "eatOut", kcal: 2000 });
  });

  it("sends nothing while TelemetryDeck is off, whatever is tracked", async () => {
    const fetch = vi.fn(async () => new Response("1"));
    const storage = new MemoryStorage();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", storage);
    for (const step of WELCOME_STEPS) {
      analytics.track({ name: "welcomeStep", step });
      analytics.track({ name: "onboardingSkipped", step });
    }
    analytics.track({ name: "onboardingCompleted" });
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.writes).toBe(0);
  });

  it("switched on, a welcome step is counted once as that step's name, and nothing else is sent", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_APP_ID", "MY-APP");
    const fetch = vi.fn(async () => new Response("1"));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.resetModules();
    const fresh = await import("../lib/mm/analytics");
    fresh.analytics.track({ name: "welcomeStep", step: "week" });
    fresh.analytics.track({ name: "welcomeStep", step: "week" });
    fresh.analytics.track({ name: "onboardingSkipped", step: "goal" });
    fresh.analytics.track({ name: "onboardingCompleted" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [signal] = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Array<Record<string, unknown>>;
    expect(signal!.payload).toEqual({ "Setup.screen": "week" });
  });
});
