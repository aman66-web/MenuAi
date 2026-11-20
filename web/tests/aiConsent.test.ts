import { describe, expect, it, vi } from "vitest";
import {
  AI_CONSENT_KEY, AI_FEATURES, AI_MESSAGES, AI_SENDS, aiAllowed, aiFailureMessage, aiRetrySame, createAiConsentStore, sanitizeAiConsent, withAiAllowed,
} from "../lib/mm/aiConsent";
import type { KeyValueStorage } from "../lib/mm/persist";
import { handleFoodScan, SECOND_GO_MS, type ScanCtx } from "../lib/foodScanHandler";
import { handleFridgeRecipe, type FridgeCtx } from "../lib/fridgeRecipeHandler";
import { callLimit, handleDescribePhoto, handlePhotoRecipe, type PhotoCtx } from "../lib/photoRecipeHandler";

vi.mock("server-only", () => ({}));

// Pip's AI features (the 20 November 2026 audit): the person's permission before anything is sent to Anthropic (lib/mm/aiConsent.ts), and the words when
// Pip can't answer: a busy Anthropic (the spending cap, an outage, a timeout) is "Pip can't do this right now", never "try a clearer photo".

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe("the permission (mm.v1.aiOk)", () => {
  it("is asked for each feature, kept on this phone, and forgotten by reset (Settings › Clear data)", () => {
    const storage = new MemoryStorage();
    const store = createAiConsentStore(storage);
    expect(store.get()).toEqual([]);
    store.update((l) => withAiAllowed(l, "scan"));
    store.update((l) => withAiAllowed(l, "scan"));
    const back = createAiConsentStore(storage).get();
    expect(back).toEqual(["scan"]);
    expect(aiAllowed(back, "scan")).toBe(true);
    // allowing Scan your food doesn't allow the features that send more (diet, allergies, the shop's list)
    expect(aiAllowed(back, "photoRecipe")).toBe(false);
    expect(aiAllowed(back, "fridgeRecipe")).toBe(false);
    expect(AI_CONSENT_KEY).toBe("mm.v1.aiOk");
    store.reset();
    expect(storage.data.has(AI_CONSENT_KEY)).toBe(false);
  });

  it("reads anything damaged as nothing allowed", () => {
    for (const bad of [null, "scan", 3, {}, [1, 2], ["everything"]]) expect(sanitizeAiConsent(bad), JSON.stringify(bad)).toEqual([]);
    expect(sanitizeAiConsent(["fridgeRecipe", "nope", "scan", "scan"])).toEqual(["scan", "fridgeRecipe"]);
  });

  it("names what each feature sends, and the sheet says who gets it and that nothing about the person goes with it", () => {
    for (const f of AI_FEATURES) expect(AI_SENDS[f].length, f).toBeGreaterThan(10);
    expect(AI_SENDS.scan).toMatch(/photo/);
    expect(AI_SENDS.scan).toMatch(/words you typed/);
    for (const f of ["photoRecipe", "fridgeRecipe"] as const) {
      expect(AI_SENDS[f], f).toMatch(/diet and allergy choices/);
      expect(AI_SENDS[f], f).toMatch(/meal size/);
      expect(AI_SENDS[f], f).toContain("{shop}");
    }
  });
});

describe("what the screens say when Pip can't answer", () => {
  const fallback = "Pip couldn't work out this food. Please try again with a clearer photo.";
  it("uses the server's own words when it sent some", () => {
    expect(aiFailureMessage({ status: 503, message: AI_MESSAGES.busy }, fallback)).toBe(AI_MESSAGES.busy);
    expect(aiFailureMessage({ status: 502, message: fallback }, "other")).toBe(fallback);
  });
  it("says Pip is busy for no answer while online (a platform timeout page has no CORS headers in the iPhone app) or a 5xx with no words of ours", () => {
    expect(aiFailureMessage({ status: 0 }, fallback, true)).toBe(AI_MESSAGES.busy);
    expect(aiFailureMessage({ status: 504 }, fallback)).toBe(AI_MESSAGES.busy);
    expect(aiFailureMessage({ status: 500 }, fallback)).toBe(AI_MESSAGES.busy);
  });
  it("says to check the connection only when the phone is offline", () => {
    expect(aiFailureMessage({ status: 0 }, fallback, false)).toBe(AI_MESSAGES.connection);
  });
  it("falls back to the feature's own words otherwise, and never blames the photo for a busy Pip", () => {
    expect(aiFailureMessage({ status: 422 }, fallback)).toBe(fallback);
    expect(aiFailureMessage({ status: 504 }, fallback)).not.toMatch(/photo/);
  });
  it("sends the same photo again only after a failure of the connection or of Pip, never after one about the photo", () => {
    expect(aiRetrySame({ status: 0 })).toBe(true);
    expect(aiRetrySame({ status: 503, error: "busy" })).toBe(true);
    expect(aiRetrySame({ status: 504 })).toBe(true);
    expect(aiRetrySame({ status: 502, error: "no_estimate" })).toBe(false);
    expect(aiRetrySame({ status: 422, error: "not_food" })).toBe(false);
  });
});

