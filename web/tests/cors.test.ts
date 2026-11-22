import { describe, expect, it } from "vitest";
import { ACCOUNT_CORS, ANDROID_APP_ORIGIN, APP_ORIGIN, APP_ORIGINS, corsHeaders, fromUs, isAppOrigin, preflight, storeOfApp, withCors } from "../lib/cors";

// Only the iPhone app's and the Android app's own origins may call our API cross-origin (docs/APP_BUILD.md, docs/ANDROID_BRIDGE.md).
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
  it("the Android app's origin (WebViewAssetLoader's) is allowed next to the iPhone app's, as an exact match, and its own origin is what is echoed back", () => {
    expect(ANDROID_APP_ORIGIN).toBe("https://appassets.androidplatform.net");
    expect([...APP_ORIGINS]).toEqual(["app://menumath", "https://appassets.androidplatform.net"]);
    expect(corsHeaders(ANDROID_APP_ORIGIN)["Access-Control-Allow-Origin"]).toBe("https://appassets.androidplatform.net");
    expect(corsHeaders(ANDROID_APP_ORIGIN, ACCOUNT_CORS)["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
    expect(corsHeaders(ANDROID_APP_ORIGIN).Vary).toBe("Origin");
    for (const other of ["https://appassets.androidplatform.net/", "https://appassets.androidplatform.net:443", "http://appassets.androidplatform.net", "https://x.appassets.androidplatform.net", "https://appassets.androidplatform.net.evil.example", "https://androidplatform.net", "*", "", "null"]) {
      expect(corsHeaders(other)["Access-Control-Allow-Origin"], other).toBeUndefined();
      expect(isAppOrigin(other), other).toBe(false);
    }
    expect(isAppOrigin(null)).toBe(false);
    expect(isAppOrigin(APP_ORIGIN) && isAppOrigin(ANDROID_APP_ORIGIN)).toBe(true);
  });
  it("both apps may post to our own routes (fromUs), and are told which store they sell through when they try another way to pay", () => {
    const ask = (origin: string) => new Request("https://numbite.com/api/v1/support", { method: "POST", headers: { Origin: origin } });
    expect(fromUs(ask(APP_ORIGIN))).toBe(true);
    expect(fromUs(ask(ANDROID_APP_ORIGIN))).toBe(true);
    expect(fromUs(ask("https://evil.example"))).toBe(false);
    expect(storeOfApp(APP_ORIGIN)).toBe("the App Store");
    expect(storeOfApp(ANDROID_APP_ORIGIN)).toBe("Google Play");
  });
});
