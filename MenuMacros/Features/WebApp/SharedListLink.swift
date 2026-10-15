import Foundation

/// A shopping list a friend shared (founder 2026-10-15). The link is https://numbite.com/l#<list> (it opens here through a Universal Link once
/// the app is installed) or numbite://l#<list> (the "I have Numbite" button on that web page). The list itself is the part after "#": the
/// app reads it on the phone and never sends it anywhere (the format is in web/lib/mm/shareList.ts). This turns either link into the packed
/// web app's own page for it; the web page checks the list and says so if it can't be read.
nonisolated enum SharedListLink {
    /// Where the web app reads a shared list (SHARED_APP_PATH in web/lib/mm/shareList.ts).
    static let appPath = "/app/groceries/list/shared"
    /// The longest list code the web app accepts (MAX_PAYLOAD_LENGTH in web/lib/mm/shareList.ts).
    static let maxCodeLength = 6000
    private static let websiteHosts: Set<String> = ["numbite.com", "www.numbite.com"]
    private static let codeCharacters = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")

    /// The address inside the packed web app for a shopping list link, or nil when the link isn't one.
    static func appURL(for link: URL) -> URL? {
        guard let code = code(in: link) else { return nil }
        var parts = URLComponents()
        parts.scheme = WebAppFiles.scheme
        parts.host = WebAppFiles.host
        parts.path = appPath
        parts.percentEncodedFragment = code
        return parts.url
    }

    /// The list code in https://numbite.com/l#<code> or numbite://l#<code>; nil for any other address or a code with other characters in it.
    static func code(in link: URL) -> String? {
        guard let scheme = link.scheme?.lowercased(),
              let parts = URLComponents(url: link, resolvingAgainstBaseURL: false),
              let code = parts.percentEncodedFragment,
              (8...maxCodeLength).contains(code.count),
              code.unicodeScalars.allSatisfy(codeCharacters.contains)
        else { return nil }
        let host = parts.host?.lowercased() ?? ""
        let path = parts.path
        switch scheme {
        case "https":
            guard websiteHosts.contains(host), path == "/l" || path == "/l/" else { return nil }
        case AppConfig.authCallbackScheme:
            // numbite://l#… (host "l") or numbite:///l#… (path "/l"); numbite://auth… is the sign-in callback and not ours to open here
            guard (host == "l" && (path.isEmpty || path == "/")) || (host.isEmpty && path == "/l") else { return nil }
        default:
            return nil
        }
        return code
    }
}

/// Where a link opened from outside (a message, Safari, another app) waits until the web view shows it. A new request has a new id, so the same
/// link opened twice is two requests; the web view ignores one it is already showing (`shouldLoad`).
@Observable
final class LinkInbox {
    nonisolated struct Request: Equatable, Sendable {
        let id: UUID
        /// The page inside the packed web app.
        let url: URL
    }

    private(set) var request: Request?

    /// Takes a link the app was opened with; anything that isn't a shopping list link is ignored.
    func open(_ link: URL) {
        guard let url = SharedListLink.appURL(for: link) else { return }
        request = Request(id: UUID(), url: url)
    }

    /// Whether the web view should now load `request`: it is new (not the one it last handled) and the page isn't already showing that address.
    nonisolated static func shouldLoad(_ request: Request?, lastHandled: UUID?, showing current: URL?) -> Bool {
        guard let request, request.id != lastHandled else { return false }
        return current != request.url
    }
}
