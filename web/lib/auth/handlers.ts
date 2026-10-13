import { z } from "zod";
import { appleSchema, deleteAccountSchema, emailStartSchema, emailVerifySchema, exchangeSchema, refreshSchema } from "./validation";
import { AuthError, OAUTH_PROVIDERS, type AuthPort, type AuthSession, type AuthUser, type OAuthProvider } from "./types";
import type { Limit } from "./limiter";
import { challengeFor, isChallenge, newVerifier } from "./pkce";
import { HANDOFF_TTL_MS, openHandoff, sealHandoff } from "./seal";
import {
  ACCESS_COOKIE, REFRESH_COOKIE, clearFlowCookie, clearSessionCookies, flowCookie, parseCookies, readFlow, safeNext, sessionCookies, withParam, FLOW_COOKIE,
} from "./cookies";
import { timingSafeEqual } from "node:crypto";

// Sign-in, as pure request handlers: (input, context) -> a result. app/api/v1/auth/* and app/auth/callback wire them up
// (lib/auth/http.ts turns a result into a Response). No Next.js or Supabase imports, so tests/auth.test.ts runs them with a fake port.

export interface AuthCtx {
  port: AuthPort;
  /** Key material for the iPhone's sealed one-time code (the server-only Supabase secret). */
  secret: string;
  now: () => number;
  limit: Limit;
  /** The caller's salted IP hash (or "unknown"): what rate limits count. */
  who: string;
  /** This site's address, no trailing slash: where Supabase sends the browser back. */
  origin: string;
  /** Whether cookies get the Secure flag (true on https). */
  secure: boolean;
  method: string;
  /** The request's Origin header is this site (browsers always send it on a POST/PUT/DELETE). */
  sameOrigin: boolean;
  /** The request's Origin is the iPhone app's own pages. */
  fromApp: boolean;
}

export interface HttpResult {
  status: number;
  body?: Record<string, unknown>;
  /** Send the browser here (302). */
  redirect?: string;
  /** Set-Cookie header values. */
  cookies?: string[];
}

const TEN_MIN = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
export const APP_REDIRECT = "numbite://auth";

const json = (status: number, body: Record<string, unknown>, cookies?: string[]): HttpResult => ({ status, body, ...(cookies ? { cookies } : {}) });
const invalid = (error: z.ZodError): HttpResult =>
  json(400, { error: "invalid_request", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
const tooMany: HttpResult = json(429, { error: "rate_limited", message: "Too many tries. Please wait a few minutes and try again." });
const unauthorized: HttpResult = json(401, { error: "unauthorized" });

/** What the app and website are told about a session. */
export const publicSession = (s: AuthSession) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, user: s.user });

/** Known sign-in failures become clean answers; anything unexpected is rethrown (a 500, details in the logs). */
function fromAuthError(e: unknown): HttpResult {
  if (e instanceof AuthError) {
    if (e.code === "rate_limited") return json(429, { error: "rate_limited", message: "Please wait a minute before asking for another code." });
    if (e.code === "unavailable") return json(503, { error: "unavailable", message: "Sign-in isn't available right now. Please try again in a moment." });
    return unauthorized;
  }
  throw e;
}

// ----------------------------------------------------------------------------------------------- native Sign in with Apple (iPhone)

export async function handleAppleNative(raw: unknown, ctx: AuthCtx): Promise<HttpResult> {
  const parsed = appleSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (!ctx.limit("apple", ctx.who, 20, TEN_MIN)) return tooMany;
  try {
    const session = await ctx.port.signInWithAppleToken(parsed.data.idToken, parsed.data.nonce);
    return json(200, { ok: true, session: publicSession(session) });
  } catch (e) {
    return fromAuthError(e);
  }
}

// ----------------------------------------------------------------------------------------------- email code

export async function handleEmailStart(raw: unknown, ctx: AuthCtx): Promise<HttpResult> {
  const parsed = emailStartSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { email, website } = parsed.data;
  if (website) return json(200, { ok: true }); // honeypot filled: pretend, send nothing
  if (!ctx.limit("email-start-ip", ctx.who, 8, TEN_MIN) || !ctx.limit("email-start-address", email, 3, TEN_MIN)) return tooMany;
  try {
    await ctx.port.sendEmailCode(email);
  } catch (e) {
    return fromAuthError(e);
  }
  return json(200, { ok: true }); // the same answer whether or not the address already had an account
}

