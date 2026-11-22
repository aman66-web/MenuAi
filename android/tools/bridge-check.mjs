// Drives the Android app's real bridge from the computer, over Chrome DevTools (a debug build only: a release build can't be inspected).
//   adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.amanmarwaha.numbite)
//   node android/tools/bridge-check.mjs            (docs/ANDROID_BUILD.md "Testing on an emulator")
// It calls the page's own `window.webkit.messageHandlers.menumath` exactly as web/lib/mm/native.ts does, and prints what the app answers. Nothing here ships.
import { connect } from "./cdp.mjs";

const c = await connect();
await c.eval(`window.__replies = window.__replies || {}; window.__menumathReply = (id, r) => { window.__replies[id] = r; }; true`);
let n = 0;
const call = async (action, payload = {}, timeoutMs = 8000) => {
  const id = "chk" + Date.now().toString(36) + "-" + n++;
  await c.eval(`window.webkit.messageHandlers.menumath.postMessage({id:${JSON.stringify(id)},action:${JSON.stringify(action)},payload:${JSON.stringify(payload)}}); true`);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await c.eval(`window.__replies[${JSON.stringify(id)}] ?? null`);
    if (r) return r;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { timeout: true };
};
const show = (name, r) => console.log(name.padEnd(30), JSON.stringify(r).slice(0, 180));

show("platform / handlers", await c.eval(`[window.__numbitePlatform, Object.keys(window.webkit.messageHandlers)]`));
show("safe area variables", await c.eval(`["top","right","bottom","left"].map((s) => getComputedStyle(document.documentElement).getPropertyValue("--sai-" + s))`));
show("unknown action", await call("format.disk"));
show("appleSignIn (web path instead)", await call("appleSignIn"));
show("deviceCheck.token", await call("deviceCheck.token"));
show("keyboard.hide", await call("keyboard.hide"));
const value = JSON.stringify({ accessToken: "a.b.c", user: { email: "x@y.z" } });
show("session.save", await call("session.save", { value }));
show("session.load", await call("session.load"));
show("session.save null", await call("session.save", { value: null }));
show("session.load (forgotten)", await call("session.load"));
show("iap.products", await call("iap.products", { ids: ["com.amanmarwaha.numbite.premium:annual", "com.amanmarwaha.numbite.premium:monthly"] }, 20000));
show("iap.entitlements", await call("iap.entitlements", {}, 20000));
show("iap.purchase (not ours)", await call("iap.purchase", { id: "other" }));
show("notifications.status", await call("notifications.status"));
show("locate (quiet)", await call("locate", { onlyIfAllowed: true }));
show("review.request", await call("review.request", {}, 15000));
show("scan", await call("scan", {}, 20000));
c.close();
