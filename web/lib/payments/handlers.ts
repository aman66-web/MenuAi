// The three payment endpoints as pure functions (the routes in app/api/v1 only pass a request in and a response out), so every rule is tested without Stripe or a database:
//   handleCheckout  create a Checkout Session for a plan and hand back its address;
//   handleWebhook   Stripe tells us a payment happened, renewed, was cancelled or refunded: the entitlement follows;
//   handleClaim     the success page asks for the access token for a Session it was sent back from (works before or after the webhook arrives);
//   handleMine      a signed-in person asks for their access token by their verified email (another device, a reinstall).
// Nothing here trusts the browser: the plan's price is Stripe's, the paid state is read from Stripe, and the token is signed here.

import type { Result } from "../handlers";
import { firstExpiry, isPlanId, renewalExpiry, cleanRef, type PlanId } from "./plans";
import { createCheckoutSession, readSession, retrieveCheckoutSession, verifyStripeSignature, type CheckoutSession, type FetchLike, type StripeEnv } from "./stripe";
import type { EntitlementClaims } from "./token";
import type { EntitlementRecord, EntitlementStore } from "./store";

export interface PayDeps {
  /** null when Stripe isn't set up on this server: every route answers 503 instead of failing oddly. */
  env: StripeEnv | null;
  fetch: FetchLike;
  store: EntitlementStore;
  sign: (claims: EntitlementClaims) => Promise<string>;
  now: () => number;
  /** false when the caller has asked too often. */
  allow?: (key: string) => boolean;
}

const unavailable = (): Result => ({ status: 503, body: { error: "payments_unavailable", message: "Paying isn't available right now. Please try again later." } });
const tooMany = (): Result => ({ status: 429, body: { error: "rate_limited", message: "Too many tries. Please wait a few minutes." } });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---- checkout

export async function handleCheckout(body: unknown, deps: PayDeps): Promise<Result> {
  if (!deps.env) return unavailable();
  if (deps.allow && !deps.allow("checkout")) return tooMany();
  if (!isObject(body) || !isPlanId(body.plan)) return { status: 400, body: { error: "invalid_request", message: "Choose a plan." } };
  const ref = body.ref === undefined || body.ref === null || body.ref === "" ? null : cleanRef(body.ref);
  if (body.ref !== undefined && body.ref !== null && body.ref !== "" && !ref) return { status: 400, body: { error: "invalid_request", message: "That link code isn't valid." } };
  try {
    const session = await createCheckoutSession(deps.fetch, deps.env, body.plan, ref);
    return { status: 200, body: { url: session.url } };
  } catch (error) {
    console.error(error);
    return { status: 502, body: { error: "checkout_failed", message: "Couldn't start the payment. Please try again." } };
  }
}

// ---- turning a paid Session into an entitlement

async function recordFor(s: CheckoutSession, deps: PayDeps): Promise<EntitlementRecord | null> {
  if (!s.paid || !s.email || !s.plan) return null;
  const at = deps.now();
  return deps.store.upsertBySession({
    email: s.email,
    source: "stripe",
    plan: s.plan,
    status: "active",
    startedAt: at,
    expiresAt: firstExpiry(s.plan, at),
    stripeSessionId: s.id,
    stripeCustomerId: s.customer,
    stripeSubscriptionId: s.subscription,
    stripePaymentIntentId: s.paymentIntent,
    appleOriginalTransactionId: null,
    ref: s.ref,
    amountPence: s.amountTotal,
    currency: s.currency,
  });
}

/** Access stands while it is paid for: an active entitlement, or a cancelled subscription whose paid time hasn't run out (cancelling stops the next renewal, not
 *  what was already paid for; "Restore" on another device must still find it). A refund or an expiry ends it. */
export const givesAccess = (rec: Pick<EntitlementRecord, "status" | "expiresAt">, nowMs: number): boolean =>
  (rec.status === "active" || rec.status === "cancelled") && rec.expiresAt > nowMs;

async function tokenFor(rec: EntitlementRecord, deps: PayDeps): Promise<Result> {
  const now = deps.now();
  if (!givesAccess(rec, now)) return { status: 402, body: { error: "expired", message: "That access has ended." } };
  const claims: EntitlementClaims = { v: 1, plan: rec.plan, src: rec.source, iat: Math.floor(now / 1000), exp: Math.floor(rec.expiresAt / 1000) };
  return { status: 200, body: { token: await deps.sign(claims), plan: rec.plan, expiresAt: rec.expiresAt } };
}

// ---- the success page