export async function handleEmailVerify(raw: unknown, ctx: AuthCtx): Promise<HttpResult> {
  const parsed = emailVerifySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { email, code, mode } = parsed.data;
  if (mode === "token" && !ctx.fromApp) return json(403, { error: "forbidden" }); // the session may only go to the iPhone app's own pages
  if (!ctx.limit("email-verify-ip", ctx.who, 15, TEN_MIN) || !ctx.limit("email-verify-address", email, 6, TEN_MIN)) return tooMany;
  let session: AuthSession;
  try {
    session = await ctx.port.verifyEmailCode(email, code);
  } catch (e) {
    if (e instanceof AuthError && (e.code === "invalid" || e.code === "expired")) return json(400, { error: "invalid_code", message: "That code isn't right, or it has run out. Ask for a new one." });
    return fromAuthError(e);
  }
  if (mode === "token") return json(200, { ok: true, session: publicSession(session) });
  return json(200, { ok: true, user: session.user }, sessionCookies(session, ctx.secure, ctx.now()));
}

// ----------------------------------------------------------------------------------------------- Google and Apple through the browser

const isProvider = (p: string): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p);

/** Where a failed sign-in sends the person: back to Settings › Account on the website (which says what happened), or to the app. */
const failure = (mode: "web" | "app", reason: string, cookies?: string[]): HttpResult => ({
  status: 302,
  redirect: mode === "app" ? `${APP_REDIRECT}?error=${encodeURIComponent(reason)}` : `/app/settings?signin=${encodeURIComponent(reason)}#account`,
  ...(cookies ? { cookies } : {}),
});

export function handleOAuthStart(provider: string, query: URLSearchParams, ctx: AuthCtx): HttpResult {
  const mode = query.get("mode") === "app" ? "app" : "web";
  if (!isProvider(provider)) return json(404, { error: "not_found" });
  const challenge = query.get("challenge");
  if (mode === "app" && !isChallenge(challenge)) return json(400, { error: "invalid_request", message: "challenge missing" });
  if (!ctx.limit("oauth-start", ctx.who, 30, TEN_MIN)) return failure(mode, "busy");
  const verifier = newVerifier();
  const flow = mode === "app" ? { v: verifier, m: "app" as const, c: challenge as string } : { v: verifier, m: "web" as const, n: safeNext(query.get("next")) };
  const url = ctx.port.oauthUrl(provider, `${ctx.origin}/auth/callback`, challengeFor(verifier));
  return { status: 302, redirect: url, cookies: [flowCookie(flow, ctx.secure)] };
}

/** Supabase sends the browser back here with ?code=... (or ?error=...). We hold the PKCE verifier in the flow cookie. */
export async function handleOAuthCallback(query: URLSearchParams, cookieHeader: string | null, ctx: AuthCtx): Promise<HttpResult> {
  const flow = readFlow(parseCookies(cookieHeader)[FLOW_COOKIE]);
  const clear = clearFlowCookie(ctx.secure);
  if (!flow) return failure("web", "expired", [clear]); // no sign-in in progress here (cookie missing or too old)
  const code = query.get("code");
  if (query.get("error") || !code) return failure(flow.m, query.get("error") === "access_denied" ? "cancelled" : "failed", [clear]);
  let session: AuthSession;
  try {
    session = await ctx.port.oauthExchange(code, flow.v);
  } catch (e) {
    if (e instanceof AuthError) return failure(flow.m, "failed", [clear]);
    throw e;
  }
  // "?signin=ok" tells the page to ask who is signed in (a visitor who never signed in sends the server nothing at all)
  if (flow.m === "web") return { status: 302, redirect: withParam(safeNext(flow.n), "signin", "ok"), cookies: [clear, ...sessionCookies(session, ctx.secure, ctx.now())] };
  if (!isChallenge(flow.c)) return failure("app", "failed", [clear]);
  const handoff = sealHandoff({ session, challenge: flow.c, expires: ctx.now() + HANDOFF_TTL_MS }, ctx.secret);
  return { status: 302, redirect: `${APP_REDIRECT}?code=${handoff}`, cookies: [clear] };
}

