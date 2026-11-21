import "server-only";
import type { PlanAiAnswer } from "./mm/planAi";
import { anthropicPlan } from "./planAiAi";
import type { PlanAiCtx } from "./planAiHandler";
import { limitedCaller } from "./photoRecipeRoute";
import { makeLimiter } from "./recipeHandler";

// What Meal plan with Pip's route needs from the server: the AI call (only with ANTHROPIC_API_KEY), the Premium check and limit the other Premium AI features
// use (lib/photoRecipeRoute.ts: counted per paid token, else per hashed address), and the weeks already made, kept in this server's memory for a day under a
// one-way hash of the request. Only a new request counts: 4 plans in ten minutes and 12 a day.

const limit = makeLimiter(4, 12);
const cache = new Map<string, { plan: PlanAiAnswer; at: number }>();

export function planAiCtx(request: Request, deadlineMs: number): PlanAiCtx {
  const id = limitedCaller(request);
  const started = Date.now();
  return {
    ask: anthropicPlan(process.env.ANTHROPIC_API_KEY),
    premium: id.premium,
    allow: () => limit(id.who()),
    giveBack: () => limit.release(id.who()),
    cache,
    timeLeft: () => deadlineMs - (Date.now() - started),
  };
}
