// Stripe through its plain HTTPS API: no `stripe` package (CLAUDE.md rule 6: no new dependency without asking). Only what the three plans need: create a Checkout
// Session, read one back, and check that a webhook really came from Stripe. `fetch` is passed in, so tests use a fake and never reach Stripe.

import { createHmac, timingSafeEqual } from "node:crypto";
import { PLANS, cleanRef, type PlanId } from "./plans";

export interface StripeEnv {
  secretKey: string;
  webhookSecret: string;
  /** One Stripe Price id per plan. */
  prices: Record<PlanId, string>;
  /** The website's address, no trailing slash. */
  siteUrl: string;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const API = "https://api.stripe.com/v1";

/**
 * The words Checkout shows above the pay button. UK law (Consumer Contracts Regulations 2013) lets a person cancel a digital purchase within 14 days unless they
 * ask for access to begin at once and accept that it ends that right; this asks for exactly that. **The founder or a solicitor should confirm this wording
 * before the first real sale** (docs/PROGRESS.md "Founder to-do").
 */
export const CHECKOUT_CONSENT =
  "By paying you ask us to give you access straight away, and you agree that this ends your 14-day right to cancel once access has begun. Subscriptions renew until you cancel.";

/** The form Checkout is created from. Apple Pay, Google Pay and Link appear on their own when they are switched on in the Stripe dashboard (no payment_method_types is sent). */
export function checkoutForm(plan: PlanId, env: StripeEnv, ref?: string | null): URLSearchParams {
  const info = PLANS[plan];
  const f = new URLSearchParams();
  f.set("mode", info.mode);
  f.set("line_items[0][price]", env.prices[plan]);
  f.set("line_items[0][quantity]", "1");
  f.set("success_url", `${env.siteUrl}/app/pro/thanks?session_id={CHECKOUT_SESSION_ID}`);
  f.set("cancel_url", `${env.siteUrl}/app/pro?cancelled=1`);
  f.set("locale", "en-GB");
  f.set("billing_address_collection", "auto");
  f.set("custom_text[submit][message]", CHECKOUT_CONSENT);
  f.set("metadata[plan]", plan);
  const r = cleanRef(ref);
  if (r) f.set("metadata[ref]", r);
  if (info.mode === "payment") {
    f.set("customer_creation", "always");
    f.set("payment_intent_data[metadata][plan]", plan);
    if (r) f.set("payment_intent_data[metadata][ref]", r);
  } else {
    f.set("subscription_data[metadata][plan]", plan);
    if (r) f.set("subscription_data[metadata][ref]", r);
  }
  return f;
}

export class StripeHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "StripeHttpError";
  }
}

async function call(fetchImpl: FetchLike, env: Pick<StripeEnv, "secretKey">, method: "GET" | "POST", path: string, form?: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.secretKey}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(form ? { body: form.toString() } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new StripeHttpError(res.status, `Stripe ${method} ${path} answered ${res.status}`);
  return body;
}

export async function createCheckoutSession(fetchImpl: FetchLike, env: StripeEnv, plan: PlanId, ref?: string | null): Promise<{ id: string; url: string }> {
  const s = await call(fetchImpl, env, "POST", "/checkout/sessions", checkoutForm(plan, env, ref));
  if (typeof s.id !== "string" || typeof s.url !== "string" || !s.url.startsWith("https://checkout.stripe.com/")) throw new Error("Stripe returned no Checkout address");
  return { id: s.id, url: s.url };
}

export interface CheckoutSession {
  id: string;
  mode: "payment" | "subscription";
  paid: boolean;
  email: string | null;
  customer: string | null;
  subscription: string | null;
  paymentIntent: string | null;
  amountTotal: number | null;
  currency: string | null;
  plan: PlanId | null;
  ref: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const idOf = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);

/** A Checkout Session object (from the API or a webhook) reduced to what we use. */
export function readSession(raw: Record<string, unknown>): CheckoutSession | null {
  const id = str(raw.id);
  if (!id || (raw.mode !== "payment" && raw.mode !== "subscription")) return null;
  const meta = (raw.metadata ?? {}) as Record<string, unknown>;
  const plan = typeof meta.plan === "string" && meta.plan in PLANS ? (meta.plan as PlanId) : null;
  const details = (raw.customer_details ?? {}) as Record<string, unknown>;
  const email = str(details.email) ?? str(raw.customer_email);
  return {
    id,
    mode: raw.mode,
    paid: raw.payment_status === "paid" || raw.payment_status === "no_payment_required",
    email: email ? email.toLowerCase() : null,
    customer: idOf(raw.customer),
    subscription: idOf(raw.subscription),
    paymentIntent: idOf(raw.payment_intent),
    amountTotal: typeof raw.amount_total === "number" ? raw.amount_total : null,
    currency: str(raw.currency),
    plan,
    ref: cleanRef(meta.ref),
  };
}

export async function retrieveCheckoutSession(fetchImpl: FetchLike, env: Pick<StripeEnv, "secretKey">, id: string): Promise<CheckoutSession | null> {
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(id)) return null;
  try {
    return readSession(await call(fetchImpl, env, "GET", `/checkout/sessions/${id}`));
  } catch (error) {
    if (error instanceof StripeHttpError && error.status === 404) return null; // Stripe has no such Session
    throw error;
  }
}

/**
 * Checks a webhook's `Stripe-Signature` header against the raw body: `t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">` (there can be several v1). The time must be within
 * `toleranceSec` of now so an old, captured request can't be replayed. Comparison is constant-time.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSec: number, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || sigs.length === 0 || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    return timingSafeEqual(expected, Buffer.from(s, "hex"));
  });
}
