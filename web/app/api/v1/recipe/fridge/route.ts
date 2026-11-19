import { PHOTO_RECIPES_API_ENABLED } from "@/lib/mm/config";
import { preflight, withCors } from "@/lib/cors";
import { handleFridgeRecipe } from "@/lib/fridgeRecipeHandler";
import { withJsonBody } from "@/lib/http";
import { fridgeCtx, fromUs, notFound, PHOTO_CORS } from "@/lib/photoRecipeRoute";

// Cook with what you have: what the person typed they have at home in, a recipe from their supermarket's products out (lib/fridgeRecipeHandler.ts). Premium
// only, switched on with Make it at home (PHOTO_RECIPES_API_ENABLED). Nothing is stored: the words go to Anthropic and the recipe comes straight back.

export const maxDuration = 150;

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!PHOTO_RECIPES_API_ENABLED) return notFound(request);
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  const res = await withJsonBody(request, (body) => handleFridgeRecipe(body, fridgeCtx(request, maxDuration * 1000)), 64 * 1024);
  return withCors(request, res, PHOTO_CORS);
}
