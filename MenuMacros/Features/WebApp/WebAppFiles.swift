import Foundation

/// The copy of the web app packed inside the iPhone app (MenuMacros/Resources/WebApp.bundle, made by scripts/build_app_web.sh;
/// docs/APP_BUILD.md), and how an address on the app's own scheme finds one of its files. The lookup is the same as
/// web/e2e/serve-app.mjs, which the browser tests use: the query is ignored, then the exact file, then "<path>.html",
/// then "<path>/index.html"; anything else is the not-found page.
nonisolated struct WebAppFiles: Sendable {
    /// The pages load from app://menumath/…: our API on the live website allows exactly this origin (web/lib/cors.ts).
    static let scheme = "app"
    static let host = "menumath"
    static var startURL: URL { AppConfig.webAppStartURL }

    let root: URL

    init(root: URL) {
        self.root = root
    }

    /// The packed copy in the app, or nil when it wasn't built (run scripts/build_app_web.sh before building in Xcode).
    init?(bundle: Bundle = .main) {
        guard let url = bundle.url(forResource: "WebApp", withExtension: "bundle") else { return nil }
        self.init(root: url)
    }

    var notFoundPage: URL? {
        let page = root.appending(path: "404.html", directoryHint: .notDirectory)
        return Self.isFile(page) ? page : nil
    }

    /// The file for an address on the app's scheme, or nil. Never leaves the packed folder.
    func file(for url: URL) -> URL? {
        guard url.scheme == Self.scheme, url.host() == Self.host else { return nil }
        let path = url.path(percentEncoded: false)
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !parts.contains(where: { $0 == ".." || $0 == "." || $0.contains("\\") }) else { return nil }
        let base = parts.reduce(root) { $0.appending(path: $1, directoryHint: .notDirectory) }
        let candidates: [URL]
        if parts.isEmpty {
            candidates = [root.appending(path: "index.html", directoryHint: .notDirectory)]
        } else if path.hasSuffix("/") {
            candidates = [base.appending(path: "index.html", directoryHint: .notDirectory), base.appendingPathExtension("html")]
        } else {
            candidates = [base, base.appendingPathExtension("html"), base.appending(path: "index.html", directoryHint: .notDirectory)]
        }
        return candidates.first(where: Self.isFile)
    }

    static func isFile(_ url: URL) -> Bool {
        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path(percentEncoded: false), isDirectory: &isDirectory) && !isDirectory.boolValue
    }

    static func mimeType(for file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "html": "text/html; charset=utf-8"
        case "txt": "text/plain; charset=utf-8"
        case "js", "mjs": "text/javascript; charset=utf-8"
        case "css": "text/css; charset=utf-8"
        case "json", "map": "application/json"
        case "webmanifest": "application/manifest+json"
        case "svg": "image/svg+xml"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "webp": "image/webp"
        case "gif": "image/gif"
        case "ico": "image/x-icon"
        case "woff2": "font/woff2"
        case "woff": "font/woff"
        case "ttf": "font/ttf"
        default: "application/octet-stream"
        }
    }
}
