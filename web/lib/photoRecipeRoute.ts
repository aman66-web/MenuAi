import "server-only";
import { createHash } from "node:crypto";
import { APP_ORIGIN, withCors, type CorsOptions } from "./cors";
import { PAID_ACCESS_ENABLED, PHOTO_RECIPES_ENABLED, PRO_ENABLED } from "./mm/config";
import { verifyToken } from "./payments/token";
import type { PhotoCtx } from "./photoRecipeHandler";
import { anthropicDescribePhoto, anthropicPhotoRecipe } from "./photoRecipeAi";
import { makeLimiter } from "./recipeHandler";

// What the two Make it at home routes share: the switch, who may call (our own pages and the iPhone app), the Premium check and the rate limits.

/** The app sends the person's paid token in an Authorization header. */
export const PHOTO_CORS: CorsOptions = { methods: "POST, OPTIONS", headers: "Content-Type, Authorization" };

const recipeLimit = makeLimiter(5, 25);
const describeLimit = makeLimiter(10, 40);

function publicKey(): JsonWebKey | null {
  try {
    const raw = process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK;
    return raw ? (JSON.parse(raw) as JsonWebKey) : null;
  } catch {
    return null;
  }
}

/** Premium = a paid token the server signed and that hasn't run out (lib/payments/token.ts). Test builds that preview Pro without any payments (NEXT_PUBLIC_PRO=1, never
 *  set on the live site) count everyone as Premium, as the app itself does there. */
export async function hasPremium(request: Request, nowMs = Date.now()): Promise<boolean> {
  const token = /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const key = publicKey();
  if (token && key && (await verifyToken(token, key, nowMs))) return true;
  return PRO_ENABLED && !PAID_ACCESS_ENABLED;
}

export const notFound = (request: Request) => withCors(request, Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);

/** Only our own pages (same host) and the iPhone app may ask: a browser always sends Origin on a POST. */
export function fromUs(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === APP_ORIGIN) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function caller(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex");
}

export function photoCtx(request: Request, kind: "recipe" | "describe", deadlineMs: number): PhotoCtx {
  const who = caller(request);
  const started = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  return {
    ask: PHOTO_RECIPES_ENABLED ? anthropicPhotoRecipe(key) : null,
    describe: PHOTO_RECIPES_ENABLED ? anthropicDescribePhoto(key) : null,
    premium: () => hasPremium(request),
    allow: () => (kind === "recipe" ? recipeLimit(who) : describeLimit(who)),
    timeLeft: () => deadlineMs - (Date.now() - started),
  };
}
