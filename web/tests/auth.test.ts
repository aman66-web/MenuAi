import { describe, expect, it } from "vitest";
import {
  APP_REDIRECT,
  authenticate,
  handleAppleNative,
  handleDeleteAccount,
  handleEmailStart,
  handleEmailVerify,
  handleExchange,
  handleOAuthCallback,
  handleOAuthStart,
  handleRefresh,
  handleSession,
  handleSignOut,
  type AuthCtx,
} from "../lib/auth/handlers";
import { makeLimit } from "../lib/auth/limiter";
import { challengeFor, isChallenge, newVerifier } from "../lib/auth/pkce";
import { HANDOFF_TTL_MS, openHandoff, sealHandoff } from "../lib/auth/seal";
import { ACCESS_COOKIE, FLOW_COOKIE, REFRESH_COOKIE, parseCookies, readFlow, safeNext, serializeCookie, withParam } from "../lib/auth/cookies";
import { AuthError, type AuthPort, type AuthSession, type AuthUser, type OAuthProvider } from "../lib/auth/types";

const SECRET = "test-secret-key-test-secret-key";
const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);

/** A stand-in for Supabase Auth: accounts in memory, one-time codes that only work with the right PKCE verifier. */
function fakePort() {
  const state = {
    users: new Map<string, AuthUser>(),
    emailCodes: new Map<string, string>(),
    sent: [] as string[],
    oauthCodes: new Map<string, { challenge: string; user: AuthUser }>(),
    access: new Map<string, AuthUser>(),
    refresh: new Map<string, AuthUser>(),
    deleted: [] as string[],
    signedOut: [] as string[],
    counter: 0,
  };
  const userFor = (email: string): AuthUser => {
    if (!state.users.has(email)) state.users.set(email, { id: `user-${state.users.size + 1}`, email });
    return state.users.get(email)!;
  };
  const issue = (user: AuthUser): AuthSession => {
    const n = ++state.counter;
    const s: AuthSession = { accessToken: `at-${n}`, refreshToken: `refresh-token-${n}`, expiresAt: Math.floor(T0 / 1000) + 3600, user };
    state.access.set(s.accessToken, user);
    state.refresh.set(s.refreshToken, user);
    return s;
  };
  const port: AuthPort = {
    async signInWithAppleToken(idToken) {
      if (!idToken.startsWith("apple-ok")) throw new AuthError("invalid");
      return issue(userFor("apple.person@privaterelay.example"));
    },
    async sendEmailCode(email) {
      state.sent.push(email);
      state.emailCodes.set(email, "123456");
    },
    async verifyEmailCode(email, code) {
      if (state.emailCodes.get(email) !== code) throw new AuthError("invalid");
      state.emailCodes.delete(email);
      return issue(userFor(email));
    },
    oauthUrl(provider: OAuthProvider, redirectTo, challenge) {
      return `https://fake.supabase.test/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${challenge}&code_challenge_method=s256`;
    },
    async oauthExchange(code, verifier) {
      const entry = state.oauthCodes.get(code);
      if (!entry || entry.challenge !== challengeFor(verifier)) throw new AuthError("invalid");
      state.oauthCodes.delete(code);
      return issue(entry.user);
    },
    async refresh(refreshToken) {
      const user = state.refresh.get(refreshToken);
      if (!user) throw new AuthError("invalid");
      state.refresh.delete(refreshToken);
      return issue(user);
    },
    async userFromToken(accessToken) {
      return state.access.get(accessToken) ?? null;
    },
    async signOut(accessToken) {
      state.signedOut.push(accessToken);
      state.access.delete(accessToken);
    },
    async deleteUser(userId) {
      state.deleted.push(userId);
    },
  };
  return { port, state, issue, userFor };
}

function setup(over: Partial<AuthCtx> = {}) {
  const fake = fakePort();
  let now = T0;
  const ctx: AuthCtx = {
    port: fake.port,
    secret: SECRET,
    now: () => now,
    limit: makeLimit(() => now),
    who: "caller-1",
    origin: "https://numbite.com",
    secure: true,
    method: "POST",
    sameOrigin: true,
    fromApp: false,
    ...over,
  };
  return { ...fake, ctx, advance: (ms: number) => (now += ms), setNow: (t: number) => (now = t) };
}

