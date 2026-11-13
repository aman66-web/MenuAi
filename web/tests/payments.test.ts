import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GRACE_DAYS, PASS_DAYS, PLAN_IDS, PLANS, cleanRef, firstExpiry, renewalExpiry } from "../lib/payments/plans";
import { b64urlDecode, b64urlEncode, generateKeyPair, signClaims, verifyToken, type EntitlementClaims } from "../lib/payments/token";
import { CHECKOUT_CONSENT, checkoutForm, createCheckoutSession, readSession, retrieveCheckoutSession, verifyStripeSignature, type FetchLike, type StripeEnv } from "../lib/payments/stripe";
import { handleCheckout, handleClaim, handleMine, handleWebhook, type PayDeps } from "../lib/payments/handlers";
import { memoryEntitlementStore } from "../lib/payments/store";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const env: StripeEnv = { secretKey: "sk_test_x", webhookSecret: "whsec_test", prices: { pass90: "price_pass", annual: "price_year", monthly: "price_month" }, siteUrl: "https://numbite.com" };

describe("plans", () => {
  it("prices, pence and wording agree for every plan", () => {
    for (const id of PLAN_IDS) {
      const p = PLANS[id];
      expect(p.price).toBe(`£${(p.amountPence / 100).toFixed(2)}`);
      expect(p.id).toBe(id);
    }
    expect(PLANS.pass90.amountPence).toBe(999);
    expect(PLANS.annual.amountPence).toBe(1499);
    expect(PLANS.monthly.amountPence).toBe(299);
    expect(PLANS.pass90.mode).toBe("payment");
    expect(PLANS.annual.mode).toBe("subscription");
    expect(PLANS.monthly.mode).toBe("subscription");
    expect(PLANS.annual.tagline).toContain("29p a week"); // 14.99 / 52 = 28.8p
  });
  it("makes no comparison with any restaurant (rule 2) and no health claim (rule 3)", () => {
    for (const id of PLAN_IDS) expect(`${PLANS[id].label} ${PLANS[id].tagline} ${PLANS[id].badge ?? ""}`).not.toMatch(/nando|mcdonald|kfc|greggs|healthy|cure|medical/i);
  });
  it("the pass lasts 90 days; a subscription's access runs a few days past the paid period", () => {
    expect(firstExpiry("pass90", NOW)).toBe(NOW + PASS_DAYS * DAY);
    expect(firstExpiry("monthly", NOW)).toBe(NOW + (31 + GRACE_DAYS) * DAY);
    expect(firstExpiry("annual", NOW)).toBe(NOW + (366 + GRACE_DAYS) * DAY);
    expect(renewalExpiry(NOW)).toBe(NOW + GRACE_DAYS * DAY);
  });
  it("cleans a creator code: lower case, 2 to 32 of a-z 0-9 _ -, nothing else", () => {
    expect(cleanRef(" Anna_B-1 ")).toBe("anna_b-1");
    for (const bad of ["a", "x".repeat(33), "a b", "ab!", "<script>", "", null, undefined, 5]) expect(cleanRef(bad)).toBeNull();
  });
});

describe("entitlement token", () => {
  const claims: EntitlementClaims = { v: 1, plan: "annual", src: "stripe", iat: Math.floor(NOW / 1000), exp: Math.floor((NOW + 30 * DAY) / 1000) };
  it("is signed by the server and checked with the public key", async () => {
    const { publicJwk, privateJwk } = await generateKeyPair();
    const token = await signClaims(claims, privateJwk);
    expect(token.split(".")).toHaveLength(3);
    expect(await verifyToken(token, publicJwk, NOW)).toEqual(claims);
  });
  it("carries no name, email or card detail", async () => {
    const { privateJwk } = await generateKeyPair();
    const payload = new TextDecoder().decode(b64urlDecode((await signClaims(claims, privateJwk)).split(".")[1])!);
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(["exp", "iat", "plan", "src", "v"]);
  });
  it("refuses a changed payload, another key, an expired token and malformed text", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const token = await signClaims(claims, a.privateJwk);
    const [p, body, sig] = token.split(".");
    const forged = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...claims, plan: "pass90", exp: claims.exp + 10_000_000 })));
    expect(await verifyToken(`${p}.${forged}.${sig}`, a.publicJwk, NOW)).toBeNull();
    expect(await verifyToken(token, b.publicJwk, NOW)).toBeNull();
    expect(await verifyToken(token, a.publicJwk, NOW + 31 * DAY)).toBeNull();
    for (const bad of ["", "x", "v1.a", "v1.a.b.c", `v2.${body}.${sig}`, `${p}.${body}`, `${p}.${body}.%%%`]) expect(await verifyToken(bad, a.publicJwk, NOW)).toBeNull();
    expect(await verifyToken(token, { kty: "EC" }, NOW)).toBeNull(); // a broken key never throws
  });
});

