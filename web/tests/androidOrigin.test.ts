import { beforeAll, describe, expect, it, vi } from "vitest";

// The Android app's pages (https://appassets.androidplatform.net) are an app like the iPhone's: sign-in finishes for them (a session may be handed to the app itself) (lib/cors.ts).

vi.mock("server-only", () => ({}));

let authContext: typeof import("../lib/auth/http").authContext;
beforeAll(async () => {
  process.env.SUPABASE_URL = "https://example-project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret-key-test-secret-key-0123456789";
  process.env.IP_HASH_SALT = "test-salt-test-salt-0123456789";
  ({ authContext } = await import("../lib/auth/http"));
});

const ask = (origin?: string) => new Request("https://numbite.com/api/v1/auth/email/verify", { method: "POST", headers: origin ? { origin } : {} });

describe("who counts as the app when signing in", () => {
  it("both apps, and not another site, an almost-matching origin or no origin", () => {
    expect(authContext(ask("app://menumath")).fromApp).toBe(true);
    expect(authContext(ask("https://appassets.androidplatform.net")).fromApp).toBe(true);
    expect(authContext(ask("https://appassets.androidplatform.net")).sameOrigin).toBe(false);
    for (const other of ["https://evil.example", "https://appassets.androidplatform.net.evil.example", "http://appassets.androidplatform.net", "null"]) expect(authContext(ask(other)).fromApp, other).toBe(false);
    expect(authContext(ask()).fromApp).toBe(false);
    expect(authContext(ask("https://numbite.com")).fromApp).toBe(false);
  });
});
