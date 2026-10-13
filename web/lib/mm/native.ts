// The bridge to the iPhone app around the web app (docs/APP_BUILD.md). Inside the app, a few things are done by the iPhone itself instead of
// the browser: scanning a barcode (the iPhone's own scanner), finding the person's location (one system prompt, the location stays on the
// phone), and the share sheet. On the website there is no bridge and every caller keeps its browser path.
//
// Protocol: the page posts { id, action, payload } to window.webkit.messageHandlers.menumath; the app answers by calling
// window.__menumathReply(id, result) with a plain JSON object. A call the app doesn't answer within its timeout resolves { error: "timeout" }.

export type NativeAction = "scan" | "locate" | "share" | "appleSignIn" | "webAuth";

export interface NativeResult {
  /** "scan": the barcode digits. */
  code?: string;
  /** "locate": the position (never stored or sent anywhere by us). */
  lat?: number;
  lng?: number;
  /** "share": the share sheet was shown and closed. */
  done?: boolean;
  /** "appleSignIn": Apple's identity token from the iPhone's own Apple sheet, and the raw nonce the app gave Apple. */
  idToken?: string;
  nonce?: string;
  /** "webAuth": the one-time code from numbite://auth?code=... after Google sign-in in the secure browser sheet, and the PKCE verifier the app made for it. */
  authCode?: string;
  verifier?: string;
  /** "denied" (the person said no in Settings), "unavailable" (this iPhone can't), "cancelled", "timeout". */
  error?: "denied" | "unavailable" | "cancelled" | "timeout";
}

interface Handler {
  postMessage(message: unknown): void;
}

type ReplyFn = (id: string, result: unknown) => void;

function handler(): Handler | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkit?: { messageHandlers?: { menumath?: Handler } } };
  return w.webkit?.messageHandlers?.menumath ?? null;
}

/** True inside the iPhone app (the app installs the bridge before the page loads). */
export function hasNative(): boolean {
  return handler() !== null;
}

const waiting = new Map<string, (result: NativeResult) => void>();
let counter = 0;

/** Only plain, expected fields get through: the reply comes from our own app, but nothing else is trusted. */
export function cleanNativeResult(raw: unknown): NativeResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: NativeResult = {};
  if (typeof r.code === "string" && /^\d{6,14}$/.test(r.code)) out.code = r.code;
  if (typeof r.lat === "number" && typeof r.lng === "number" && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180) {
    out.lat = r.lat;
    out.lng = r.lng;
  }
  if (r.done === true) out.done = true;
  if (typeof r.idToken === "string" && r.idToken.length <= 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(r.idToken)) out.idToken = r.idToken;
  if (typeof r.nonce === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(r.nonce)) out.nonce = r.nonce;
  if (typeof r.authCode === "string" && r.authCode.length <= 8192 && /^[A-Za-z0-9_-]{40,}$/.test(r.authCode)) out.authCode = r.authCode;
  if (typeof r.verifier === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(r.verifier)) out.verifier = r.verifier;
  if (r.error === "denied" || r.error === "unavailable" || r.error === "cancelled" || r.error === "timeout") out.error = r.error;
  if (!out.code && out.lat === undefined && !out.done && !out.idToken && !out.authCode && !out.error) out.error = "unavailable";
  return out;
}

function installReply() {
  const w = window as unknown as { __menumathReply?: ReplyFn };
  if (w.__menumathReply) return;
  w.__menumathReply = (id, result) => {
    const resolve = waiting.get(id);
    if (!resolve) return;
    waiting.delete(id);
    resolve(cleanNativeResult(result));
  };
}

/** Ask the app to do something. Resolves with the app's answer (never rejects). */
export function nativeCall(action: NativeAction, payload: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<NativeResult> {
  const h = handler();
  if (!h) return Promise.resolve({ error: "unavailable" });
  installReply();
  const id = `${Date.now().toString(36)}-${(counter++).toString(36)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (waiting.delete(id)) resolve({ error: "timeout" });
    }, timeoutMs);
    waiting.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    try {
      h.postMessage({ id, action, payload });
    } catch {
      waiting.delete(id);
      clearTimeout(timer);
      resolve({ error: "unavailable" });
    }
  });
}
