import SwiftUI
import UIKit
import WebKit

/// The whole app: the web app packed inside it (WebAppFiles), shown in a web view that loads its pages from the app itself, so it works
/// with no connection. The iPhone does the barcode scanning, location and share sheet (NativeBridge). Links to other websites open in
/// Safari, mail links in Mail.
struct WebAppView: UIViewRepresentable {
    let files: WebAppFiles?
    let environment: AppEnvironment
    /// A link the app was opened with (a shared shopping list): shown instead of the start page, or as soon as it arrives.
    var link: LinkInbox.Request?

    func makeCoordinator() -> Coordinator {
        Coordinator(bridge: NativeBridge(scanner: environment.scanner, location: environment.location, sharer: environment.sharer, appleSignIn: environment.appleSignIn, webSignIn: environment.webSignIn))
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default() // saved settings, orders and lists stay on the phone between launches and updates
        configuration.setURLSchemeHandler(BundleSchemeHandler(files: files), forURLScheme: WebAppFiles.scheme)
        configuration.userContentController.add(context.coordinator.bridge, name: NativeBridge.handlerName)
        configuration.allowsInlineMediaPlayback = true
        configuration.dataDetectorTypes = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        // The web app handles the notch and home bar itself (viewport-fit=cover + env(safe-area-inset-*)).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        #if DEBUG
        webView.isInspectable = true // Safari › Develop on a Mac
        #endif
        context.coordinator.bridge.webView = webView
        context.coordinator.lastLinkID = link?.id
        webView.load(URLRequest(url: link?.url ?? WebAppFiles.startURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard LinkInbox.shouldLoad(link, lastHandled: context.coordinator.lastLinkID, showing: webView.url), let link else { return }
        context.coordinator.lastLinkID = link.id
        webView.load(URLRequest(url: link.url))
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.handlerName)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let bridge: NativeBridge
        /// The last link request this web view dealt with, so one is never loaded twice.
        var lastLinkID: UUID?

        init(bridge: NativeBridge) {
            self.bridge = bridge
        }

        /// Our own pages stay in the app; other websites open in Safari; mail, phone and maps links go to their apps.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let target = navigationAction.request.url else { return .cancel }
            if target.scheme == WebAppFiles.scheme || target.scheme == "about" || target.scheme == "blob" || target.scheme == "data" {
                return .allow
            }
            // A frame inside a page (not the page itself) may load its own content; whole-page moves away from the app open outside it.
            if navigationAction.targetFrame?.isMainFrame == false, target.scheme == "https" { return .allow }
            _ = await UIApplication.shared.open(target)
            return .cancel
        }

        /// target="_blank" links and window.open
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let target = navigationAction.request.url else { return nil }
            if target.scheme == WebAppFiles.scheme {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(target)
            }
            return nil
        }

        /// If iOS ends the page's process (memory pressure), start it again where it was.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }
    }
}

#Preview {
    // Shows the packed web app when scripts/build_app_web.sh has been run; blank otherwise.
    WebAppView(files: WebAppFiles(), environment: AppEnvironment.preview())
        .ignoresSafeArea()
}
