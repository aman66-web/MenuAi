import Foundation

/// What the page asks the iPhone to do (web/lib/mm/native.ts): `{ id, action, payload }` posted to the "menumath" message handler.
/// Anything that isn't exactly one of these is ignored.
nonisolated enum BridgeRequest: Equatable, Sendable {
    case scan(id: String)
    case locate(id: String, onlyIfAllowed: Bool)
    case share(id: String, content: ShareContent)
    case appleSignIn(id: String)
    case webAuth(id: String, provider: String)
    /// Reminders (web/lib/mm/native.ts `native`): ask for permission to show notifications, read it, hand over the whole plan, open iPhone Settings.
    case notificationPermission(id: String)
    case notificationStatus(id: String)
    case syncReminders(id: String, plan: ReminderPlanItem.Parsed)
    case openNotificationSettings(id: String)

    var id: String {
        switch self {
        case .scan(let id), .locate(let id, _), .share(let id, _), .appleSignIn(let id), .webAuth(let id, _),
             .notificationPermission(let id), .notificationStatus(let id), .syncReminders(let id, _), .openNotificationSettings(let id): id
        }
    }

    init?(body: Any) {
        guard let message = body as? [String: Any],
              let id = message["id"] as? String, Self.isValidID(id),
              let action = message["action"] as? String else { return nil }
        let payload = message["payload"] as? [String: Any] ?? [:]
        switch action {
        case "scan":
            self = .scan(id: id)
        case "locate":
            self = .locate(id: id, onlyIfAllowed: payload["onlyIfAllowed"] as? Bool ?? false)
        case "share":
            guard let content = ShareContent(payload: payload) else { return nil }
            self = .share(id: id, content: content)
        case "appleSignIn":
            self = .appleSignIn(id: id)
        case "webAuth":
            guard let provider = payload["provider"] as? String, provider == "google" || provider == "apple" else { return nil }
            self = .webAuth(id: id, provider: provider)
        case "notifications.requestPermission":
            self = .notificationPermission(id: id)
        case "notifications.status":
            self = .notificationStatus(id: id)
        case "notifications.syncReminders":
            // Not a list at all: ignored, so a garbled message can never cancel the reminders. An empty list is a real plan (no reminders).
            guard let plan = ReminderPlanItem.parsePlan(payload["items"]) else { return nil }
            self = .syncReminders(id: id, plan: plan)
        case "notifications.openSettings":
            self = .openNotificationSettings(id: id)
        default:
            return nil
        }
    }

    private static func isValidID(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 64 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
    }
}

/// The text (and, for an order, the picture) to put in the share sheet.
nonisolated struct ShareContent: Equatable, Sendable {
    var title: String?
    var text: String
    /// PNG bytes of the share card, if the page sent one.
    var image: Data?

    static let maxTextLength = 20_000
    static let maxImageBytes = 4_000_000

    init(title: String? = nil, text: String, image: Data? = nil) {
        self.title = title
        self.text = text
        self.image = image
    }

    init?(payload: [String: Any]) {
        guard let text = payload["text"] as? String, !text.isEmpty, text.count <= Self.maxTextLength else { return nil }
        self.text = text
        title = (payload["title"] as? String).map { String($0.prefix(200)) }
        if let dataURL = payload["imageDataUrl"] as? String {
            let prefix = "data:image/png;base64,"
            guard dataURL.hasPrefix(prefix),
                  let bytes = Data(base64Encoded: String(dataURL.dropFirst(prefix.count))),
                  bytes.count <= Self.maxImageBytes else { return nil }
            image = bytes
        } else {
            image = nil
        }
    }
}

/// The answer, as plain JSON for window.__menumathReply(id, result). Only the fields the page reads (cleanNativeResult).
nonisolated struct BridgeReply: Codable, Equatable, Sendable {
    var code: String?
    var lat: Double?
    var lng: Double?
    var done: Bool?
    /// Sign in with Apple: the identity token and the raw nonce. Secure browser sheet: the one-time code and the verifier.
    var idToken: String?
    var nonce: String?
    /// Sign in with Apple's one-time authorization code.
    var appleCode: String?
    var authCode: String?
    var verifier: String?
    /// Notifications: "granted", "denied" or "notDetermined" (NotificationPermission.rawValue).
    var permission: String?
    var error: String?

    static func failure(_ reason: String) -> BridgeReply { BridgeReply(error: reason) }

    /// The JavaScript that hands the answer to the page.
    func script(for id: String) -> String? {
        let encoder = JSONEncoder()
        guard let reply = try? encoder.encode(self), let replyJSON = String(data: reply, encoding: .utf8),
              let idData = try? encoder.encode(id), let idJSON = String(data: idData, encoding: .utf8) else { return nil }
        return "window.__menumathReply && window.__menumathReply(\(idJSON), \(replyJSON));"
    }
}
