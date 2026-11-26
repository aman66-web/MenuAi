import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOUR_SCHEME_NAMES, COLOUR_SCHEMES, DEFAULT_COLOUR_SCHEME, isColourScheme, SCHEME_ATTRIBUTES, schemeAttribute, schemeOf } from "../lib/mm/colourSchemes";
import { SYNCED_SETTING_KEYS } from "../lib/mm/syncStores";
import { TYPED_SETUP_KEYS, typedSetup } from "../lib/mm/signInGate";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../lib/mm/user-data";

// The colour schemes (founder 2026-11-26: pick one at the end of the welcome screens, and in Settings; "the default one's the one it's on now"). The colours
// themselves and their contrast are checked in tests/colourTokens.test.ts and tests/colours.test.ts; this file checks the choice and where it is kept.

describe("the schemes", () => {
  it("are six, Lime (today's look) first and the default, each with a name", () => {
    expect(COLOUR_SCHEMES).toEqual(["lime", "mint", "ocean", "lavender", "berry", "sunset"]);
    expect(DEFAULT_COLOUR_SCHEME).toBe("lime");
    for (const s of COLOUR_SCHEMES) expect(COLOUR_SCHEME_NAMES[s].length, s).toBeGreaterThan(0);
    expect(new Set(Object.values(COLOUR_SCHEME_NAMES)).size).toBe(COLOUR_SCHEMES.length);
  });

  it("reads a stored scheme defensively: anything else is Lime", () => {
    expect(schemeOf("ocean")).toBe("ocean");
    for (const bad of [undefined, null, "", "Ocean", "dark", "toString", "__proto__", 3, {}]) {
      expect(isColourScheme(bad), String(bad)).toBe(false);
      expect(schemeOf(bad), String(bad)).toBe("lime");
    }
  });

  it("puts every scheme but Lime on <html data-scheme> (Lime is the plain colours)", () => {
    expect(schemeAttribute("lime")).toBeNull();
    expect(schemeAttribute(undefined)).toBeNull();
    expect(schemeAttribute("nonsense")).toBeNull();
    expect(schemeAttribute("berry")).toBe("berry");
    expect(SCHEME_ATTRIBUTES).toEqual(["mint", "ocean", "lavender", "berry", "sunset"]);
  });
});

describe("where the choice is kept", () => {
  it("in the settings, Lime as none, and nothing that isn't a scheme", () => {
    expect(DEFAULT_SETTINGS.colourScheme).toBeUndefined();
    expect(sanitizeSettings({ colourScheme: "lavender" }).colourScheme).toBe("lavender");
    expect(sanitizeSettings({ colourScheme: "lime" })).not.toHaveProperty("colourScheme");
    expect(sanitizeSettings({ colourScheme: "neon" })).not.toHaveProperty("colourScheme");
    expect(sanitizeSettings({ colourScheme: ["ocean"] })).not.toHaveProperty("colourScheme");
  });

  it("on this device only: never one of the synced settings", () => {
    expect(SYNCED_SETTING_KEYS as readonly string[]).not.toContain("colourScheme");
  });

  it("a sign-in that empties the phone puts the colours picked during setup back, with the rest of what was typed", () => {
    expect(TYPED_SETUP_KEYS as readonly string[]).toContain("colourScheme");
    expect(typedSetup({ ...DEFAULT_SETTINGS, colourScheme: "sunset" }).colourScheme).toBe("sunset");
  });

  it("the first-paint script applies it before anything shows, and the app shell after every change", () => {
    const layout = readFileSync(new URL("../app/app/layout.tsx", import.meta.url), "utf8");
    expect(layout).toMatch(/z\.data\.colourScheme/);
    expect(layout).toMatch(/SCHEME_ATTRIBUTES/);
    const shell = readFileSync(new URL("../app/app/_components/AppShell.tsx", import.meta.url), "utf8");
    expect(shell).toMatch(/applyColourScheme\(colourScheme\)/);
  });

  it("is offered at the end of the welcome screens and in Settings", () => {
    const welcome = readFileSync(new URL("../app/app/welcome/page.tsx", import.meta.url), "utf8");
    expect(welcome).toMatch(/step === "colours"/);
    const settings = readFileSync(new URL("../app/app/settings/SettingsScreen.tsx", import.meta.url), "utf8");
    expect(settings).toMatch(/<SchemePicker /);
  });
});