describe("Checkout form", () => {
  it.each(PLAN_IDS)("%s: the plan's Stripe price, its mode, the success and cancel addresses, the consent words", (plan) => {
    const f = checkoutForm(plan, env);
    expect(f.get("mode")).toBe(PLANS[plan].mode);
    expect(f.get("line_items[0][price]")).toBe(env.prices[plan]);
    expect(f.get("line_items[0][quantity]")).toBe("1");
    expect(f.get("success_url")).toBe("https://numbite.com/app/pro/thanks?session_id={CHECKOUT_SESSION_ID}");
    expect(f.get("cancel_url")).toBe("https://numbite.com/app/pro?cancelled=1");
    expect(f.get("custom_text[submit][message]")).toBe(CHECKOUT_CONSENT);
    expect(f.get("metadata[plan]")).toBe(plan);
    expect(f.has("payment_method_types[0]")).toBe(false); // so Apple Pay, Google Pay and Link appear from the dashboard settings
    expect(f.has("metadata[ref]")).toBe(false);
    expect(f.has("customer_email")).toBe(false); // Stripe collects the email: no account first
  });
  it("one-off payments make a customer; subscriptions put the plan and creator code on the subscription too", () => {
    expect(checkoutForm("pass90", env, "anna").get("customer_creation")).toBe("always");
    expect(checkoutForm("pass90", env, "anna").get("payment_intent_data[metadata][ref]")).toBe("anna");
    const sub = checkoutForm("annual", env, "anna");
    expect(sub.get("subscription_data[metadata][plan]")).toBe("annual");
    expect(sub.get("subscription_data[metadata][ref]")).toBe("anna");
    expect(sub.get("metadata[ref]")).toBe("anna");
  });
  it("ignores a creator code that isn't valid", () => {
    expect(checkoutForm("pass90", env, "bad code!").has("metadata[ref]")).toBe(false);
  });
});

const jsonRes = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fakeFetch(handler: (url: string, init: Parameters<FetchLike>[1]) => ReturnType<typeof jsonRes>): FetchLike & { calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> } {
  const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
  const f = (async (url: string, init: Parameters<FetchLike>[1]) => { calls.push({ url, init }); return handler(url, init); }) as FetchLike & { calls: typeof calls };
  f.calls = calls;
  return f;
}