const setCookies = (r: { cookies?: string[] }) => r.cookies ?? [];
const cookieValue = (r: { cookies?: string[] }, name: string) => setCookies(r).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1).split(";")[0];
const asHeaders = (cookies: Record<string, string>, extra: Record<string, string> = {}) =>
  new Headers({ ...(Object.keys(cookies).length ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...extra });

describe("Sign in with Apple (iPhone)", () => {
  it("signs in and returns our session", async () => {
    const t = setup({ fromApp: true });
    const r = await handleAppleNative({ idToken: "apple-ok-token-0123456789", nonce: "abcdefgh12345678" }, t.ctx);
    expect(r.status).toBe(200);
    expect((r.body?.session as AuthSession).user.email).toBe("apple.person@privaterelay.example");
    expect(r.cookies).toBeUndefined(); // the app keeps its own session; no cookies
  });

  it("refuses a token Apple/Supabase rejects, and a malformed body", async () => {
    const t = setup();
    expect((await handleAppleNative({ idToken: "forged-token-0123456789" }, t.ctx)).status).toBe(401);
    expect((await handleAppleNative({ idToken: "x" }, t.ctx)).status).toBe(400);
    expect((await handleAppleNative(null, t.ctx)).status).toBe(400);
  });

  it("limits tries", async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) await handleAppleNative({ idToken: "forged-token-0123456789" }, t.ctx);
    expect((await handleAppleNative({ idToken: "apple-ok-token-0123456789" }, t.ctx)).status).toBe(429);
  });
});

describe("email code", () => {
  it("sends a code and gives the same answer for any address", async () => {
    const t = setup();
    const a = await handleEmailStart({ email: "  Person@Example.com " }, t.ctx);
    expect(a).toEqual({ status: 200, body: { ok: true } });
    expect(t.state.sent).toEqual(["person@example.com"]);
  });

  it("does nothing when the hidden honeypot field is filled", async () => {
    const t = setup();
    expect((await handleEmailStart({ email: "bot@example.com", website: "http://spam" }, t.ctx)).status).toBe(200);
    expect(t.state.sent).toEqual([]);
  });

  it("rejects a bad address and limits floods per address and per caller", async () => {
    const t = setup();
    expect((await handleEmailStart({ email: "not-an-email" }, t.ctx)).status).toBe(400);
    for (let i = 0; i < 3; i++) expect((await handleEmailStart({ email: "same@example.com" }, t.ctx)).status).toBe(200);
    expect((await handleEmailStart({ email: "same@example.com" }, t.ctx)).status).toBe(429);
    const u = setup();
    for (let i = 0; i < 8; i++) expect((await handleEmailStart({ email: `p${i}@example.com` }, u.ctx)).status).toBe(200);
    expect((await handleEmailStart({ email: "p9@example.com" }, u.ctx)).status).toBe(429);
  });

  it("passes on Supabase's own wait ('one code a minute')", async () => {
    const t = setup();
    t.port.sendEmailCode = async () => {
      throw new AuthError("rate_limited");
    };
    expect((await handleEmailStart({ email: "wait@example.com" }, t.ctx)).status).toBe(429);
  });

  it("verifies the code and sets http-only session cookies for the website", async () => {
    const t = setup();
    await handleEmailStart({ email: "person@example.com" }, t.ctx);
    const r = await handleEmailVerify({ email: "person@example.com", code: "123456" }, t.ctx);
    expect(r.status).toBe(200);
    expect(r.body?.user).toEqual({ id: "user-1", email: "person@example.com" });
    expect(r.body?.session).toBeUndefined(); // the website never sees the tokens
    const [access, refresh] = setCookies(r);
    expect(access).toMatch(/^nb_at=at-1; Path=\/api\/v1; Max-Age=3600; HttpOnly; SameSite=Lax; Secure$/);
    expect(refresh).toMatch(/^nb_rt=refresh-token-1; Path=\/api\/v1\/auth; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/);
  });

  it("no Secure flag on a plain-http local address", async () => {
    const t = setup({ secure: false, origin: "http://localhost:3000" });
    await handleEmailStart({ email: "person@example.com" }, t.ctx);
    const r = await handleEmailVerify({ email: "person@example.com", code: "123456" }, t.ctx);
    expect(setCookies(r).every((c) => !c.includes("Secure"))).toBe(true);
  });

  it("a wrong or used code is the same clear answer, and guessing is limited", async () => {
    const t = setup();
    await handleEmailStart({ email: "person@example.com" }, t.ctx);
    const wrong = await handleEmailVerify({ email: "person@example.com", code: "000000" }, t.ctx);
    expect(wrong.status).toBe(400);
    expect(wrong.body?.error).toBe("invalid_code");
    expect((await handleEmailVerify({ email: "person@example.com", code: "12345" }, t.ctx)).status).toBe(400); // not six digits
    for (let i = 0; i < 6; i++) await handleEmailVerify({ email: "person@example.com", code: "000001" }, t.ctx);
    expect((await handleEmailVerify({ email: "person@example.com", code: "123456" }, t.ctx)).status).toBe(429); // even the right code, after too many guesses
  });

  it("returns the session itself only to the iPhone app's own pages", async () => {
    const web = setup({ fromApp: false });
    await handleEmailStart({ email: "person@example.com" }, web.ctx);
    expect((await handleEmailVerify({ email: "person@example.com", code: "123456", mode: "token" }, web.ctx)).status).toBe(403);
    const app = setup({ fromApp: true });
    await handleEmailStart({ email: "person@example.com" }, app.ctx);
    const r = await handleEmailVerify({ email: "person@example.com", code: "123456", mode: "token" }, app.ctx);
    expect(r.status).toBe(200);
    expect((r.body?.session as AuthSession).accessToken).toBe("at-1");
    expect(r.cookies).toBeUndefined();
  });
});

