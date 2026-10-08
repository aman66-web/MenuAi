import Foundation

/// Where the preview shell loads the web app from. This is a public web address, not a key.
/// Change it here (and nowhere else), then press Run again.
enum PreviewConfig {
    /// The deployed web app. Use the Vercel *Production* address ending in /app,
    /// e.g. "https://menumacros.vercel.app/app" (see docs/XCODE_PREVIEW_SHELL.md, step 1).
    static let siteAddress = "https://REPLACE-ME.vercel.app/app"

    static var siteURL: URL? {
        guard !siteAddress.contains("REPLACE-ME") else { return nil }
        return URL(string: siteAddress)
    }
}