describe("Stripe calls", () => {
  it("creates a Checkout Session with the secret key and the form, and returns its address", async () => {
    const f = fakeFetch(() => jsonRes(200, { id: "cs_test_abc12345", url: "https://checkout.stripe.com/c/pay/cs_test_abc12345" }));
    const s = await createCheckoutSession(f, env, "monthly", "anna");
    expect(s).toEqual({ id: "cs_test_abc12345", url: "https://checkout.stripe.com/c/pay/cs_test_abc12345" });
    expect(f.calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(f.calls[0].init.method).toBe("POST");
    expect(f.calls[0].init.headers.Authorization).toBe("Bearer sk_test_x");
    expect(new URLSearchParams(f.calls[0].init.body).get("metadata[ref]")).toBe("anna");
  });
  it("refuses a Checkout address that isn't Stripe's and an error from Stripe", async () => {
    await expect(createCheckoutSession(fakeFetch(() => jsonRes(200, { id: "cs_x", url: "https://evil.example/pay" })), env, "pass90")).rejects.toThrow();
    await expect(createCheckoutSession(fakeFetch(() => jsonRes(402, { error: {} })), env, "pass90")).rejects.toThrow(/402/);
  });
  it("reads a Session back to what we use", async () => {
    const f = fakeFetch(() => jsonRes(200, { id: "cs_test_abc12345", mode: "payment", payment_status: "paid", customer_details: { email: "Ann@Example.com" }, customer: "cus_1", payment_intent: "pi_1", amount_total: 999, currency: "gbp", metadata: { plan: "pass90", ref: "Anna" } }));
    expect(await retrieveCheckoutSession(f, env, "cs_test_abc12345")).toEqual({ id: "cs_test_abc12345", mode: "payment", paid: true, email: "ann@example.com", customer: "cus_1", subscription: null, paymentIntent: "pi_1", amountTotal: 999, currency: "gbp", plan: "pass90", ref: "anna" });
    expect(f.calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions/cs_test_abc12345");
    expect(await retrieveCheckoutSession(f, env, "../../customers")).toBeNull(); // never builds a path from unchecked text
    expect(f.calls).toHaveLength(1);
    expect(readSession({ id: "cs_1", mode: "setup" })).toBeNull();
  });
});

const sign = (raw: string, t = Math.floor(NOW / 1000), secret = env.webhookSecret) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;

describe("webhook signature", () => {
  const raw = '{"id":"evt_1"}';
  it("accepts Stripe's signature and rejects everything else", () => {
    const now = Math.floor(NOW / 1000);
    expect(verifyStripeSignature(raw, sign(raw), env.webhookSecret, now)).toBe(true);
    expect(verifyStripeSignature(raw + " ", sign(raw), env.webhookSecret, now)).toBe(false); // body changed
    expect(verifyStripeSignature(raw, sign(raw, now, "whsec_other"), env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(raw, sign(raw, now - 301), env.webhookSecret, now)).toBe(false); // replayed
    expect(verifyStripeSignature(raw, sign(raw, now + 301), env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(raw, `${sign(raw)},v1=${"0".repeat(64)}`, env.webhookSecret, now)).toBe(true); // several v1: any one will do
    for (const h of [null, "", "t=1", "v1=abc", `t=${now},v1=zz`, `t=abc,v1=${"0".repeat(64)}`]) expect(verifyStripeSignature(raw, h, env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(raw, sign(raw), "", now)).toBe(false);
  });
});

async function setup(over: Partial<PayDeps> = {}, sessions: Record<string, unknown> = {}) {
  const { publicJwk, privateJwk } = await generateKeyPair();
  const store = memoryEntitlementStore();
  let now = NOW;
  const fetchFake = fakeFetch((url) => {
    const id = url.split("/").pop() as string;
    return id in sessions ? jsonRes(200, sessions[id]) : jsonRes(404, {});
  });
  const deps: PayDeps = { env, fetch: fetchFake, store, sign: (c) => signClaims(c, privateJwk), now: () => now, ...over };
  return { deps, store, publicJwk, fetchFake, advance: (ms: number) => { now += ms; } };
}

const paidSession = (id: string, over: Record<string, unknown> = {}) => ({ id, mode: "payment", payment_status: "paid", customer_details: { email: "ann@example.com" }, customer: "cus_1", payment_intent: "pi_1", amount_total: 999, currency: "gbp", metadata: { plan: "pass90", ref: "anna" }, ...over });
const event = (type: string, object: unknown, id = "evt_1") => JSON.stringify({ id, type, data: { object } });

describe("handleCheckout", () => {
  it("answers 503 when Stripe isn't set up, 400 for a bad plan or code, 200 with the address", async () => {
    const { deps } = await setup({ env: null });
    expect((await handleCheckout({ plan: "pass90" }, deps)).status).toBe(503);
    const ok = await setup({}, {});
    ok.deps.fetch = fakeFetch(() => jsonRes(200, { id: "cs_test_abc12345", url: "https://checkout.stripe.com/c/pay/x" }));
    expect((await handleCheckout({ plan: "gold" }, ok.deps)).status).toBe(400);
    expect((await handleCheckout("pass90", ok.deps)).status).toBe(400);
    expect((await handleCheckout({ plan: "pass90", ref: "no good!" }, ok.deps)).status).toBe(400);
    const r = await handleCheckout({ plan: "annual", ref: "Anna" }, ok.deps);
    expect(r).toEqual({ status: 200, body: { url: "https://checkout.stripe.com/c/pay/x" } });
    expect(new URLSearchParams((ok.deps.fetch as ReturnType<typeof fakeFetch>).calls[0].init.body).get("metadata[ref]")).toBe("anna");
  });
  it("a Stripe failure is a clean 502 that shows nothing from Stripe; too many tries is 429", async () => {
    const { deps } = await setup({ fetch: fakeFetch(() => jsonRes(500, { secret: "boom" })) });
    const r = await handleCheckout({ plan: "pass90" }, deps);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toMatch(/boom|secret|stripe/i);
    expect((await handleCheckout({ plan: "pass90" }, { ...deps, allow: () => false })).status).toBe(429);
  });
});

describe("handleWebhook", () => {
  it("refuses a request that isn't from Stripe, or isn't an event", async () => {
    const { deps } = await setup();
    const raw = event("checkout.session.completed", paidSession("cs_test_abc12345"));
    expect((await handleWebhook(raw, null, deps)).status).toBe(400);
    expect((await handleWebhook(raw, sign(raw, undefined, "whsec_wrong"), deps)).status).toBe(400);
    expect((await handleWebhook("[]", sign("[]"), deps)).status).toBe(400);
    expect((await handleWebhook("not json", sign("not json"), deps)).status).toBe(400);
    expect((await handleWebhook(raw, sign(raw), { ...deps, env: null })).status).toBe(503);
  });
  it("a paid Checkout becomes an entitlement with the email, plan, dates, creator code and amount; the same event twice makes one", async () => {
    const { deps, store } = await setup();
    const raw = event("checkout.session.completed", paidSession("cs_test_abc12345"));
    expect((await handleWebhook(raw, sign(raw), deps)).status).toBe(200);
    expect((await handleWebhook(raw, sign(raw), deps)).status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ email: "ann@example.com", plan: "pass90", status: "active", source: "stripe", ref: "anna", amountPence: 999, currency: "gbp", startedAt: NOW, expiresAt: NOW + 90 * DAY, stripeSessionId: "cs_test_abc12345", stripePaymentIntentId: "pi_1" });
  });
  it("ignores a Checkout that isn't paid, has no email or no plan", async () => {
    const { deps, store } = await setup();
    for (const [i, s] of [paidSession("cs_test_a1234567", { payment_status: "unpaid" }), paidSession("cs_test_b1234567", { customer_details: {} }), paidSession("cs_test_c1234567", { metadata: {} })].entries()) {
      const raw = event("checkout.session.completed", s, `evt_${i}`);
      expect((await handleWebhook(raw, sign(raw), deps)).status).toBe(200);
    }
    expect(store.rows).toHaveLength(0);
  });
  it("a renewal extends access to the paid period's end plus the grace days, never shortens it", async () => {
    const { deps, store } = await setup();
    const sub = paidSession("cs_test_sub12345", { mode: "subscription", subscription: "sub_1", payment_intent: null, metadata: { plan: "monthly" } });
    const a = event("checkout.session.completed", sub);
    await handleWebhook(a, sign(a), deps);
    const first = store.rows[0].expiresAt;
    const renewEnd = Math.floor((NOW + 62 * DAY) / 1000);
    const b = event("invoice.paid", { subscription: "sub_1", lines: { data: [{ period: { end: renewEnd } }] } }, "evt_2");
    await handleWebhook(b, sign(b), deps);
    expect(store.rows[0].expiresAt).toBe(renewEnd * 1000 + 3 * DAY);
    const old = event("invoice.paid", { subscription: "sub_1", lines: { data: [{ period: { end: Math.floor((NOW + 5 * DAY) / 1000) } }] } }, "evt_3");
    await handleWebhook(old, sign(old), deps);
    expect(store.rows[0].expiresAt).toBe(renewEnd * 1000 + 3 * DAY);
    expect(first).toBeLessThan(store.rows[0].expiresAt);
  });
  it("a cancelled subscription keeps what was paid for; a full refund ends the access at once; a part refund changes nothing", async () => {
    const { deps, store } = await setup();
    const sub = event("checkout.session.completed", paidSession("cs_test_sub12345", { mode: "subscription", subscription: "sub_1", payment_intent: null, metadata: { plan: "annual" } }));
    await handleWebhook(sub, sign(sub), deps);
    const end = store.rows[0].expiresAt;
    const del = event("customer.subscription.deleted", { id: "sub_1" }, "evt_4");
    await handleWebhook(del, sign(del), deps);
    expect(store.rows[0]).toMatchObject({ status: "cancelled", expiresAt: end });

    const pass = event("checkout.session.completed", paidSession("cs_test_pass1234"), "evt_5");
    await handleWebhook(pass, sign(pass), deps);
    const part = event("charge.refunded", { payment_intent: "pi_1", refunded: false }, "evt_6");
    await handleWebhook(part, sign(part), deps);
    expect(store.rows[1].status).toBe("active");
    const full = event("charge.refunded", { payment_intent: "pi_1", refunded: true }, "evt_7");
    await handleWebhook(full, sign(full), deps);
    expect(store.rows[1]).toMatchObject({ status: "refunded", expiresAt: NOW });
  });
  it("acknowledges events it doesn't use, and asks Stripe to retry when the database fails", async () => {
    const { deps, store } = await setup();
    const other = event("customer.created", { id: "cus_1" });
    expect((await handleWebhook(other, sign(other), deps)).status).toBe(200);
    store.upsertBySession = async () => { throw new Error("db down"); };
    const raw = event("checkout.session.completed", paidSession("cs_test_abc12345"));
    expect((await handleWebhook(raw, sign(raw), deps)).status).toBe(500);
  });
});

describe("handleClaim and handleMine", () => {
  it("the success page gets a token even before the webhook has arrived, and the webhook then finds the same row", async () => {
    const s = await setup({}, { cs_test_abc12345: paidSession("cs_test_abc12345") });
    const r = await handleClaim({ sessionId: "cs_test_abc12345" }, s.deps);
    expect(r.status).toBe(200);
    const claims = await verifyToken(r.body.token as string, s.publicJwk, NOW);
    expect(claims).toMatchObject({ plan: "pass90", src: "stripe", exp: Math.floor((NOW + 90 * DAY) / 1000) });
    expect(s.store.rows).toHaveLength(1);
    const raw = event("checkout.session.completed", paidSession("cs_test_abc12345"));
    await handleWebhook(raw, sign(raw), s.deps);
    expect(s.store.rows).toHaveLength(1);
    expect((await handleClaim({ sessionId: "cs_test_abc12345" }, s.deps)).status).toBe(200); // and again, from the stored row
  });
  it("refuses an unpaid Session, an unknown one, bad input and an ended entitlement", async () => {
    const s = await setup({}, { cs_test_unpaid123: paidSession("cs_test_unpaid123", { payment_status: "unpaid" }), cs_test_nomail123: paidSession("cs_test_nomail123", { customer_details: {} }) });
    expect((await handleClaim({ sessionId: "cs_test_unpaid123" }, s.deps)).status).toBe(402);
    expect((await handleClaim({ sessionId: "cs_test_nomail123" }, s.deps)).status).toBe(422);
    expect((await handleClaim({ sessionId: "cs_test_missing12" }, s.deps)).status).toBe(404);
    expect((await handleClaim({ sessionId: "not a session" }, s.deps)).status).toBe(404);
    expect((await handleClaim({}, s.deps)).status).toBe(400);
    expect((await handleClaim(null, s.deps)).status).toBe(400);
    expect((await handleClaim({ sessionId: "cs_test_abc12345" }, { ...s.deps, allow: () => false })).status).toBe(429);
    const paid = await setup({}, { cs_test_abc12345: paidSession("cs_test_abc12345") });
    await handleClaim({ sessionId: "cs_test_abc12345" }, paid.deps);
    paid.advance(91 * DAY);
    expect((await handleClaim({ sessionId: "cs_test_abc12345" }, paid.deps)).status).toBe(402);
  });
  it("a signed-in person gets their token by their verified email; nobody else's, and nothing after it ends", async () => {
    const s = await setup({}, { cs_test_abc12345: paidSession("cs_test_abc12345") });
    await handleClaim({ sessionId: "cs_test_abc12345" }, s.deps);
    expect((await handleMine("ANN@example.com ", s.deps)).status).toBe(200);
    expect((await handleMine("other@example.com", s.deps)).status).toBe(404);
    expect((await handleMine(null, s.deps)).status).toBe(404);
    s.advance(91 * DAY);
    expect((await handleMine("ann@example.com", s.deps)).status).toBe(404);
  });
});