describe("Google and Apple through the browser", () => {
  it("starts on the website: a PKCE cookie and a redirect to Supabase", () => {
    const t = setup({ method: "GET" });
    const r = handleOAuthStart("google", new URLSearchParams({ next: "/app/groceries" }), t.ctx);
    expect(r.status).toBe(302);
    const url = new URL(r.redirect!);
    expect(url.origin).toBe("https://fake.supabase.test");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("https://numbite.com/auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    const flow = readFlow(cookieValue(r, FLOW_COOKIE))!;
    expect(flow.m).toBe("web");
    expect(flow.n).toBe("/app/groceries");
    expect(challengeFor(flow.v)).toBe(url.searchParams.get("code_challenge")); // the cookie holds the verifier for that challenge
    expect(setCookies(r)[0]).toContain("HttpOnly");
    expect(setCookies(r)[0]).toContain("SameSite=Lax");
  });

  it("only sends people to a path on this site afterwards", () => {
    const t = setup({ method: "GET" });
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)", "/x\n/y"]) {
      const r = handleOAuthStart("google", new URLSearchParams({ next: evil }), t.ctx);
      expect(readFlow(cookieValue(r, FLOW_COOKIE))!.n).toBe("/app/settings#account");
    }
    expect(safeNext("/app/settings#account")).toBe("/app/settings#account");
  });

  it("works for Apple on the web too, refuses other providers, and needs the app's challenge in app mode", () => {
    const t = setup({ method: "GET" });
    expect(handleOAuthStart("apple", new URLSearchParams(), t.ctx).status).toBe(302);
    expect(handleOAuthStart("facebook", new URLSearchParams(), t.ctx).status).toBe(404);
    expect(handleOAuthStart("google", new URLSearchParams({ mode: "app" }), t.ctx).status).toBe(400);
    expect(handleOAuthStart("google", new URLSearchParams({ mode: "app", challenge: "short" }), t.ctx).status).toBe(400);
  });

  it("finishes on the website: session cookies, flow cookie deleted, on to the page asked for", async () => {
    const t = setup({ method: "GET" });
    const started = handleOAuthStart("google", new URLSearchParams({ next: "/app/groceries" }), t.ctx);
    const flowCookie = cookieValue(started, FLOW_COOKIE)!;
    const challenge = new URL(started.redirect!).searchParams.get("code_challenge")!;
    t.state.oauthCodes.set("code-from-google", { challenge, user: t.userFor("g@example.com") });
    const r = await handleOAuthCallback(new URLSearchParams({ code: "code-from-google" }), `${FLOW_COOKIE}=${flowCookie}`, t.ctx);
    expect(r.status).toBe(302);
    expect(r.redirect).toBe("/app/groceries?signin=ok");
    expect(cookieValue(r, ACCESS_COOKIE)).toBe("at-1");
    expect(setCookies(r).find((c) => c.startsWith(`${FLOW_COOKIE}=;`))).toContain("Max-Age=0");
  });

  it("a callback without the sign-in cookie (or a stolen code used elsewhere) fails", async () => {
    const t = setup({ method: "GET" });
    t.state.oauthCodes.set("code", { challenge: challengeFor(newVerifier()), user: t.userFor("g@example.com") });
    const noCookie = await handleOAuthCallback(new URLSearchParams({ code: "code" }), null, t.ctx);
    expect(noCookie.redirect).toBe("/app/settings?signin=expired#account");
    // a different browser's verifier can't redeem the code
    const other = handleOAuthStart("google", new URLSearchParams(), t.ctx);
    const wrong = await handleOAuthCallback(new URLSearchParams({ code: "code" }), `${FLOW_COOKIE}=${cookieValue(other, FLOW_COOKIE)}`, t.ctx);
    expect(wrong.redirect).toBe("/app/settings?signin=failed#account");
    expect(cookieValue(wrong, ACCESS_COOKIE)).toBeUndefined();
  });

  it("says 'cancelled' when the person backed out", async () => {
    const t = setup({ method: "GET" });
    const started = handleOAuthStart("google", new URLSearchParams(), t.ctx);
    const r = await handleOAuthCallback(new URLSearchParams({ error: "access_denied" }), `${FLOW_COOKIE}=${cookieValue(started, FLOW_COOKIE)}`, t.ctx);
    expect(r.redirect).toBe("/app/settings?signin=cancelled#account");
  });

  it("iPhone: finishes with a one-time code on numbite://auth, which only the app's verifier can open", async () => {
    const t = setup({ method: "GET" });
    const appVerifier = newVerifier();
    const appChallenge = challengeFor(appVerifier);
    expect(isChallenge(appChallenge)).toBe(true);
    const started = handleOAuthStart("google", new URLSearchParams({ mode: "app", challenge: appChallenge }), t.ctx);
    const serverChallenge = new URL(started.redirect!).searchParams.get("code_challenge")!;
    t.state.oauthCodes.set("g-code", { challenge: serverChallenge, user: t.userFor("g@example.com") });
    const done = await handleOAuthCallback(new URLSearchParams({ code: "g-code" }), `${FLOW_COOKIE}=${cookieValue(started, FLOW_COOKIE)}`, t.ctx);
    expect(done.redirect!.startsWith(`${APP_REDIRECT}?code=`)).toBe(true);
    expect(cookieValue(done, ACCESS_COOKIE)).toBeUndefined(); // the browser sheet gets no session cookies
    const code = new URL(done.redirect!).searchParams.get("code")!;
    expect(code).not.toContain("at-1"); // sealed: the token isn't readable in the URL

    const app = setup({ fromApp: true });
    const ok = await handleExchange({ code, verifier: appVerifier }, { ...t.ctx, method: "POST" });
    expect(ok.status).toBe(200);
    expect((ok.body?.session as AuthSession).user.email).toBe("g@example.com");
    expect(app).toBeTruthy();

    // somebody who only saw the URL (another app claiming numbite://) cannot use it
    expect((await handleExchange({ code, verifier: newVerifier() }, t.ctx)).status).toBe(401);
    // and it runs out after two minutes
    t.advance(HANDOFF_TTL_MS + 1000);
    expect((await handleExchange({ code, verifier: appVerifier }, t.ctx)).status).toBe(401);
  });

  it("iPhone: a failed or cancelled sign-in goes back to the app too", async () => {
    const t = setup({ method: "GET" });
    const started = handleOAuthStart("google", new URLSearchParams({ mode: "app", challenge: challengeFor(newVerifier()) }), t.ctx);
    const r = await handleOAuthCallback(new URLSearchParams({ error: "access_denied" }), `${FLOW_COOKIE}=${cookieValue(started, FLOW_COOKIE)}`, t.ctx);
    expect(r.redirect).toBe(`${APP_REDIRECT}?error=cancelled`);
  });

  it("exchange rejects garbage and tampering", async () => {
    const t = setup();
    expect((await handleExchange({ code: "x", verifier: "y" }, t.ctx)).status).toBe(400);
    expect((await handleExchange({ code: "A".repeat(80), verifier: newVerifier() }, t.ctx)).status).toBe(401);
    const sealed = sealHandoff({ session: t.issue(t.userFor("a@example.com")), challenge: challengeFor("v".repeat(43)), expires: T0 + 60_000 }, SECRET);
    const flipped = sealed.slice(0, 50) + (sealed[50] === "A" ? "B" : "A") + sealed.slice(51);
    expect((await handleExchange({ code: flipped, verifier: "v".repeat(43) }, t.ctx)).status).toBe(401);
  });
});

