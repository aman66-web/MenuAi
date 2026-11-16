import { APP_ORIGIN } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleCheckout } from "@/lib/payments/handlers";
import { payContext } from "@/lib/payments/route";

// POST { plan: "pass90" | "annual" | "monthly", ref?: "creator-code" } -> { url } (Stripe Checkout). Website only: App Store guideline 3.1.1 does not allow buying
// digital features in the iPhone app with anything but In-App Purchase, so a request from the app's own origin is refused here.
export async function POST(request: Request) {
  if (request.headers.get("origin") === APP_ORIGIN) return Response.json({ error: "not_in_app", message: "Purchases in the app use the App Store." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return withJsonBody(request, (body) => handleCheckout(body, payContext(request)));
}
