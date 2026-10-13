import type { AuthSession } from "./types";

// The website's session: two http-only cookies, never readable by page scripts.
//   nb_at  the access token (an hour), sent only to /api/v1;
//   nb_rt  the refresh token, sent only to /api/v1/auth (it can start a new session, so it goes nowhere else);
//   nb_flow  the sign-in in progress (the PKCE verifier and where to go next), ten minutes, deleted when it finishes.

export const ACCESS_COOKIE = "nb_at";
export const REFRESH_COOKIE = "nb_rt";
export const FLOW_COOKIE = "nb_flow";
export const ACCESS_PATH = "/api/v1";
export const REFRESH_PATH = "/api/v1/auth";
const REFRESH_MAX_AGE = 60 * 24 * 60 * 60;

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name && !(name in out)) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

export interface CookieOptions {
  maxAge: number;
  path: string;
  secure: boolean;
}

export function serializeCookie(name: string, value: string, o: CookieOptions): string {
  return `${name}=${value}; Path=${o.path}; Max-Age=${Math.max(0, Math.floor(o.maxAge))}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;
}

export function sessionCookies(session: AuthSession, secure: boolean, nowMs: number): string[] {
  const accessAge = Math.max(60, session.expiresAt - Math.floor(nowMs / 1000));
  return [
    serializeCookie(ACCESS_COOKIE, session.accessToken, { maxAge: accessAge, path: ACCESS_PATH, secure }),
    serializeCookie(REFRESH_COOKIE, session.refreshToken, { maxAge: REFRESH_MAX_AGE, path: REFRESH_PATH, secure }),
  ];
}

export function clearSessionCookies(secure: boolean): string[] {
  return [
    serializeCookie(ACCESS_COOKIE, "", { maxAge: 0, path: ACCESS_PATH, secure }),
    serializeCookie(REFRESH_COOKIE, "", { maxAge: 0, path: REFRESH_PATH, secure }),
  ];
}

export interface Flow {
  /** The PKCE verifier for this sign-in. */
  v: string;
  /** "web": finish with the session cookies; "app": finish with a code for the iPhone app. */
  m: "web" | "app";
  /** The app's challenge (mode "app"). */
  c?: string;
  /** Where to go after (mode "web"): a path on this site. */
  n?: string;
}

export const flowCookie = (flow: Flow, secure: boolean): string =>
  serializeCookie(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), { maxAge: 600, path: "/", secure });
export const clearFlowCookie = (secure: boolean): string => serializeCookie(FLOW_COOKIE, "", { maxAge: 0, path: "/", secure });

export function readFlow(value: string | undefined): Flow | null {
  if (!value) return null;
  try {
    const f = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Flow;
    if (typeof f.v !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(f.v) || (f.m !== "web" && f.m !== "app")) return null;
    return { v: f.v, m: f.m, ...(typeof f.c === "string" ? { c: f.c } : {}), ...(typeof f.n === "string" ? { n: f.n } : {}) };
  } catch {
    return null;
  }
}

/** Where a person goes after signing in on the website: a path on this site only (never another address). */
export function safeNext(next: unknown, fallback = "/app/settings#account"): string {
  if (typeof next !== "string" || next.length > 200 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}

/** The same path with one more query parameter (before any #fragment): how the callback tells the page "you just signed in, ask who". */
export function withParam(path: string, key: string, value: string): string {
  const hash = path.indexOf("#");
  const base = hash >= 0 ? path.slice(0, hash) : path;
  const fragment = hash >= 0 ? path.slice(hash) : "";
  return `${base}${base.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}${fragment}`;
}