describe("sealed one-time code", () => {
  const session: AuthSession = { accessToken: "a", refreshToken: "r", expiresAt: 1, user: { id: "u", email: null } };
  const challenge = challengeFor("c".repeat(43));

  it("opens with the same secret before it expires", () => {
    const code = sealHandoff({ session, challenge, expires: T0 + 1000 }, SECRET);
    expect(openHandoff(code, SECRET, T0)?.session.user.id).toBe("u");
  });
  it("does not open after it expires, with another secret, or if changed", () => {
    const code = sealHandoff({ session, challenge, expires: T0 + 1000 }, SECRET);
    expect(openHandoff(code, SECRET, T0 + 1001)).toBeNull();
    expect(openHandoff(code, "another-secret-another-secret-xx", T0)).toBeNull();
    expect(openHandoff(code.slice(0, -2) + "AA", SECRET, T0)).toBeNull();
    expect(openHandoff("", SECRET, T0)).toBeNull();
  });
  it("is different every time", () => {
    expect(sealHandoff({ session, challenge, expires: T0 }, SECRET)).not.toBe(sealHandoff({ session, challenge, expires: T0 }, SECRET));
  });
});

describe("who is calling", () => {
  it("accepts a bearer token (the iPhone app)", async () => {
    const t = setup({ method: "GET" });
    const s = t.issue(t.userFor("a@example.com"));
    expect((await authenticate(asHeaders({}, { authorization: `Bearer ${s.accessToken}` }), t.ctx))?.user.email).toBe("a@example.com");
    expect(await authenticate(asHeaders({}, { authorization: "Bearer nope" }), t.ctx)).toBeNull();
    expect(await authenticate(asHeaders({}), t.ctx)).toBeNull();
  });

  it("accepts the website's cookie, and renews an expired access token with the refresh cookie", async () => {
    const t = setup({ method: "GET" });
    const s = t.issue(t.userFor("a@example.com"));
    expect((await authenticate(asHeaders({ [ACCESS_COOKIE]: s.accessToken }), t.ctx))?.cookies).toBeUndefined();
    const renewed = await authenticate(asHeaders({ [ACCESS_COOKIE]: "expired", [REFRESH_COOKIE]: s.refreshToken }), t.ctx);
    expect(renewed?.user.email).toBe("a@example.com");
    expect(renewed?.cookies?.length).toBe(2);
    // the old refresh token is used up, as with Supabase
    expect(await authenticate(asHeaders({ [REFRESH_COOKIE]: s.refreshToken }), t.ctx)).toBeNull();
  });

  it("a cookie request that changes something must come from this site's own pages", async () => {
    const s = setup({ method: "PUT", sameOrigin: false });
    const session = s.issue(s.userFor("a@example.com"));
    expect(await authenticate(asHeaders({ [ACCESS_COOKIE]: session.accessToken }), s.ctx)).toBeNull();
    // reading is fine, and so is the same request from the site itself
    expect(await authenticate(asHeaders({ [ACCESS_COOKIE]: session.accessToken }), { ...s.ctx, method: "GET" })).not.toBeNull();
    expect(await authenticate(asHeaders({ [ACCESS_COOKIE]: session.accessToken }), { ...s.ctx, sameOrigin: true })).not.toBeNull();
    // a bearer token doesn't depend on cookies at all
    expect(await authenticate(asHeaders({}, { authorization: `Bearer ${session.accessToken}` }), s.ctx)).not.toBeNull();
  });

  it("/session says who, or nobody", async () => {
    const t = setup({ method: "GET" });
    expect((await handleSession(asHeaders({}), t.ctx)).body).toEqual({ user: null });
    const s = t.issue(t.userFor("a@example.com"));
    expect((await handleSession(asHeaders({ [ACCESS_COOKIE]: s.accessToken }), t.ctx)).body).toEqual({ user: { id: "user-1", email: "a@example.com" } });
  });

  it("refresh gives the app a new session, and refuses an unknown token", async () => {
    const t = setup({ fromApp: true });
    const s = t.issue(t.userFor("a@example.com"));
    const r = await handleRefresh({ refreshToken: s.refreshToken }, t.ctx);
    expect(r.status).toBe(200);
    expect((r.body?.session as AuthSession).accessToken).not.toBe(s.accessToken);
    expect((await handleRefresh({ refreshToken: "unknown-refresh-token" }, t.ctx)).status).toBe(401);
  });
});

