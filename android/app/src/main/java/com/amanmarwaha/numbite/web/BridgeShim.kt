package com.amanmarwaha.numbite.web

/**
 * The script injected before any page script runs (docs/ANDROID_BRIDGE.md): the page then finds the same bridge as in the iPhone app, so `hasNative()` is true and
 * every `nativeCall` of web/lib/mm/native.ts works unchanged. `window.webkit.messageHandlers.menumath.postMessage(m)` hands `JSON.stringify(m)` to the app's
 * `NumbiteBridge` object, which Android puts only into frames of the app's own origin ([BridgeHost]).
 */
object BridgeShim {
    val SCRIPT = """
        (function () {
          if (window.__numbitePlatform) return;
          var send = function (text) {
            var bridge = window.NumbiteBridge;
            if (!bridge) throw new Error("The app is not ready");
            if (typeof bridge.postMessage === "function") bridge.postMessage(text);
            else bridge.post(text);
          };
          var handler = Object.freeze({
            postMessage: function (message) {
              var text = JSON.stringify(message);
              if (typeof text === "string") send(text);
            }
          });
          Object.defineProperty(window, "__numbitePlatform", { value: "android" });
          Object.defineProperty(window, "webkit", { value: Object.freeze({ messageHandlers: Object.freeze({ menumath: handler }) }) });
        })();
    """.trimIndent()
}
