import { respond, safely } from "@/lib/http";
import { handleWebhook } from "@/lib/payments/handlers";
import { payContext } from "@/lib/payments/route";

// Stripe's webhook (checkout.session.completed, invoice.paid, customer.subscription.deleted, charge.refunded). The signature is checked against the RAW body, so the
// body is read as text, untouched. Nothing here is callable by a browser: there is no CORS and no cookie.
export async function POST(request: Request) {
  return safely(async () => handleWebhook(await request.text(), request.headers.get("stripe-signature"), payContext(request)));
}

export const GET = () => respond({ status: 405, body: { error: "method_not_allowed" } });