describe("sign out and delete my account", () => {
  it("sign out stops the session and clears both cookies", async () => {
    const t = setup();
    const s = t.issue(t.userFor("a@example.com"));
    const r = await handleSignOut(asHeaders({ [ACCESS_COOKIE]: s.accessToken }), t.ctx);
    expect(r.status).toBe(200);
    expect(t.state.signedOut).toEqual([s.accessToken]);
    expect(setCookies(r).every((c) => c.includes("Max-Age=0"))).toBe(true);
    expect(setCookies(r).length).toBe(2);
  });

  it("sign out from another site's page does nothing", async () => {
    const t = setup({ sameOrigin: false });
    const s = t.issue(t.userFor("a@example.com"));
    expect((await handleSignOut(asHeaders({ [ACCESS_COOKIE]: s.accessToken }), t.ctx)).status).toBe(403);
    expect(t.state.signedOut).toEqual([]);
  });

  it("sign out never fails, even if Supabase does", async () => {
    const t = setup();
    t.port.signOut = async () => {
      throw new Error("supabase down");
    };
    expect((await handleSignOut(asHeaders({ authorization: "Bearer x" }), t.ctx)).status).toBe(200);
  });

  it("delete my account deletes the account and clears the cookies", async () => {
    const t = setup({ method: "DELETE" });
    const s = t.issue(t.userFor("a@example.com"));
    const r = await handleDeleteAccount({ confirm: true }, asHeaders({ [ACCESS_COOKIE]: s.accessToken }), t.ctx);
    expect(r.status).toBe(200);
    expect(t.state.deleted).toEqual(["user-1"]);
    expect(setCookies(r).every((c) => c.includes("Max-Age=0"))).toBe(true);
  });

  it("delete needs a signed-in caller, the confirmation, and this site's own page", async () => {
    const t = setup({ method: "DELETE" });
    expect((await handleDeleteAccount({ confirm: true }, asHeaders({}), t.ctx)).status).toBe(401);
    const s = t.issue(t.userFor("a@example.com"));
    expect((await handleDeleteAccount({}, asHeaders({ authorization: `Bearer ${s.accessToken}` }), t.ctx)).status).toBe(400);
    expect((await handleDeleteAccount({ confirm: false }, asHeaders({ authorization: `Bearer ${s.accessToken}` }), t.ctx)).status).toBe(400);
    const cross = setup({ method: "DELETE", sameOrigin: false });
    const cs = cross.issue(cross.userFor("a@example.com"));
    expect((await handleDeleteAccount({ confirm: true }, asHeaders({ [ACCESS_COOKIE]: cs.accessToken }), cross.ctx)).status).toBe(401);
    expect(cross.state.deleted).toEqual([]);
    expect(t.state.deleted).toEqual([]);
  });

  it("works for the app with a bearer token", async () => {
    const t = setup({ method: "DELETE", fromApp: true, sameOrigin: false });
    const s = t.issue(t.userFor("a@example.com"));
    expect((await handleDeleteAccount({ confirm: true }, asHeaders({}, { authorization: `Bearer ${s.accessToken}` }), t.ctx)).status).toBe(200);
    expect(t.state.deleted).toEqual(["user-1"]);
  });
});

