import { fromUs, preflight, withCors } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleAppleEntitlement } from "@/lib/payments/appleHandler";
import { APPLE_CORS, APPLE_MAX_BODY_BYTES, appleContext } from "@/lib/payments/appleRoute";

// POST { transactions: [StoreKit 2 signed transactions] } -> { token, plan, expiresAt }: the iPhone app's In-App Purchases (and "Restore purchases") turned into
// our access token. Each transaction is checked against Apple's certificates here (lib/payments/apple.ts); nothing is stored. Only the app and our own pages may ask.
export function OPTIONS(request: Request) {
  return preflight(request, APPLE_CORS);
}

export async function POST(request: Request) {
  if (!fromUs(request)) return withCors(request, Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } }), APPLE_CORS);
  const res = await withJsonBody(request, (body) => handleAppleEntitlement(body, appleContext(request)), APPLE_MAX_BODY_BYTES);
  return withCors(request, res, APPLE_CORS);
}
