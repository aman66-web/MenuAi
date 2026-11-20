import { preflight, withCors } from "@/lib/cors";
import { AI_RECIPES_ENABLED } from "@/lib/mm/config";
import { AI_MESSAGES } from "@/lib/mm/aiConsent";
import { withJsonBody } from "@/lib/http";
import { fromUs, limitedCaller, PHOTO_CORS } from "@/lib/photoRecipeRoute";
import { anthropicAsk } from "@/lib/recipeAi";
import { handleRecipe, makeLimiter } from "@/lib/recipeHandler";

// Pip's recipe maker (switched off: AI_RECIPES_ENABLED). GET says whether it is switched on (ANTHROPIC_API_KEY set); POST asks Pip for a recipe. Like the other
// AI routes (lib/photoRecipeRoute.ts): only our own pages and the iPhone app may ask (with the app's CORS headers), Premium only, and the limit counts per paid
// token when a valid one is sent. Nothing is stored: the request goes to Anthropic and the answer straight back (docs/BACKEND.md, the privacy page).

export const maxDuration = 60;

const limiter = makeLimiter();

const off = (request: Request) => withCors(request, Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export function GET(request: Request) {
  if (!AI_RECIPES_ENABLED) return off(request); // switched off for the free launch (lib/mm/config.ts), whatever keys are set
  return withCors(request, Response.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }, { headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!AI_RECIPES_ENABLED) return off(request);
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  const who = limitedCaller(request);
  if (!(await who.premium())) {
    return withCors(request, Response.json({ error: "premium", message: AI_MESSAGES.recipePremium }, { status: 402, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  }
  const started = Date.now();
  const res = await withJsonBody(request, (body) =>
    handleRecipe(body, { ask: anthropicAsk(process.env.ANTHROPIC_API_KEY), allow: () => limiter(who.who()), timeLeft: () => maxDuration * 1000 - (Date.now() - started) }),
    48 * 1024, // the pantry list (about 70 products) is bigger than other requests
  );
  return withCors(request, res, PHOTO_CORS);
}