describe("cookies", () => {
  it("parses a Cookie header", () => {
    expect(parseCookies("a=1; b=two=2;  c=3")).toEqual({ a: "1", b: "two=2", c: "3" });
    expect(parseCookies(null)).toEqual({});
  });
  it("serializes http-only, same-site cookies", () => {
    expect(serializeCookie("x", "y", { maxAge: 10, path: "/p", secure: true })).toBe("x=y; Path=/p; Max-Age=10; HttpOnly; SameSite=Lax; Secure");
  });
  it("rejects a tampered flow cookie", () => {
    expect(readFlow("not-base64-json")).toBeNull();
    expect(readFlow(Buffer.from(JSON.stringify({ v: "short", m: "web" })).toString("base64url"))).toBeNull();
    expect(readFlow(Buffer.from(JSON.stringify({ v: "v".repeat(43), m: "evil" })).toString("base64url"))).toBeNull();
    expect(readFlow(undefined)).toBeNull();
  });
  it("adds a query parameter before the #fragment", () => {
    expect(withParam("/app/settings#account", "signin", "ok")).toBe("/app/settings?signin=ok#account");
    expect(withParam("/app/groceries?x=1", "signin", "ok")).toBe("/app/groceries?x=1&signin=ok");
    expect(withParam("/app", "signin", "ok")).toBe("/app?signin=ok");
  });
});
