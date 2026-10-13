import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { supabaseAuthPort } = await import("../lib/auth/port-supabase");
const { AuthError } = await import("../lib/auth/types");

const cfg = (fetch: typeof globalThis.fetch) => ({ url: "https://abc.supabase.co/", secretKey: "sb_secret_test_key_0123456789", fetch });
const reply = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("the Supabase port: Google and Apple through the browser", () => {
  it("builds the authorize address with the PKCE challenge and our callback", () => {
    const port = supabaseAuthPort(cfg(reply(200)));
    const url = new URL(port.oauthUrl("google", "https://numbite.com/auth/callback", "C".repeat(43)));
    expect(url.origin + url.pathname).toBe("https://abc.supabase.co/auth/v1/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      provider: "google",
      redirect_to: "https://numbite.com/auth/callback",
      code_challenge: "C".repeat(43),
      code_challenge_method: "s256",
    });
  });

  it("swaps the code and verifier for a session at /token?grant_type=pkce", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_at: 1900000000, user: { id: "u1", email: "a@example.com" } }),
        { status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;
    const session = await supabaseAuthPort(cfg(fetch)).oauthExchange("the-code", "V".repeat(43));
    expect(session).toEqual({ accessToken: "AT", refreshToken: "RT", expiresAt: 1900000000, user: { id: "u1", email: "a@example.com" } });
    expect(calls[0].url).toBe("https://abc.supabase.co/auth/v1/token?grant_type=pkce");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ auth_code: "the-code", code_verifier: "V".repeat(43) });
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe("sb_secret_test_key_0123456789");
  });

  it("maps Supabase's answers to our errors", async () => {
    const exchange = (status: number, body?: unknown) => supabaseAuthPort(cfg(reply(status, body))).oauthExchange("c", "V".repeat(43));
    await expect(exchange(400)).rejects.toMatchObject({ code: "invalid" });
    await expect(exchange(429)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(exchange(503)).rejects.toMatchObject({ code: "unavailable" });
    await expect(exchange(200, { access_token: "x" })).rejects.toMatchObject({ code: "invalid" }); // an answer without a user is not a session
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    await expect(supabaseAuthPort(cfg(offline)).oauthExchange("c", "V".repeat(43))).rejects.toBeInstanceOf(AuthError);
  });
});
