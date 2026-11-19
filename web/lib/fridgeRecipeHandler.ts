import { z } from "zod";
import { ALLERGEN_KEYS } from "./mm/types";
import { PANTRY, kindExcluded } from "./mm/pantry";
import { FRIDGE_MESSAGES, FRIDGE_SYSTEM_PROMPT, MAX_HAVE, MIN_HAVE_ITEMS, fridgeRecipeFromAi, fridgeUserPrompt, haveItems, type FridgeRecipeRequest } from "./mm/fridgeRecipe";
import { PHOTO_MESSAGES, photoPantryPrompt } from "./mm/photoRecipe";
import type { Result } from "./handlers";

// Cook with what you have, the server half (app/api/v1/recipe/fridge/route.ts wires it up; lib/mm/fridgeRecipe.ts has the shared rules). Pure apart from the
// injected AI call and the Premium check, so it is tested without a key or a payment (tests/fridgeRecipe.test.ts). Like Make it at home: the body is checked
// strictly, the pantry is cut to what the person's diet allows, and Pip's answer must pass the same checks the app applies.

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const fridgeRequestSchema = z.object({
  shop: z.string().regex(/^[a-z0-9-]{2,40}$/),
  servings: z.number().int().min(1).max(6),
  target: z.object({ kcal: num(150, 2500), protein: num(1, 300).optional(), carbsMax: num(1, 500).optional(), fatMax: num(1, 300).optional() }).strict(),
  diet: z.object({
    vegetarianOnly: z.boolean().optional(), veganOnly: z.boolean().optional(), pescatarianOnly: z.boolean().optional(), halalOnly: z.boolean().optional(),
    noPork: z.boolean().optional(), noBeef: z.boolean().optional(), avoidAllergens: z.array(z.enum(ALLERGEN_KEYS)).max(14).optional(),
  }).strict(),
  have: z.string().max(MAX_HAVE),
  pantry: z.array(z.object({
    key: z.string().max(40), label: z.string().max(80), unit: z.enum(["g", "ml"]), product: z.string().max(160),
    kcal: num(0, 950), protein: num(0, 100), carbs: num(0, 100), fat: num(0, 100), drained: z.boolean().optional(),
  }).strict()).min(2).max(200),
}).strict();

type Answer = { status: "ok"; value: unknown } | { status: "refused" } | { status: "error" };
/** The AI call that writes the recipe: the system prompt, the text, the pantry keys it may use and the cached pantry list. */
export type AskFridgeRecipe = (system: string, user: string, allowedKeys: string[], pantry: string) => Promise<Answer>;

export interface FridgeCtx {
  ask: AskFridgeRecipe | null;
  /** Does this caller have Premium? (A checked paid token; see the route.) */
  premium: () => Promise<boolean>;
  allow: () => boolean;
  timeLeft?: () => number;
}

const say = (status: number, error: string, message: string): Result => ({ status, body: { error, message } });

export async function handleFridgeRecipe(body: unknown, ctx: FridgeCtx): Promise<Result> {
  if (!ctx.ask) return say(503, "not_enabled", FRIDGE_MESSAGES.notEnabled);
  const parsed = fridgeRequestSchema.safeParse(body);
  if (!parsed.success) return say(400, "invalid", PHOTO_MESSAGES.invalid);
  if (haveItems(parsed.data.have).length < MIN_HAVE_ITEMS) return say(422, "too_few", FRIDGE_MESSAGES.tooFew);
  if (!(await ctx.premium())) return say(402, "premium", FRIDGE_MESSAGES.premium);
  const req = parsed.data as FridgeRecipeRequest;
  // only pantry kinds we know, that this diet allows, once each (whatever the browser sent)
  const seen = new Set<string>();
  req.pantry = req.pantry.filter((p) => {
    const k = PANTRY.get(p.key);
    if (!k || seen.has(p.key) || kindExcluded(k, req.diet) !== null) return false;
    seen.add(p.key);
    return true;
  });
  if (req.pantry.length < 2) return say(422, "pantry", PHOTO_MESSAGES.pantry);
  if (!ctx.allow()) return say(429, "rate_limited", PHOTO_MESSAGES.rateLimited);
  const keys = req.pantry.map((p) => p.key);
  const pantry = photoPantryPrompt(req.pantry);
  let user = fridgeUserPrompt(req);
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ctx.ask(FRIDGE_SYSTEM_PROMPT, user, keys, pantry);
    if (answer.status !== "ok") return say(502, "no_recipe", FRIDGE_MESSAGES.noRecipe);
    if (fridgeRecipeFromAi(answer.value, req, "ai-check")) return { status: 200, body: { recipe: answer.value } };
    if (ctx.timeLeft && ctx.timeLeft() < 75_000) break; // not enough time left for another full answer
    user = `${fridgeUserPrompt(req)}\n\nYour last answer couldn't be used. Use only the pantry keys in the pantry list with amounts between 5 and 3000; write 4 to 11 steps, each "Short title: instruction." with at most 45 words after the title; say how to tell meat, fish or eggs are cooked; no nutrition figures, prices, health words or brand names.`;
  }
  return say(502, "no_recipe", FRIDGE_MESSAGES.noRecipe);
}