describe("the servers answer 503 busy when Anthropic can't be reached", () => {
  const jpeg = `/9j/${"A".repeat(400)}`;
  const busy = { status: 503, body: { error: "busy", message: AI_MESSAGES.busy } };
  const unavailable = async () => ({ status: "unavailable" as const });
  const look = { status: "ok" as const, value: { isFood: true, dish: "Toast", items: [{ name: "Toast", portion: "two slices", search: ["toast"] }] } };
  const scanCtx = (over: Partial<ScanCtx> = {}): ScanCtx => ({ look: async () => look, estimate: unavailable, refs: async () => [], premium: async () => true, allow: () => true, ...over });

  it("Scan your food: at the first look or at the estimate", async () => {
    expect(await handleFoodScan({ image: jpeg }, scanCtx({ look: unavailable }))).toEqual(busy);
    expect(await handleFoodScan({ image: jpeg }, scanCtx())).toEqual(busy);
    // an answer that can't be used is still the photo's words
    expect((await handleFoodScan({ image: jpeg }, scanCtx({ estimate: async () => ({ status: "error" as const }) }))).body.error).toBe("no_estimate");
  });

  it("Make it at home and its food check, and Cook with what you have", async () => {
    const line = (key: string, label: string) => ({ key, label, unit: "g" as const, product: `${label} 500g`, kcal: 100, protein: 10, carbs: 10, fat: 5 });
    const pantry = [line("chicken", "Chicken breast"), line("rice", "Basmati rice"), line("salt", "Salt")];
    const photoCtx: PhotoCtx = { ask: unavailable, describe: unavailable, premium: async () => true, allow: () => true };
    const photoBody = { shop: "sainsburys", servings: 2, target: { kcal: 600 }, diet: {}, description: "chicken and rice", image: jpeg, pantry };
    expect(await handlePhotoRecipe(photoBody, photoCtx)).toEqual(busy);
    expect(await handleDescribePhoto({ image: jpeg }, photoCtx)).toEqual(busy);
    const fridgeCtx: FridgeCtx = { ask: unavailable, premium: async () => true, allow: () => true };
    expect(await handleFridgeRecipe({ shop: "sainsburys", servings: 2, target: { kcal: 600 }, diet: {}, have: "chicken, rice", pantry }, fridgeCtx)).toEqual(busy);
  });

  it("holds every AI call to the route's time left, less a margin, and starts a second go only with time for it", async () => {
    expect(callLimit(undefined)).toBeUndefined();
    expect(callLimit(() => 120_000)).toBe(115_000);
    expect(callLimit(() => 2_000)).toBe(1_000);
    const limits: Array<number | undefined> = [];
    let left = 110_000;
    let estimates = 0;
    const res = await handleFoodScan({ image: jpeg }, scanCtx({
      look: async (_s, _i, _n, limitMs) => { limits.push(limitMs); left -= 10_000; return look; },
      // an answer that breaks the rules, taking 40 s: with 60 s left there is no second go (SECOND_GO_MS)
      estimate: async (_s, _i, _u, limitMs) => { limits.push(limitMs); estimates++; left -= 40_000; return { status: "ok" as const, value: { nope: true } }; },
      timeLeft: () => left,
    }));
    expect(limits).toEqual([105_000, 95_000]);
    expect(estimates).toBe(1);
    expect(SECOND_GO_MS).toBeGreaterThan(60_000 - 1);
    expect(res.status).toBe(502);
  });
});

describe("the AI routes' Premium check (lib/photoRecipeRoute.ts)", () => {
  it("never counts everyone as Premium on the live site, whatever the switches say", async () => {
    const { freePreview } = await import("../lib/photoRecipeRoute");
    expect(freePreview("preview", true, false)).toBe(true);
    expect(freePreview("development", true, false)).toBe(true);
    expect(freePreview("production", true, false)).toBe(false);
    expect(freePreview("preview", true, true)).toBe(false);
    expect(freePreview("preview", false, false)).toBe(false);
  });
});
