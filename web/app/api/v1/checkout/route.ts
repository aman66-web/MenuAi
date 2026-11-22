import { isAppOrigin, storeOfApp } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { handleCheckout } from "@/lib/payments/handlers";
import { payContext } from "@/lib/payments/route";

// POST { plan: "pass90" | "annual" | "monthly", ref?: "creator-code" } -> { url } (Stripe Checkout). Website only: App Store guideline 3.1.1 does not allow buying
// digital features in the iPhone app with anything but In-App Purchase (Google Play has the same rule for the Android app), so a request from an app's own origin is refused here.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (isAppOrigin(origin)) return Response.json({ error: "not_in_app", message: `Purchases in the app use ${storeOfApp(origin)}.` }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return withJsonBody(request, (body) => handleCheckout(body, payContext(request)));
}