/** The iPhone app swaps its one-time code (plus its PKCE verifier) for the session. */
export async function handleExchange(raw: unknown, ctx: AuthCtx): Promise<HttpResult> {
  const parsed = exchangeSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (!ctx.limit("exchange", ctx.who, 20, TEN_MIN)) return tooMany;
  const handoff = openHandoff(parsed.data.code, ctx.secret, ctx.now());
  if (!handoff) return unauthorized;
  const mine = Buffer.from(challengeFor(parsed.data.verifier));
  const theirs = Buffer.from(handoff.challenge);
  if (mine.length !== theirs.length || !timingSafeEqual(mine, theirs)) return unauthorized;
  return json(200, { ok: true, session: publicSession(handoff.session) });
}

// ----------------------------------------------------------------------------------------------- being signed in

export async function handleRefresh(raw: unknown, ctx: AuthCtx): Promise<HttpResult> {
  const parsed = refreshSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (!ctx.limit("refresh", ctx.who, 60, TEN_MIN)) return tooMany;
  try {
    return json(200, { ok: true, session: publicSession(await ctx.port.refresh(parsed.data.refreshToken)) });
  } catch (e) {
    return fromAuthError(e);
  }
}

export interface Authed {
  user: AuthUser;
  /** The access token that proved it (for signing out). */
  token: string;
  viaCookie: boolean;
  /** New cookies to send back when the session was just renewed. */
  cookies?: string[];
}

/**
 * Who is calling: an `Authorization: Bearer` token (the iPhone app), or the website's cookies. A cookie caller whose access token has run out
 * is renewed with its refresh cookie (only sent to /api/v1/auth/*, so /api/v1/auth/session is where the website renews). Cookie callers that
 * change something must come from this site's own pages (the Origin check), on top of SameSite=Lax.
 */
export async function authenticate(headers: Headers, ctx: AuthCtx): Promise<Authed | null> {
  const bearer = headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    const user = await ctx.port.userFromToken(token);
    return user ? { user, token, viaCookie: false } : null;
  }
  const jar = parseCookies(headers.get("cookie"));
  if (ctx.method !== "GET" && ctx.method !== "HEAD" && !ctx.sameOrigin) return null;
  const access = jar[ACCESS_COOKIE];
  if (access) {
    const user = await ctx.port.userFromToken(access);
    if (user) return { user, token: access, viaCookie: true };
  }
  const refresh = jar[REFRESH_COOKIE];
  if (refresh) {
    try {
      const session = await ctx.port.refresh(refresh);
      return { user: session.user, token: session.accessToken, viaCookie: true, cookies: sessionCookies(session, ctx.secure, ctx.now()) };
    } catch (e) {
      if (e instanceof AuthError && (e.code === "invalid" || e.code === "expired")) return null;
      throw e;
    }
  }
  return null;
}

export async function handleSession(headers: Headers, ctx: AuthCtx): Promise<HttpResult> {
  const who = await authenticate(headers, ctx);
  if (!who) return json(200, { user: null });
  return json(200, { user: who.user }, who.cookies);
}

export async function handleSignOut(headers: Headers, ctx: AuthCtx): Promise<HttpResult> {
  const jar = parseCookies(headers.get("cookie"));
  const bearer = headers.get("authorization");
  const token = bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : jar[ACCESS_COOKIE];
  if (token && !bearer && !ctx.sameOrigin) return json(403, { error: "forbidden" }); // a cookie sign-out must come from this site's own pages
  if (token) {
    try {
      await ctx.port.signOut(token);
    } catch {
      // best effort: the cookies are cleared below either way
    }
  }
  return json(200, { ok: true }, clearSessionCookies(ctx.secure));
}

export async function handleDeleteAccount(raw: unknown, headers: Headers, ctx: AuthCtx): Promise<HttpResult> {
  const parsed = deleteAccountSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const who = await authenticate(headers, ctx);
  if (!who) return unauthorized;
  if (!ctx.limit("delete-account", who.user.id, 5, HOUR)) return tooMany;
  await ctx.port.deleteUser(who.user.id); // the database removes every synced row with the account (on delete cascade)
  return json(200, { ok: true }, clearSessionCookies(ctx.secure));
}