export async function handleClaim(body: unknown, deps: PayDeps): Promise<Result> {
  if (!deps.env) return unavailable();
  if (deps.allow && !deps.allow("claim")) return tooMany();
  if (!isObject(body) || typeof body.sessionId !== "string") return { status: 400, body: { error: "invalid_request", message: "Missing payment reference." } };
  try {
    const known = await deps.store.findBySession(body.sessionId);
    if (known) return tokenFor(known, deps);
    const session = await retrieveCheckoutSession(deps.fetch, deps.env, body.sessionId);
    if (!session) return { status: 404, body: { error: "not_found", message: "We couldn't find that payment." } };
    if (!session.paid) return { status: 402, body: { error: "not_paid", message: "That payment hasn't gone through." } };
    const rec = await recordFor(session, deps);
    if (!rec) return { status: 422, body: { error: "incomplete", message: "That payment is missing details. Please contact support." } };
    return tokenFor(rec, deps);
  } catch (error) {
    console.error(error);
    return { status: 502, body: { error: "claim_failed", message: "Couldn't check the payment. Please try again." } };
  }
}

// ---- signed-in restore

export async function handleMine(email: string | null, deps: PayDeps): Promise<Result> {
  if (!deps.env) return unavailable();
  if (!email) return { status: 404, body: { error: "none", message: "No paid access found." } };
  const rec = await deps.store.findActiveByEmail(email.trim().toLowerCase(), deps.now());
  return rec ? tokenFor(rec, deps) : { status: 404, body: { error: "none", message: "No paid access found for this account." } };
}

// ---- the webhook

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const asEvent = (x: unknown): StripeEvent | null =>
  isObject(x) && typeof x.id === "string" && typeof x.type === "string" && isObject(x.data) && isObject((x.data as Record<string, unknown>).object) ? (x as unknown as StripeEvent) : null;

export async function handleWebhook(rawBody: string, signature: string | null, deps: PayDeps): Promise<Result> {
  if (!deps.env) return unavailable();
  if (!verifyStripeSignature(rawBody, signature, deps.env.webhookSecret, Math.floor(deps.now() / 1000))) return { status: 400, body: { error: "bad_signature" } };
  let event: StripeEvent | null;
  try {
    event = asEvent(JSON.parse(rawBody));
  } catch {
    event = null;
  }
  if (!event) return { status: 400, body: { error: "invalid_event" } };
  const obj = event.data.object;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = readSession(obj);
        if (s) await recordFor(s, deps);
        break;
      }
      case "invoice.paid": {
        const sub = typeof obj.subscription === "string" ? obj.subscription : null;
        const line = ((obj.lines as { data?: Array<{ period?: { end?: number } }> } | undefined)?.data ?? [])[0];
        const end = line?.period?.end;
        const rec = sub ? await deps.store.findBySubscription(sub) : null;
        if (rec && typeof end === "number" && Number.isFinite(end)) {
          await deps.store.update(rec.id, { expiresAt: Math.max(rec.expiresAt, renewalExpiry(end * 1000)), status: "active" });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const rec = typeof obj.id === "string" ? await deps.store.findBySubscription(obj.id) : null;
        if (rec) await deps.store.update(rec.id, { status: "cancelled" }); // what was paid for stays until its end date
        break;
      }
      case "charge.refunded": {
        if (obj.refunded !== true) break; // a part refund changes nothing
        const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
        // a one-off payment is found by its payment; a subscription's renewal charge has a payment of its own, so it is found through its invoice's subscription
        let rec = pi ? await deps.store.findByPaymentIntent(pi) : null;
        if (!rec) {
          const sub = await refundedSubscription(obj, deps);
          rec = sub ? await deps.store.findBySubscription(sub) : null;
        }
        if (rec) await deps.store.update(rec.id, { status: "refunded", expiresAt: Math.min(rec.expiresAt, deps.now()) });
        break;
      }
      default:
        break; // every other event is acknowledged and ignored
    }
  } catch (error) {
    console.error(error);
    return { status: 500, body: { error: "server_error" } }; // Stripe tries again
  }
  return { status: 200, body: { received: true } };
}

/**
 * The subscription a refunded charge paid for: the charge names its invoice (an id, or the invoice itself when expanded), and the invoice names the subscription
 * ("subscription" on older API versions, parent.subscription_details.subscription since 2025). Asked of Stripe only when the charge doesn't carry it.
 */
async function refundedSubscription(charge: Record<string, unknown>, deps: PayDeps): Promise<string | null> {
  const fromInvoice = (inv: Record<string, unknown>): string | null => {
    if (typeof inv.subscription === "string") return inv.subscription;
    const parent = isObject(inv.parent) ? inv.parent : null;
    const details = parent && isObject(parent.subscription_details) ? parent.subscription_details : null;
    return details && typeof details.subscription === "string" ? details.subscription : null;
  };
  if (isObject(charge.invoice)) return fromInvoice(charge.invoice);
  const id = typeof charge.invoice === "string" && /^in_[A-Za-z0-9]{6,64}$/.test(charge.invoice) ? charge.invoice : null;
  if (!id || !deps.env) return null;
  const res = await deps.fetch(`https://api.stripe.com/v1/invoices/${id}`, { method: "GET", headers: { Authorization: `Bearer ${deps.env.secretKey}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Stripe GET /invoices answered ${res.status}`); // the webhook answers 500 and Stripe tries again
  const inv = await res.json().catch(() => null);
  return isObject(inv) ? fromInvoice(inv) : null;
}

export type { PlanId };
