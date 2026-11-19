import { z } from "zod";
import { ALLERGEN_KEYS } from "./mm/types";
import { PANTRY, kindExcluded } from "./mm/pantry";
import {
  DESCRIBE_SYSTEM_PROMPT, MAX_DESCRIPTION, MAX_PHOTO_BASE64, PHOTO_MESSAGES, PHOTO_SYSTEM_PROMPT,
  cleanSuggestion, photoPantryPrompt, photoRecipeFromAi, photoUserPrompt, wordCount, type PhotoRecipeRequest,
} from "./mm/photoRecipe";
import type { Result } from "./handlers";

// Make it at home, the server half (app/api/v1/recipe/photo/route.ts and .../describe/route.ts wire it up; lib/mm/photoRecipe.ts has the shared rules). Pure apart
// from the injected AI calls and the Premium check, so it is tested without a key or a payment (tests/photoRecipe.test.ts). The body is checked strictly, the photo
// must be a JPEG of a sensible size, the pantry is cut to what the person's diet allows, and Pip's answer must pass the same checks the app applies.

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const image = z.string().min(200).max(MAX_PHOTO_BASE64).regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const photoRequestSchema = z.object({
  shop: z.string().regex(/^[a-z0-9-]{2,40}$/),
  servings: z.number().int().min(1).max(6),
  target: z.object({ kcal: num(150, 2500), protein: num(1, 300).optional(), carbsMax: num(1, 500).optional(), fatMax: num(1, 300).optional() }).strict(),
  diet: z.object({
    vegetarianOnly: z.boolean().optional(), veganOnly: z.boolean().optional(), pescatarianOnly: z.boolean().optional(), halalOnly: z.boolean().optional(),
    noPork: z.boolean().optional(), noBeef: z.boolean().optional(), avoidAllergens: z.array(z.enum(ALLERGEN_KEYS)).max(14).optional(),
  }).strict(),
  // the screen asks for at least MIN_DESCRIPTION_WORDS words but lets the person carry on after the nudge
  description: z.string().max(MAX_DESCRIPTION).refine((d) => wordCount(d) >= 1),
  image,
  pantry: z.array(z.object({
    key: z.string().max(40), label: z.string().max(80), unit: z.enum(["g", "ml"]), product: z.string().max(160),
    kcal: num(0, 950), protein: num(0, 100), carbs: num(0, 100), fat: num(0, 100), drained: z.boolean().optional(),
  }).strict()).min(2).max(200),
}).strict();

export const describeRequestSchema = z.object({ image }).strict();

/** The start of a JPEG file (every photo is made into a JPEG on the phone before it is sent). */
export function isJpeg(base64: string): boolean {
  try {
    const head = atob(base64.slice(0, 8));
    return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
  } catch {
    return false;
  }
}

type Answer = { status: "ok"; value: unknown } | { status: "refused" } | { status: "error" };
/** The AI call that writes the recipe: the system prompt, the text, the photo (base64 JPEG) and the pantry keys it may use. */
/** `pantry` is the shop's ingredient list (photoPantryPrompt): sent after the system prompt and cached; `user` is what this person asked for. */
export type AskPhotoRecipe = (system: string, user: string, image: string, allowedKeys: string[], pantry: string) => Promise<Answer>;
/** The AI call that suggests what the dish is. */
export type DescribePhoto = (system: string, image: string) => Promise<Answer>;

export interface PhotoCtx {
  ask: AskPhotoRecipe | null;
  describe: DescribePhoto | null;
  /** Does this caller have Premium? (A checked paid token; see the route.) */
  premium: () => Promise<boolean>;
  /** May this caller ask now (rate limit)? */
  allow: () => boolean;
  /** Milliseconds left before the platform stops the request: a second try happens only with enough time for it. */
  timeLeft?: () => number;
}

const say = (status: number, error: string, message: string): Result => ({ status, body: { error, message } });
const notEnabled = say(503, "not_enabled", PHOTO_MESSAGES.notEnabled);
const notPremium = say(402, "premium", PHOTO_MESSAGES.premium);
const tooMany = say(429, "rate_limited", PHOTO_MESSAGES.rateLimited);
const invalid = say(400, "invalid", PHOTO_MESSAGES.invalid);

export async function handlePhotoRecipe(body: unknown, ctx: PhotoCtx): Promise<Result> {
  if (!ctx.ask) return notEnabled;
  const parsed = photoRequestSchema.safeParse(body);
  if (!parsed.success || !isJpeg(parsed.data.image)) return invalid;
  if (!(await ctx.premium())) return notPremium;
  const req = parsed.data as PhotoRecipeRequest;
  // only pantry kinds we know, that this diet allows, once each (whatever the browser sent)
  const seen = new Set<string>();
  req.pantry = req.pantry.filter((p) => {
    const k = PANTRY.get(p.key);
    if (!k || seen.has(p.key) || kindExcluded(k, req.diet) !== null) return false;
    seen.add(p.key);
    return true;
  });
  if (req.pantry.length < 2) return say(422, "pantry", PHOTO_MESSAGES.pantry);
  if (!ctx.allow()) return tooMany;
  const keys = req.pantry.map((p) => p.key);
  let user = photoUserPrompt(req);
  const pantry = photoPantryPrompt(req.pantry);
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ctx.ask(PHOTO_SYSTEM_PROMPT, user, req.image, keys, pantry);
    if (answer.status !== "ok") return say(502, "no_recipe", PHOTO_MESSAGES.noRecipe);
    if (photoRecipeFromAi(answer.value, req, "ai-check")) return { status: 200, body: { recipe: answer.value } };
    if (ctx.timeLeft && ctx.timeLeft() < 75_000) break; // not enough time left for another full answer
    // one more go, with a reminder of the rules it broke
    user = `${photoUserPrompt(req)}\n\nYour last answer couldn't be used. Use only the pantry keys in the pantry list with amounts between 5 and 3000; write 4 to 11 steps, each "Short title: instruction." with at most 45 words after the title; say how to tell meat, fish and eggs are cooked; no nutrition figures, prices, health claims, or restaurant or brand names.`;
  }
  return say(502, "no_recipe", PHOTO_MESSAGES.noRecipe);
}

export async function handleDescribePhoto(body: unknown, ctx: PhotoCtx): Promise<Result> {
  if (!ctx.describe) return notEnabled;
  const parsed = describeRequestSchema.safeParse(body);
  if (!parsed.success || !isJpeg(parsed.data.image)) return invalid;
  if (!(await ctx.premium())) return notPremium;
  if (!ctx.allow()) return tooMany;
  const answer = await ctx.describe(DESCRIBE_SYSTEM_PROMPT, parsed.data.image);
  const clean = answer.status === "ok" ? cleanSuggestion(answer.value) : null;
  if (!clean) return say(502, "no_suggestion", PHOTO_MESSAGES.noSuggestion);
  if (!clean.isFood) return say(422, "not_food", PHOTO_MESSAGES.notFood);
  return { status: 200, body: { description: clean.description, ...(clean.food ? { food: clean.food } : {}) } };
}
