import Foundation
import WebKit

/// Serves the packed web app to the web view on app://menumath/… (WebAppFiles), so the app opens and works with no connection.
/// Only newer menus, the taken-down logos list and the messages people choose to send go to the live website.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let files: WebAppFiles?

    init(files: WebAppFiles?) {
        self.files = files
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let found = files?.file(for: url)
        guard let target = found ?? files?.notFoundPage,
              let data = try? Data(contentsOf: target, options: .mappedIfSafe),
              let response = HTTPURLResponse(
                url: url,
                statusCode: found == nil ? 404 : 200,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Content-Type": WebAppFiles.mimeType(for: target),
                    "Content-Length": String(data.count),
                    "Cache-Control": "no-cache",
                ]
              ) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        // Every answer is sent in one go above, so there is nothing to cancel.
    }
}
