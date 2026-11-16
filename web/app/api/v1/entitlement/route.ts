import { APP_ORIGIN } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleClaim } from "@/lib/payments/handlers";
import { payContext } from "@/lib/payments/route";

// POST { sessionId } -> { token, plan, expiresAt }: the success page after Stripe sends the person back. The Session is read from Stripe (never trusted from the browser).
export async function POST(request: Request) {
  if (request.headers.get("origin") === APP_ORIGIN) return Response.json({ error: "not_in_app", message: "Purchases in the app use the App Store." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return withJsonBody(request, (body) => handleClaim(body, payContext(request)));
}
