import { fromUs, preflight, withCors } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleGoogleEntitlement } from "@/lib/payments/googleHandler";
import { GOOGLE_CORS, GOOGLE_MAX_BODY_BYTES, googleContext } from "@/lib/payments/googleRoute";

// POST { purchases: [{ productId, token }] } -> { token, plan, expiresAt }: the Android app's Google Play purchases (and "Restore purchases") turned into our access token. Each
// purchase token is checked with Google itself here (lib/payments/google.ts, the Play Developer API with a service account); nothing is stored. Only the app and our own pages may ask.
export function OPTIONS(request: Request) {
  return preflight(request, GOOGLE_CORS);
}

export async function POST(request: Request) {
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), GOOGLE_CORS);
  const res = await withJsonBody(request, (body) => handleGoogleEntitlement(body, googleContext(request)), GOOGLE_MAX_BODY_BYTES);
  return withCors(request, res, GOOGLE_CORS);
}
