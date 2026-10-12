import Foundation
import WebKit

/// Answers the page's requests (BridgeRequest) with the iPhone's own scanner, location and share sheet, and hands the result back with
/// window.__menumathReply (web/lib/mm/native.ts). Only the app's own pages (the main frame on app://menumath) are listened to.
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "menumath"

    weak var webView: WKWebView?
    private let scanner: any BarcodeScanning
    private let location: any LocationProviding
    private let sharer: any Sharing

    init(scanner: any BarcodeScanning, location: any LocationProviding, sharer: any Sharing) {
        self.scanner = scanner
        self.location = location
        self.sharer = sharer
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.`protocol` == WebAppFiles.scheme,
              message.frameInfo.securityOrigin.host == WebAppFiles.host,
              let request = BridgeRequest(body: message.body) else { return }
        Task {
            let reply = await handle(request)
            // the completion-handler form: the script returns undefined, which the async form treats as an error
            if let script = reply.script(for: request.id) {
                webView?.evaluateJavaScript(script, completionHandler: nil)
            }
        }
    }

    func handle(_ request: BridgeRequest) async -> BridgeReply {
        switch request {
        case .scan:
            switch await scanner.scan() {
            case .code(let digits): return BridgeReply(code: digits)
            case .cancelled: return .failure("cancelled")
            case .denied: return .failure("denied")
            case .unavailable: return .failure("unavailable")
            }
        case .locate(_, let onlyIfAllowed):
            switch await location.currentLocation(onlyIfAllowed: onlyIfAllowed) {
            case .found(let latitude, let longitude): return BridgeReply(lat: latitude, lng: longitude)
            case .denied: return .failure("denied")
            case .unavailable: return .failure("unavailable")
            }
        case .share(_, let content):
            return await sharer.share(content) ? BridgeReply(done: true) : .failure("cancelled")
        }
    }
}
