import "server-only";
import { createHash } from "node:crypto";
import { withCors, type CorsOptions } from "./cors";
import { PAID_ACCESS_ENABLED, PHOTO_RECIPES_API_ENABLED, PRO_ENABLED } from "./mm/config";
import { verifyToken, type EntitlementClaims } from "./payments/token";
import type { PhotoCtx } from "./photoRecipeHandler";
import { anthropicDescribePhoto, anthropicFridgeRecipe, anthropicPhotoRecipe } from "./photoRecipeAi";
import type { FridgeCtx } from "./fridgeRecipeHandler";
import { makeLimiter } from "./recipeHandler";
import { entitlementPublicKey } from "./payments/publicKey";

// What the AI routes share (Make it at home, Cook with what you have, Scan your food, Ask Pip): the switch, who may call (our own pages and the iPhone app),
// the Premium check and the rate limits. The limits count per paid token when a valid one is sent (UK mobile networks put many phones behind one address), and
// per address only without one. A token is counted by what it says rather than its exact text where that is fixed (limitKey), because the app is given a
// new token on every check of the same purchase or free week.

/** The app sends the person's paid token in an Authorization header. */
export const PHOTO_CORS: CorsOptions = { methods: "POST, OPTIONS", headers: "Content-Type, Authorization" };

const recipeLimit = makeLimiter(5, 25);
const describeLimit = makeLimiter(10, 40);

const publicKey = entitlementPublicKey;

const bearer = (request: Request): string | undefined => /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];

/**
 * Premium = a paid token the server signed and that hasn't run out (lib/payments/token.ts). Test builds that preview Pro without any payments (NEXT_PUBLIC_PRO=1)
 * count everyone as Premium, as the app itself does there, but never on the live site (VERCEL_ENV production), whatever the switches say. `token` and `claims`:
 * the token and what it says, when it is a valid paid one (the rate limits then count per token: limitKey).
 */
export async function premiumFor(request: Request, nowMs = Date.now()): Promise<{ premium: boolean; token?: string; claims?: EntitlementClaims }> {
  const token = bearer(request);
  const key = publicKey();
  const claims = token && key ? await verifyToken(token, key, nowMs) : null;
  if (token && claims) return { premium: true, token, claims };
  return { premium: freePreview() };
}

/**
 * What a rate limit counts for a valid token (hashed). An App Store purchase or a free week is re-signed with a new `iat` on every check, so counting the token's
 * text let each new token start a fresh allowance (meeting 21 November 2026, Chloe); their end (`exp`) is fixed (the subscription's end, the free week's end),
 * so they are counted by where they came from, the plan and that end. A gift's end moves with each token (up to GIFT_TOKEN_DAYS ahead), and counting it by its
 * claims would let gift holders share one allowance, so a gift (and anything else) is still counted by its own text.
 */
export function limitKey(token: string, c: EntitlementClaims): string {
  const fixedEnd = c.src === "apple" || (c.src === "account" && c.plan === "trial");
  return createHash("sha256").update(fixedEnd ? `claim:${c.src}:${c.plan}:${c.exp}` : `token:${token}`).digest("hex");
}

/** Everyone counts as Premium: a test build that previews Pro with no payments, never production. */
export function freePreview(vercelEnv: string | undefined = process.env.VERCEL_ENV, pro = PRO_ENABLED, paid = PAID_ACCESS_ENABLED): boolean {
  return pro && !paid && vercelEnv !== "production";
}

export async function hasPremium(request: Request, nowMs = Date.now()): Promise<boolean> {
  return (await premiumFor(request, nowMs)).premium;
}

export const notFound = (request: Request) => withCors(request, Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);

export { fromUs } from "./cors";

function caller(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex");
}

/**
 * Who a rate limit counts: the address (hashed) until the Premium check has found a valid paid token, then the token (hashed). Call `premium` before `allow`,
 * as the handlers do.
 */
export function limitedCaller(request: Request): { premium: () => Promise<boolean>; who: () => string } {
  let who = caller(request);
  return {
    premium: async () => {
      const r = await premiumFor(request);
      if (r.token && r.claims) who = limitKey(r.token, r.claims);
      return r.premium;
    },
    who: () => who,
  };
}

export function photoCtx(request: Request, kind: "recipe" | "describe", deadlineMs: number): PhotoCtx {
  const id = limitedCaller(request);
  const started = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  return {
    ask: PHOTO_RECIPES_API_ENABLED ? anthropicPhotoRecipe(key) : null,
    describe: PHOTO_RECIPES_API_ENABLED ? anthropicDescribePhoto(key) : null,
    premium: id.premium,
    allow: () => (kind === "recipe" ? recipeLimit(id.who()) : describeLimit(id.who())),
    giveBack: () => (kind === "recipe" ? recipeLimit : describeLimit).release(id.who()),
    timeLeft: () => deadlineMs - (Date.now() - started),
  };
}

/** Cook with what you have: the same switch, Premium check and recipe limit as Make it at home (the two share the limit). */
export function fridgeCtx(request: Request, deadlineMs: number): FridgeCtx {
  const id = limitedCaller(request);
  const started = Date.now();
  return {
    ask: PHOTO_RECIPES_API_ENABLED ? anthropicFridgeRecipe(process.env.ANTHROPIC_API_KEY) : null,
    premium: id.premium,
    allow: () => recipeLimit(id.who()),
    giveBack: () => recipeLimit.release(id.who()),
    timeLeft: () => deadlineMs - (Date.now() - started),
  };
}
