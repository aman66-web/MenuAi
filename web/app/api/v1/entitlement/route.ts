import { isAppOrigin, storeOfApp } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleClaim } from "@/lib/payments/handlers";
import { payContext } from "@/lib/payments/route";

// POST { sessionId } -> { token, plan, expiresAt }: the success page after Stripe sends the person back. The Session is read from Stripe (never trusted from the browser).
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (isAppOrigin(origin)) return Response.json({ error: "not_in_app", message: `Purchases in the app use ${storeOfApp(origin)}.` }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return withJsonBody(request, (body) => handleClaim(body, payContext(request)));
}
