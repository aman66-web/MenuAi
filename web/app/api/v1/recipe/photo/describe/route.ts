import { PHOTO_RECIPES_API_ENABLED } from "@/lib/mm/config";
import { preflight, withCors } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleDescribePhoto } from "@/lib/photoRecipeHandler";
import { fromUs, notFound, PHOTO_CORS, photoCtx } from "@/lib/photoRecipeRoute";

// Make it at home's "Suggest from my photo": Pip says what the dish in the photo is, for the person to check and add to (lib/photoRecipeHandler.ts). Premium only.

export const maxDuration = 30;

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!PHOTO_RECIPES_API_ENABLED) return notFound(request);
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  const res = await withJsonBody(request, (body) => handleDescribePhoto(body, photoCtx(request, "describe", maxDuration * 1000)), 1_500 * 1024);
  return withCors(request, res, PHOTO_CORS);
}
