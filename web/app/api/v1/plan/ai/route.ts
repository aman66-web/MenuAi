import { preflight, withCors } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { PLAN_AI_API_ENABLED } from "@/lib/mm/planAi";
import { handlePlanAi } from "@/lib/planAiHandler";
import { planAiCtx } from "@/lib/planAiRoute";
import { fromUs, notFound, PHOTO_CORS } from "@/lib/photoRecipeRoute";

// Meal plan with Pip (lib/planAiHandler.ts): the person's answers to Pip's questions, their meal sizes, who's eating (no names) and each meal's recipes in;
// the week as recipe ids and a sentence or two of why out. Premium only (the paid token in the Authorization header). Off with NEXT_PUBLIC_PLAN_AI=0.

// Opus at medium effort takes 20 to 60 s a week, with room for one more go when an answer can't be read
export const maxDuration = 120;

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!PLAN_AI_API_ENABLED) return notFound(request);
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  const res = await withJsonBody(request, (body) => handlePlanAi(body, planAiCtx(request, maxDuration * 1000)), 160 * 1024);
  return withCors(request, res, PHOTO_CORS);
}
