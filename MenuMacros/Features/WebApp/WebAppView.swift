import SwiftUI
import UIKit
import WebKit

/// The whole app: the web app packed inside it (WebAppFiles), shown in a web view that loads its pages from the app itself, so it works
/// with no connection. The iPhone does the barcode scanning, location, share sheet and reminder notifications (NativeBridge). Links to other websites open in
/// Safari, mail links in Mail.
struct WebAppView: UIViewRepresentable {
    let files: WebAppFiles?
    let environment: AppEnvironment
    /// A link the app was opened with (a shared shopping list): shown instead of the start page, or as soon as it arrives.
    var link: LinkInbox.Request?

    func makeCoordinator() -> Coordinator {
        Coordinator(bridge: NativeBridge(scanner: environment.scanner, location: environment.location, sharer: environment.sharer, appleSignIn: environment.appleSignIn, webSignIn: environment.webSignIn, notifications: environment.notifications, purchases: environment.purchases, session: environment.session, deviceCheck: environment.deviceCheck))
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default() // saved settings, orders and lists stay on the phone between launches and updates
        configuration.setURLSchemeHandler(BundleSchemeHandler(files: files), forURLScheme: WebAppFiles.scheme)
        configuration.userContentController.add(context.coordinator.bridge, name: NativeBridge.handlerName)
        configuration.allowsInlineMediaPlayback = true
        configuration.dataDetectorTypes = []
        // No long-press menu on links and pictures (it showed app://menumath addresses, Share and "Save to Photos", which also let anyone save a chain's photo
        // that CLAUDE.md rule 2 only lets us display). Added here, in the app only, so the website keeps the browser's own behaviour.
        configuration.userContentController.addUserScript(WKUserScript(source: Self.noCalloutScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        // The web app handles the notch and home bar itself (viewport-fit=cover + env(safe-area-inset-*)).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        // The app's page grey (globals.css --background in the app, #f4f5f6; colour meeting, 19 November 2026), so an overscroll or the moment before the
        // first page draws shows the page colour, not white. Light appearance only.
        let page = UIColor(red: 0xF4 / 255, green: 0xF5 / 255, blue: 0xF6 / 255, alpha: 1)
        webView.backgroundColor = page
        webView.scrollView.backgroundColor = page
        #if DEBUG
        webView.isInspectable = true // Safari › Develop on a Mac
        #endif
        context.coordinator.bridge.webView = webView
        context.coordinator.lastLinkID = link?.id
        webView.load(URLRequest(url: link?.url ?? WebAppFiles.startURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard let link, link.id != context.coordinator.lastLinkID else { return }
        // Handled from now on, whether or not it needs loading: a link the page is already showing must not load later, after the person has moved on.
        context.coordinator.lastLinkID = link.id
        if LinkInbox.shouldLoad(link, lastHandled: nil, showing: webView.url) {
            webView.load(URLRequest(url: link.url))
        }
    }

    static let noCalloutScript = "(function(){var s=document.createElement('style');s.textContent='a, img { -webkit-touch-callout: none; }';(document.head||document.documentElement).appendChild(s);})();"

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
            if target.scheme == "blob" || target.scheme == "data" {
                // A download link (the share card's last fallback, web/app/app/_lib/share-card.ts) would replace the whole app with the file and leave no way
                // back: refused. A file the page shows inside itself is fine.
                if navigationAction.shouldPerformDownload && navigationAction.targetFrame?.isMainFrame != false { return .cancel }
                return .allow
            }
            if target.scheme == WebAppFiles.scheme || target.scheme == "about" {
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

        /// The camera for the page's own photo screens (Scan your food, Make it at home, a report's photo): granted to the app's own pages only, so WebKit doesn't
        /// add its own "Allow Numbite to use your camera?" on every launch. iOS's own camera prompt (with the purpose text) still appears once, and a refusal
        /// there still reaches the page, which falls back to choosing a photo. Everything else (the microphone, any other page or frame) is refused.
        func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin, initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
            let ours = frame.isMainFrame && origin.`protocol` == WebAppFiles.scheme && origin.host == WebAppFiles.host
            return ours && type == .camera ? .grant : .deny
        }

        /// If iOS ends the page's process (memory pressure), start it again where it was, or at the start page when there is nowhere to go back to.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            if webView.url == nil {
                webView.load(URLRequest(url: WebAppFiles.startURL))
            } else {
                webView.reload()
            }
        }
    }
}

#Preview {
    // Shows the packed web app when scripts/build_app_web.sh has been run; blank otherwise.
    WebAppView(files: WebAppFiles(), environment: AppEnvironment.preview())
        .ignoresSafeArea()
}
