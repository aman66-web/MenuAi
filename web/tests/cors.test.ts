import { describe, expect, it } from "vitest";
import { ACCOUNT_CORS, APP_ORIGIN, corsHeaders, preflight, withCors } from "../lib/cors";

// Only the iPhone app's own origin may call our API cross-origin (docs/APP_BUILD.md).
describe("CORS for the iPhone app", () => {
  it("answers the app's origin and nobody else", () => {
    expect(corsHeaders(APP_ORIGIN)["Access-Control-Allow-Origin"]).toBe("app://menumath");
    expect(corsHeaders("https://evil.example")["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsHeaders("null")["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsHeaders(null)).toEqual({ Vary: "Origin" });
  });
  it("preflight and responses carry the headers only for the app", () => {
    const ask = (origin?: string) => new Request("https://menumacros.vercel.app/api/v1/support", { method: "OPTIONS", headers: origin ? { Origin: origin } : {} });
    expect(preflight(ask(APP_ORIGIN)).status).toBe(204);
    expect(preflight(ask(APP_ORIGIN)).headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(preflight(ask("https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
    const res = withCors(ask(APP_ORIGIN), Response.json({ ok: true }));
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(res.headers.get("vary")).toBe("Origin");
  });
  it("the sign-in and sync routes also allow GET, PUT, DELETE and the Authorization header, still only for the app", () => {
    const ask = (origin?: string) => new Request("https://numbite.com/api/v1/sync", { method: "OPTIONS", headers: origin ? { Origin: origin } : {} });
    const ok = preflight(ask(APP_ORIGIN), ACCOUNT_CORS);
    expect(ok.headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(ok.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
    expect(preflight(ask("https://evil.example"), ACCOUNT_CORS).headers.get("access-control-allow-origin")).toBeNull();
    expect(withCors(ask(APP_ORIGIN), Response.json({}), ACCOUNT_CORS).headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    // the existing routes are unchanged
    expect(corsHeaders(APP_ORIGIN)["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
  });
});
