import { describe, expect, it } from "vitest";
import { handleRefresh, handleSession, handleSignOut, type AuthCtx } from "../lib/auth/handlers";
import { makeLimit } from "../lib/auth/limiter";
import { AuthError, type AuthPort, type AuthSession } from "../lib/auth/types";
import { AccountError, appleDeleteConfirm, createAccountApi, type StoredSession } from "../lib/mm/account";

// The iPhone app's side of being signed in (lib/mm/account.ts), wired to the real server handlers (lib/auth/handlers.ts) through a pretend network. An access
// token lasts an hour, so on a cold launch the stored one has usually run out: the app must renew it, never take "not accepted" as "signed out"
// (the overnight audit of 20 November 2026 found everyone signed out after an hour away).

const NOW = Date.UTC(2026, 10, 20, 9, 0, 0);
const user = { id: "u1", email: "a@example.com" };

function world(over: { refresh?: "ok" | "refused" | "down" | "limited" } = {}) {
  const live = new Set<string>(["fresh-at"]);
  const ended: string[] = [];
  let issued = 0;
  const port = {
    async userFromToken(t: string) {
      return live.has(t) ? user : null;
    },
    async refresh(rt: string): Promise<AuthSession> {
      if (over.refresh === "down") throw new AuthError("unavailable");
      if (over.refresh === "limited") throw new AuthError("rate_limited");
      if (over.refresh === "refused" || rt !== "refresh-token-1") throw new AuthError("invalid");
      const at = `renewed-at-${++issued}`;
      live.add(at);
      return { accessToken: at, refreshToken: "refresh-token-2", expiresAt: Math.floor(NOW / 1000) + 3600, user };
    },
    async signOut(t: string) {
      if (!live.has(t)) throw new AuthError("invalid");
      live.delete(t);
      ended.push(t);
    },
  } as unknown as AuthPort;
  const ctx: AuthCtx = { port, secret: "x".repeat(32), now: () => NOW, limit: makeLimit(() => NOW), who: "w", origin: "https://numbite.com", secure: true, method: "GET", sameOrigin: false, fromApp: true };
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const path = String(url).replace("https://numbite.com/api/v1/", "");
    calls.push(path);
    const headers = new Headers(init.headers as Record<string, string>);
    const r =
      path === "auth/session" ? await handleSession(headers, { ...ctx, method: "GET" })
      : path === "auth/refresh" ? await handleRefresh(JSON.parse(String(init.body)), { ...ctx, method: "POST" })
      : path === "auth/signout" ? await handleSignOut(headers, { ...ctx, method: "POST" })
      : path === "sync" ? (live.has((headers.get("authorization") ?? "").slice(7)) ? { status: 200, body: { stores: {} } } : { status: 401, body: { error: "unauthorized" } })
      : { status: 404, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { fakeFetch, calls, ended, live };
}

function app(w: ReturnType<typeof world>, session: StoredSession | null) {
  let stored = session;
  const tokens = { get: () => stored, set: (v: StoredSession | null) => void (stored = v) } as never;
  const api = createAccountApi({ fetch: w.fakeFetch, base: "https://numbite.com/api/v1/", useTokens: true, tokens, now: () => NOW });
  return { api, stored: () => stored };
}

const expired: StoredSession = { accessToken: "expired-at", refreshToken: "refresh-token-1", expiresAt: Math.floor(NOW / 1000) - 600 };

describe("the iPhone app's session at launch", () => {
  it("an access token that has run out is renewed first, and the person is still signed in", async () => {
    const w = world();
    const a = app(w, expired);
    expect(await a.api.session()).toEqual(user);
    expect(w.calls).toEqual(["auth/refresh", "auth/session"]);
    expect(a.stored()).toMatchObject({ accessToken: "renewed-at-1", refreshToken: "refresh-token-2" });
  });

  it("a token the server refuses although it looked fresh (ended, clock wrong) is renewed on the 401 and asked again", async () => {
    const w = world();
    const a = app(w, { ...expired, expiresAt: Math.floor(NOW / 1000) + 3000 });
    expect(await a.api.session()).toEqual(user);
    expect(w.calls).toEqual(["auth/session", "auth/refresh", "auth/session"]);
  });

  it("a fresh token is used as it is", async () => {
    const w = world();
    const a = app(w, { accessToken: "fresh-at", refreshToken: "refresh-token-1", expiresAt: Math.floor(NOW / 1000) + 3000 });
    expect(await a.api.session()).toEqual(user);
    expect(w.calls).toEqual(["auth/session"]);
  });

  it("a refresh token the server refuses means signed out: the stored session is cleared and nobody is signed in", async () => {
    const w = world({ refresh: "refused" });
    const a = app(w, expired);
    expect(await a.api.session()).toBeNull();
    expect(a.stored()).toBeNull();
  });

  it("when the session can't be renewed just now (the server is busy) it throws, so the app keeps who it knew", async () => {
    const w = world({ refresh: "down" });
    const a = app(w, expired);
    const err = await a.api.session().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccountError);
    expect(a.stored()).toEqual(expired); // kept, to try again later
  });

  it("no stored session: nobody, without asking the server", async () => {
    const w = world();
    const a = app(w, null);
    expect(await a.api.session()).toBeNull();
    expect(w.calls).toEqual([]);
  });
});

