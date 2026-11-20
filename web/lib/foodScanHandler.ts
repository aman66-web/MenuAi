import { z } from "zod";
import type { Result } from "./handlers";
import { AI_MESSAGES } from "./mm/aiConsent";
import {
  ESTIMATE_SYSTEM_PROMPT, FIRST_LOOK_SYSTEM_PROMPT, SCAN_MESSAGES, cleanDescription, describedPrompt, firstLookFromAi, firstLookPrompt, refsForPlate, refsPrompt, scanFromAi,
  type RefIndexEntry,
} from "./mm/foodScan";
import { MAX_PHOTO_BASE64 } from "./mm/photoRecipe";
import { callLimit, isJpeg } from "./photoRecipeHandler";

// Scan food, the server half (app/api/v1/scan/route.ts wires it up; lib/mm/foodScan.ts has the shared rules). Pure apart from the injected AI calls, the
// reference dishes and the Premium check, so it is tested without a key or a payment (tests/foodScan.test.ts). The photo must be a JPEG of a sensible size;
// the first look must find food; the estimate must pass scanFromAi (numbers in range, calories that fit the macros), with one more go if it doesn't.
// When Anthropic can't be reached (the AI call says "unavailable": the spending cap, an outage, a timeout) the answer is 503 "busy", never the photo-quality words.

const image = z.string().min(200).max(MAX_PHOTO_BASE64).regex(/^[A-Za-z0-9+/]+={0,2}$/);
// what the person typed the food is (optional, so an app from before 18 November still works); cut to MAX_DESCRIPTION after it is cleaned
export const scanRequestSchema = z.object({ image, description: z.string().max(400).optional() }).strict();

type Answer = { status: "ok"; value: unknown } | { status: "refused" } | { status: "error" } | { status: "unavailable" };
/** The quick first look: what is on the plate, how much, and searches for dishes like each food (`note`: what the person typed it is, as a prompt line).
 *  `limitMs`: the most this call may take (the route's time left, less a margin); unlimited when absent. */
export type FirstLookAi = (system: string, image: string, note?: string, limitMs?: number) => Promise<Answer>;
/** The estimate: the photo, then the first look and the reference dishes as text. */
export type EstimateAi = (system: string, image: string, user: string, limitMs?: number) => Promise<Answer>;

export interface ScanCtx {
  look: FirstLookAi | null;
  estimate: EstimateAi | null;
  /** The reference dishes (cached by the caller); an empty list if they can't be had, and the estimate goes on without them. */
  refs: () => Promise<readonly RefIndexEntry[]>;
  premium: () => Promise<boolean>;
  allow: () => boolean;
  timeLeft?: () => number;
}

const say = (status: number, error: string, message: string): Result => ({ status, body: { error, message } });
const busy = (): Result => say(503, "busy", AI_MESSAGES.busy);
/** A second go at the estimate starts only with this much time left (a full answer and a margin); every call is also held to the time left (callLimit). */
export const SECOND_GO_MS = 65_000;

export async function handleFoodScan(body: unknown, ctx: ScanCtx): Promise<Result> {
  if (!ctx.look || !ctx.estimate) return say(503, "not_enabled", SCAN_MESSAGES.notEnabled);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success || !isJpeg(parsed.data.image)) return say(400, "invalid", SCAN_MESSAGES.invalid);
  if (!(await ctx.premium())) return say(402, "premium", SCAN_MESSAGES.premium);
  if (!ctx.allow()) return say(429, "rate_limited", SCAN_MESSAGES.rateLimited);
  const photo = parsed.data.image;
  const note = describedPrompt(cleanDescription(parsed.data.description));

  const first = await ctx.look(FIRST_LOOK_SYSTEM_PROMPT, photo, note || undefined, callLimit(ctx.timeLeft));
  if (first.status === "unavailable") return busy();
  const look = first.status === "ok" ? firstLookFromAi(first.value) : null;
  if (!look) return say(502, "no_estimate", SCAN_MESSAGES.noEstimate);
  if (!look.isFood) return say(422, "not_food", SCAN_MESSAGES.notFood);

  let index: readonly RefIndexEntry[] = [];
  try {
    index = await ctx.refs();
  } catch {
    index = [];
  }
  const base = `${note ? `${note}\n\n` : ""}${firstLookPrompt(look)}\n\n${refsPrompt(refsForPlate(index, look.items))}\n\nEstimate this plate.`;
  let user = base;
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ctx.estimate(ESTIMATE_SYSTEM_PROMPT, photo, user, callLimit(ctx.timeLeft));
    if (answer.status === "unavailable") return busy();
    if (answer.status !== "ok") return say(502, "no_estimate", SCAN_MESSAGES.noEstimate);
    const scan = scanFromAi(answer.value);
    if (scan) return { status: 200, body: { scan } };
    if (ctx.timeLeft && ctx.timeLeft() < SECOND_GO_MS) break; // not enough time for another full answer
    user = `${base}\n\nYour last answer couldn't be used. List 1 to 12 foods, each with kcal, protein, carbs and fat as plain numbers (kcal 0 to 3000), where kcal is close to 4 x protein + 4 x carbs + 9 x fat, a confidence of low, medium or high, and no restaurant or brand names.`;
  }
  return say(502, "no_estimate", SCAN_MESSAGES.noEstimate);
}
