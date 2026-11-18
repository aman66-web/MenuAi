import { createHash } from "node:crypto";
import { preflight, withCors } from "@/lib/cors";
import { anthropicEstimate, anthropicFirstLook } from "@/lib/foodScanAi";
import { handleFoodScan, type ScanCtx } from "@/lib/foodScanHandler";
import { scanRefs } from "@/lib/foodScanRefs";
import { withJsonBody } from "@/lib/http";
import { FOOD_SCAN_API_ENABLED } from "@/lib/mm/config";
import { fromUs, hasPremium, notFound, PHOTO_CORS } from "@/lib/photoRecipeRoute";
import { makeLimiter } from "@/lib/recipeHandler";

// Scan food: a photo of a plate in, an estimate of its calories, protein, carbs and fat out (lib/foodScanHandler.ts). Premium only and off unless
// FOOD_SCAN_API_ENABLED (lib/mm/config.ts, the same switch as Make it at home). Nothing is stored: the photo goes to Anthropic and the estimate comes straight back.

// two AI calls, the second at high effort, with room for one more go when an answer breaks the rules
export const maxDuration = 120;

const limit = makeLimiter(8, 40);

function caller(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex");
}

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!FOOD_SCAN_API_ENABLED) return notFound(request);
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);
  const key = process.env.ANTHROPIC_API_KEY;
  const who = caller(request);
  const started = Date.now();
  const ctx: ScanCtx = {
    look: anthropicFirstLook(key),
    estimate: anthropicEstimate(key),
    refs: () => scanRefs(new URL(request.url).origin),
    premium: () => hasPremium(request),
    allow: () => limit(who),
    timeLeft: () => maxDuration * 1000 - (Date.now() - started),
  };
  const res = await withJsonBody(request, (body) => handleFoodScan(body, ctx), 1_700 * 1024);
  return withCors(request, res, PHOTO_CORS);
}
