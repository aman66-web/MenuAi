import { PHOTO_RECIPES_API_ENABLED } from "@/lib/mm/config";
import { preflight, withCors } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handlePhotoRecipe } from "@/lib/photoRecipeHandler";
import { fromUs, notFound, PHOTO_CORS, photoCtx } from "@/lib/photoRecipeRoute";

// Make it at home: a photo of a dish and the person's description in, a home recipe from their supermarket's products out (lib/photoRecipeHandler.ts).
// Premium only and off unless PHOTO_RECIPES_API_ENABLED (lib/mm/config.ts). Nothing is stored: the photo and words go to Anthropic and the recipe comes straight back.

export const maxDuration = 60;

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!PHOTO_RECIPES_API_ENABLED) return notFound(request);
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  const res = await withJsonBody(request, (body) => handlePhotoRecipe(body, photoCtx(request, "recipe", maxDuration * 1000)), 1_700 * 1024);
  return withCors(request, res, PHOTO_CORS);
}