describe("signing out in the iPhone app", () => {
  it("renews a token that has run out first, so the server really ends the session, then clears it here", async () => {
    const w = world();
    const a = app(w, expired);
    await a.api.signOut();
    expect(w.calls).toEqual(["auth/refresh", "auth/signout"]);
    expect(w.ended).toEqual(["renewed-at-1"]);
    expect(a.stored()).toBeNull();
  });

  it("offline, the session here is cleared anyway", async () => {
    let stored: StoredSession | null = { accessToken: "fresh-at", refreshToken: "refresh-token-1", expiresAt: Math.floor(NOW / 1000) + 3000 };
    const tokens = { get: () => stored, set: (v: StoredSession | null) => void (stored = v) } as never;
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await createAccountApi({ fetch: offline, base: "https://numbite.com/api/v1/", useTokens: true, tokens, now: () => NOW }).signOut();
    expect(stored).toBeNull();
  });
});

// The meeting of 21 November 2026 (Ben): a signed-in request that is refused (401) renews the session once; when the renewal itself fails for a moment (the
// server answers 503 or 429), the person must stay signed in. The sync takes a 401 as "signed out", so the client says "unavailable" instead.
describe("a signed-in request whose token has run out", () => {
  const stale: StoredSession = { accessToken: "stale-at", refreshToken: "refresh-token-1", expiresAt: Math.floor(NOW / 1000) + 3000 };

  it("is renewed on the 401 and asked again", async () => {
    const w = world();
    const a = app(w, stale);
    expect(await a.api.syncGetAll()).toEqual({});
    expect(w.calls).toEqual(["sync", "auth/refresh", "sync"]);
  });

  it.each(["down", "limited"] as const)("a refresh the server can't do just now (%s) is 'unavailable', never a sign-out", async (refresh) => {
    const w = world({ refresh });
    const a = app(w, stale);
    const err = (await a.api.syncGetAll().catch((e: unknown) => e)) as AccountError;
    expect(err).toBeInstanceOf(AccountError);
    expect(err.status).toBe(503);
    expect(a.stored()).toEqual(stale); // kept, to try again later
  });

  it("a refresh token the server refuses still signs out: the 401 comes back and the stored session is cleared", async () => {
    const w = world({ refresh: "refused" });
    const a = app(w, stale);
    const err = (await a.api.syncGetAll().catch((e: unknown) => e)) as AccountError;
    expect(err.status).toBe(401);
    expect(a.stored()).toBeNull();
  });
});

describe("the website's signed-in request (cookies)", () => {
  function site(sessionAnswer: { status: number; body: unknown }) {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      const path = String(url).replace("https://numbite.com/api/v1/", "");
      calls.push(path);
      const r = path === "auth/session" ? sessionAnswer : { status: 401, body: { error: "unauthorized" } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof fetch;
    const tokens = { get: () => null, set: () => undefined } as never;
    return { api: createAccountApi({ fetch: fakeFetch, base: "https://numbite.com/api/v1/", useTokens: false, tokens, now: () => NOW }), calls };
  }

  it.each([503, 429, 500])("cookies that can't be renewed just now (%i) are 'unavailable', not signed out", async (status) => {
    const s = site({ status, body: { error: "unavailable" } });
    const err = (await s.api.syncGetAll().catch((e: unknown) => e)) as AccountError;
    expect(err).toBeInstanceOf(AccountError);
    expect(err.status).toBe(503);
  });

  it("the server saying nobody is signed in (200, no user) hands back the 401: signed out", async () => {
    const s = site({ status: 200, body: { user: null } });
    const err = (await s.api.syncGetAll().catch((e: unknown) => e)) as AccountError;
    expect(err.status).toBe(401);
    expect(s.calls).toEqual(["sync", "auth/session"]);
  });
});

// The meeting of 21 November 2026 (Ben): closing Apple's confirm sheet went on to delete the account.
describe("Apple's sheet before deleting an account that signs in with Apple", () => {
  it("cancelled: nothing is deleted", async () => {
    expect(await appleDeleteConfirm(async () => ({ error: "cancelled" }))).toBeNull();
  });
  it("confirmed: the one-time code goes with the deletion", async () => {
    expect(await appleDeleteConfirm(async () => ({ appleCode: "c".repeat(40) }))).toEqual({ appleCode: "c".repeat(40) });
  });
  it.each(["unavailable", "timeout", "denied"])("%s: the account is still deleted, without a code", async (error) => {
    expect(await appleDeleteConfirm(async () => ({ error }))).toEqual({});
  });
});
