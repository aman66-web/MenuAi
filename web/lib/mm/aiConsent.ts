// Pip's AI features (Scan your food, Make it at home, Cook with what you have, and Meal plan with Pip since 21 November 2026): the person's permission before anything is sent to Anthropic, and what
// the screens say when Pip can't answer. Pure apart from the store, and unit-tested (tests/aiConsent.test.ts).
//
// Permission (App Review 5.1.2(i), the 20 November 2026 audit): the first time someone uses any of them, a sheet (app/app/_components/AiConsentSheet.tsx)
// says that Pip uses AI from Anthropic and what is sent, with "Allow" and "Not now"; nothing is sent until they allow it. Since 21 November evening one Allow
// covers all of Pip (founder, on the sheet before a meal plan: "You don't need to put this", then "Ask once for all Pip"): it names every feature and what each
// sends, so it is asked once, never again. Someone who allowed one feature before is asked once more, with the sheet for all. The answer is kept on this phone only (mm.v1.aiOk: never synced, never sent), so Settings › Clear data and
// a new phone ask again. The wording is for the founder's approval (CLAUDE.md rule 8).
//
// Failures (the same audit): when Anthropic can't be reached (the monthly spending cap, an outage, a timeout) the server answers 503 "busy" and the screens say
// so, instead of blaming the person's photo; the photo-quality words stay for answers that failed the checks.

import { tk } from "./i18n";
import { createStore, type KeyValueStorage, type Store } from "./persist";

export const AI_FEATURES = ["scan", "photoRecipe", "fridgeRecipe", "mealPlan"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_CONSENT_KEY = "mm.v1.aiOk";

/** The features the person has allowed, as stored; anything else (an old shape, a damaged value) reads as none allowed. */
export function sanitizeAiConsent(raw: unknown): AiFeature[] {
  if (!Array.isArray(raw)) return [];
  return AI_FEATURES.filter((f) => raw.includes(f));
}

/** The store (the app's { v, data } envelope). `storage` for tests; the app uses the browser's. */
export function createAiConsentStore(storage?: KeyValueStorage | null): Store<AiFeature[]> {
  return createStore<AiFeature[]>(AI_CONSENT_KEY, [], { sanitize: sanitizeAiConsent, ...(storage !== undefined ? { storage } : {}) });
}

/** This phone's answers. `.reset()` forgets them (Settings › Clear data). */
export const aiConsentStore = createAiConsentStore();

/** Pip may be used: every feature allowed (one Allow covers all; `feature` stays for the callers that name theirs). */
export const aiAllowed = (allowed: readonly AiFeature[], feature?: AiFeature): boolean => AI_FEATURES.every((f) => allowed.includes(f)) && (!feature || allowed.includes(feature));
/** Everything allowed: one Allow is for all of Pip (whichever feature asked). */
export const withAiAllowed = (allowed: readonly AiFeature[], feature?: AiFeature): AiFeature[] => sanitizeAiConsent([...allowed, ...(feature ? [feature] : []), ...AI_FEATURES]);

/** The sheet's words: every feature and what it sends, in one go (asked once for all of Pip). */
export const AI_CONSENT_TEXT = tk("Pip's meal plans, food scans and recipes use AI from Anthropic (the makers of Claude). Only what each needs is sent: your plan answers, a photo you take, or the foods you list, with your diet and meal sizes. Never your name, email or account. Anthropic may keep requests for a short time under its own terms.");

/** What each feature sends, in the order the screens ask for it ({shop}: the supermarket's name). */
export const AI_SENDS: Readonly<Record<AiFeature, string>> = {
  scan: tk("your photo (made smaller on your phone first) and the words you typed about it"),
  photoRecipe: tk("your photo (made smaller on your phone first), the words you typed about it, your diet and allergy choices, the meal size and the list of {shop} products it may use"),
  fridgeRecipe: tk("the foods you typed or tapped, what you fancy, your diet and allergy choices, the meal size and the list of {shop} products it may use"),
  // Meal plan with Pip (founder 2026-11-21): the answers, the note, the meal sizes and the recipes that fit; never the names of the people at home
  mealPlan: tk("your answers to Pip's meal plan questions (with anything you typed for Pip), your meal sizes, the age group and portion size of anyone else you cook for, and the {shop} recipes that fit you"),
};

/** What the screens say when Pip can't answer (English keys: shown with t()). */
export const AI_MESSAGES = {
  /** Anthropic couldn't be reached, or answered with an error (the monthly cap, an outage, a timeout), or the platform cut the request off. */
  busy: tk("Pip can't do this right now. Please try again in a little while."),
  /** The phone has no connection. */
  connection: tk("Couldn't reach Pip. Check your connection and try again."),
  /** Said at the top of each feature while the phone is offline. */
  offline: tk("You're offline. Pip needs a connection to work this out."),
  /** Ask Pip's recipe maker, for someone without Premium (the server's answer). */
  recipePremium: tk("Making a new recipe just for you is part of Premium."),
} as const;

/** How a request to one of the AI routes ended: the HTTP status (0: the request never got an answer), and the server's own words if it sent any. */
export interface AiReply {
  status: number;
  message?: string;
}

/**
 * The words for a request that didn't bring an answer. The server's own message when it sent one (it knows why); no answer at all is "check your connection"
 * when the phone says it is offline, otherwise "Pip can't do this right now" (a platform timeout page carries no CORS headers, so the iPhone app sees it as no
 * answer); a 5xx with no words of ours (the platform's own error page) is "Pip can't do this right now"; anything else is the feature's `fallback`.
 */
export function aiFailureMessage(reply: AiReply, fallback: string, online = true): string {
  if (reply.message) return reply.message;
  if (reply.status <= 0) return online ? AI_MESSAGES.busy : AI_MESSAGES.connection;
  if (reply.status >= 500) return AI_MESSAGES.busy;
  return fallback;
}

/** A failure worth sending the same photo again for (no answer, Pip busy, or the platform's own error page), as opposed to one about the photo itself. */
export const aiRetrySame = (reply: AiReply & { error?: string }): boolean => reply.status <= 0 || reply.error === "busy" || (reply.status >= 500 && !reply.error);
