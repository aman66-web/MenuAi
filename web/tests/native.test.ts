import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanNativeResult, hasNative, nativeCall } from "../lib/mm/native";

// The bridge to the iPhone app (docs/APP_BUILD.md): only expected fields get through, and the website (no bridge) is unaffected.
describe("native bridge", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("keeps only plain, expected answers", () => {
    expect(cleanNativeResult({ code: "5000157024671" })).toEqual({ code: "5000157024671" });
    expect(cleanNativeResult({ code: "50001<script>" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ lat: 51.5, lng: -0.12, extra: "x" })).toEqual({ lat: 51.5, lng: -0.12 });
    expect(cleanNativeResult({ lat: 99, lng: 0 })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ error: "denied" })).toEqual({ error: "denied" });
    expect(cleanNativeResult({ done: true })).toEqual({ done: true });
    expect(cleanNativeResult("nonsense")).toEqual({ error: "unavailable" });
  });

  it("passes on Apple's identity token and the browser sheet's one-time code, and nothing that doesn't look like them", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
    expect(cleanNativeResult({ idToken: jwt, nonce: "abcdefgh12345678" })).toEqual({ idToken: jwt, nonce: "abcdefgh12345678" });
    expect(cleanNativeResult({ idToken: "not a token" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ idToken: `${jwt}<script>` })).toEqual({ error: "unavailable" });
    const code = "A".repeat(120);
    const verifier = "v".repeat(64);
    expect(cleanNativeResult({ authCode: code, verifier })).toEqual({ authCode: code, verifier });
    expect(cleanNativeResult({ authCode: "short" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ authCode: code, verifier: "bad verifier!" })).toEqual({ authCode: code });
    expect(cleanNativeResult({ error: "cancelled" })).toEqual({ error: "cancelled" });
  });

  it("on the website there is no bridge: calls answer unavailable straight away", async () => {
    vi.stubGlobal("window", {});
    expect(hasNative()).toBe(false);
    await expect(nativeCall("scan")).resolves.toEqual({ error: "unavailable" });
  });

  it("inside the app: posts { id, action, payload } and resolves with the app's reply; no reply means timeout", async () => {
    const posted: Array<{ id: string; action: string; payload: unknown }> = [];
    const win: Record<string, unknown> = { webkit: { messageHandlers: { menumath: { postMessage: (m: { id: string; action: string; payload: unknown }) => posted.push(m) } } } };
    vi.stubGlobal("window", win);
    expect(hasNative()).toBe(true);
    const call = nativeCall("locate");
    expect(posted[0]).toMatchObject({ action: "locate", payload: {} });
    (win.__menumathReply as (id: string, r: unknown) => void)(posted[0]!.id, { lat: 53.8, lng: -1.55 });
    await expect(call).resolves.toEqual({ lat: 53.8, lng: -1.55 });
    vi.useFakeTimers();
    const silent = nativeCall("scan", {}, 1000);
    vi.advanceTimersByTime(1001);
    await expect(silent).resolves.toEqual({ error: "timeout" });
  });
});
