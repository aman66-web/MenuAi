import "server-only";
import { z } from "zod";
import { ipHash } from "../http";
import { makeLimit } from "../auth/limiter";
import { site } from "../../site.config";
import type { PayDeps } from "./handlers";
import { supabaseEntitlements } from "./store-supabase";
import { signClaims } from "./token";
import type { StripeEnv } from "./stripe";

// The glue between the payment routes and the pure handlers (lib/payments/handlers.ts): read the server's settings, and say "not set up" (503) when any is missing, so
// a site deployed before the founder has made a Stripe account just answers that, instead of failing oddly. Nothing here is read at import time.

const limit = makeLimit();

const schema = z.object({
  STRIPE_SECRET_KEY: z.string().min(20),
  STRIPE_WEBHOOK_SECRET: z.string().min(10),
  STRIPE_PRICE_PASS90: z.string().min(5),
  STRIPE_PRICE_ANNUAL: z.string().min(5),
  STRIPE_PRICE_MONTHLY: z.string().min(5),
  ENTITLEMENT_PRIVATE_JWK: z.string().min(50),
});

export function payContext(request: Request): PayDeps {
  const parsed = schema.safeParse(process.env);
  const who = ipHash(request) ?? "unknown";
  let env: StripeEnv | null = null;
  let privateJwk: JsonWebKey | null = null;
  if (parsed.success) {
    try {
      privateJwk = JSON.parse(parsed.data.ENTITLEMENT_PRIVATE_JWK) as JsonWebKey;
      env = {
        secretKey: parsed.data.STRIPE_SECRET_KEY,
        webhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
        prices: { pass90: parsed.data.STRIPE_PRICE_PASS90, annual: parsed.data.STRIPE_PRICE_ANNUAL, monthly: parsed.data.STRIPE_PRICE_MONTHLY },
        siteUrl: site.url.replace(/\/$/, ""),
      };
    } catch {
      env = null; // a private key that isn't JSON: treated as not set up
    }
  }
  return {
    env,
    fetch: (url, init) => fetch(url, init),
    store: supabaseEntitlements,
    sign: (claims) => {
      if (!privateJwk) throw new Error("no signing key");
      return signClaims(claims, privateJwk);
    },
    now: () => Date.now(),
    allow: (key) => limit(`pay:${key}`, who, key === "checkout" ? 20 : 30, 10 * 60 * 1000),
  };
}
