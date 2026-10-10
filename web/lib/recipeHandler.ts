import { z } from "zod";
import { ALLERGEN_KEYS } from "./mm/types";
import { MAX_WISH, MEALS, RECIPE_SYSTEM_PROMPT, recipeFromAi, recipeUserPrompt, type AiRecipe, type RecipeRequest } from "./mm/aiRecipe";
import { PANTRY, kindExcluded } from "./mm/pantry";
import type { Result } from "./handlers";

// Pip's recipe maker, the server half (app/api/v1/recipe/route.ts wires it up; lib/mm/aiRecipe.ts has the shared rules). Pure apart from
// the injected AI call, so it is tested without a key (tests/recipe-handler.test.ts). The body is checked strictly, the pantry is cut to
// what the person's diet allows (again, whatever the browser sent), and Pip's answer must pass the same checks the app applies.

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const recipeRequestSchema = z.object({
  shop: z.string().regex(/^[a-z0-9-]{2,40}$/),
  meal: z.enum(MEALS as [string, ...string[]]),
  servings: z.number().int().min(1).max(6),
  target: z.object({ kcal: num(150, 2500), protein: num(1, 300).optional(), carbsMax: num(1, 500).optional(), fatMax: num(1, 300).optional() }).strict(),
  diet: z.object({
    vegetarianOnly: z.boolean().optional(), veganOnly: z.boolean().optional(), halalOnly: z.boolean().optional(),
    noPork: z.boolean().optional(), noBeef: z.boolean().optional(), avoidAllergens: z.array(z.enum(ALLERGEN_KEYS)).max(14).optional(),
  }).strict(),
  wish: z.string().max(MAX_WISH),
  pantry: z.array(z.object({
    key: z.string().max(40), label: z.string().max(80), unit: z.enum(["g", "ml"]), product: z.string().max(160),
    kcal: num(0, 950), protein: num(0, 100), carbs: num(0, 100), fat: num(0, 100), drained: z.boolean().optional(),
  }).strict()).min(2).max(60),
}).strict();

/** The AI call: returns Pip's parsed answer, or why there isn't one. */
export type AskPip = (system: string, user: string, allowedKeys: string[]) => Promise<
  { status: "ok"; recipe: unknown } | { status: "refused" } | { status: "error" }
>;

export interface RecipeCtx {
  ask: AskPip | null;
  /** Whether this caller may ask now (rate limit). */
  allow: () => boolean;
  /** Milliseconds left before the platform stops the request: a second try happens only with enough time for it. */
  timeLeft?: () => number;
}

const notEnabled: Result = { status: 503, body: { error: "not_enabled", message: "Pip's recipe maker isn't switched on yet." } };
const tooMany: Result = { status: 429, body: { error: "rate_limited", message: "That's a lot of recipes. Please try again in a little while." } };
const couldNot: Result = { status: 502, body: { error: "no_recipe", message: "Pip couldn't make a recipe this time. Please try again, maybe with different words." } };

export async function handleRecipe(body: unknown, ctx: RecipeCtx): Promise<Result> {
  if (!ctx.ask) return notEnabled;
  const parsed = recipeRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid", message: "Something in the request wasn't right." } };
  const req = parsed.data as RecipeRequest;
  // only pantry kinds we know, that this diet allows, once each
  const seen = new Set<string>();
  req.pantry = req.pantry.filter((p) => {
    const k = PANTRY.get(p.key);
    if (!k || seen.has(p.key) || kindExcluded(k, req.diet) !== null) return false;
    seen.add(p.key);
    return true;
  });
  if (req.pantry.length < 2) return { status: 422, body: { error: "pantry", message: "There aren't enough ingredients at this shop for your diet yet." } };
  if (!ctx.allow()) return tooMany;
  const keys = req.pantry.map((p) => p.key);
  let user = recipeUserPrompt(req);
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ctx.ask(RECIPE_SYSTEM_PROMPT, user, keys);
    if (answer.status === "refused") return couldNot;
    if (answer.status === "error") return couldNot;
    const recipe = recipeFromAi(answer.recipe, req, "ai-check");
    if (recipe) return { status: 200, body: { recipe: answer.recipe as AiRecipe } };
    if (ctx.timeLeft && ctx.timeLeft() < 30_000) break;
    // one more go, with a reminder of the rules it broke
    user = `${recipeUserPrompt(req)}\n\nYour last answer couldn't be used: use only the pantry keys above, amounts between 5 and 3000, 2 to 8 short steps, and no nutrition figures, prices or health claims in any text.`;
  }
  return couldNot;
}

/** A small in-memory limit per caller (per server instance): a few recipes every 10 minutes and a ceiling per day. */
export function makeLimiter(perTenMinutes = 5, perDay = 25, now: () => number = () => Date.now()) {
  const seen = new Map<string, number[]>();
  return (who: string): boolean => {
    const t = now();
    const list = (seen.get(who) ?? []).filter((x) => t - x < 24 * 3600_000);
    if (list.filter((x) => t - x < 600_000).length >= perTenMinutes || list.length >= perDay) {
      seen.set(who, list);
      return false;
    }
    list.push(t);
    seen.set(who, list);
    if (seen.size > 5000) seen.delete(seen.keys().next().value as string);
    return true;
  };
}
