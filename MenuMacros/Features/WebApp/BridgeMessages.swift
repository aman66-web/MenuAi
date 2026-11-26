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
    /// Put the keyboard away: the page's own Done button (web/app/app/_components/SearchDone.tsx) asks, because on an iPhone a web page's `blur()` alone
    /// does not always hide the keyboard (founder 2026-11-17: "When I press done, it doesn't close").
    case hideKeyboard(id: String)
    /// Apple In-App Purchase (Services/PurchaseService.swift): only our products (AppConfig.iapProductIDs) ever reach the App Store.
    case iapProducts(id: String, productIDs: [String])
    case iapPurchase(id: String, productID: String)
    case iapEntitlements(id: String)
    case iapRestore(id: String)
    case iapManage(id: String)
    /// Apple's own "rate this app" pop-up (StoreKit's requestReview); Apple decides whether it actually appears (at most three times a year).
    case requestReview(id: String)
    /// The account's sign-in, kept in the Keychain (Services/SessionStore.swift) so killing the app can't lose it: read it, or keep a new one (nil forgets it).
    case sessionLoad(id: String)
    case sessionSave(id: String, value: String?)
    /// Apple's DeviceCheck token for this iPhone (Services/DeviceCheckService.swift), so our server can tell whether this iPhone already had the free week.
    case deviceCheckToken(id: String)
    /// Steps (Services/StepCounter.swift; web/lib/mm/steps.ts): whether Numbite may read them, the last `days` days (asking iOS's question only when `ask`),
    /// Numbite's page in iPhone Settings, and "stop" (nothing to stop on the iPhone: Core Motion counts anyway).
    case stepsStatus(id: String)
    case steps(id: String, days: Int, ask: Bool)
    case openStepSettings(id: String)
    case stopSteps(id: String)

    /// The longest session text the page may hand over (Supabase's tokens are about 2 KB together).
    static let maxSessionLength = 16_384

    /// The most product ids one `iap.products` request may list (there are two products; anything longer is not a real request).
    static let maxProductIDs = 20

    var id: String {
        switch self {
        case .scan(let id), .locate(let id, _), .share(let id, _), .appleSignIn(let id), .webAuth(let id, _),
             .notificationPermission(let id), .notificationStatus(let id), .syncReminders(let id, _), .openNotificationSettings(let id), .hideKeyboard(let id),
             .iapProducts(let id, _), .iapPurchase(let id, _), .iapEntitlements(let id), .iapRestore(let id), .iapManage(let id), .requestReview(let id),
             .sessionLoad(let id), .sessionSave(let id, _), .deviceCheckToken(let id),
             .stepsStatus(let id), .steps(let id, _, _), .openStepSettings(let id), .stopSteps(let id): id
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
        case "keyboard.hide":
            self = .hideKeyboard(id: id)
        case "iap.products":
            // A list of strings or nothing; ids that aren't ours are dropped (an empty list is a real question with an empty answer).
            guard let ids = payload["ids"] as? [String], ids.count <= Self.maxProductIDs else { return nil }
            self = .iapProducts(id: id, productIDs: IAPProduct.onlyOurs(ids))
        case "iap.purchase":
            // Never a product that isn't ours.
            guard let productID = payload["id"] as? String, AppConfig.iapProductIDs.contains(productID) else { return nil }
            self = .iapPurchase(id: id, productID: productID)
        case "iap.entitlements":
            self = .iapEntitlements(id: id)
        case "iap.restore":
            self = .iapRestore(id: id)
        case "iap.manage":
            self = .iapManage(id: id)
        case "review.request":
            self = .requestReview(id: id)
        case "session.load":
            self = .sessionLoad(id: id)
        case "session.save":
            // a string to keep, or null to forget; anything else (or too long) is ignored
            if payload["value"] is NSNull || payload["value"] == nil {
                self = .sessionSave(id: id, value: nil)
            } else if let value = payload["value"] as? String, !value.isEmpty, value.count <= Self.maxSessionLength {
                self = .sessionSave(id: id, value: value)
            } else {
                return nil
            }
        case "deviceCheck.token":
            self = .deviceCheckToken(id: id)
        case "steps.status":
            self = .stepsStatus(id: id)
        case "steps.get":
            // 1 to 7 days (7 when not said); the question is asked only when `ask` is exactly true
            let days = (payload["days"] as? Int).map(StepDays.clamp) ?? StepDays.maxDays
            self = .steps(id: id, days: days, ask: payload["ask"] as? Bool ?? false)
        case "steps.openSettings":
            self = .openStepSettings(id: id)
        case "steps.stop":
            self = .stopSteps(id: id)
        default:
            return nil
        }
    }

    /// The id of a message that didn't pass as a request, when the id itself is well formed: it still gets an answer ("unavailable"), so the page never waits out
    /// its timeout (120 s for a share) and then falls back to something worse.
    static func answerableID(in body: Any) -> String? {
        guard let message = body as? [String: Any], let id = message["id"] as? String, isValidID(id) else { return nil }
        return id
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
    /// In-App Purchase: the products with Apple's names and prices; Apple's signed transactions (compact JWS) for our server to check; true while a
    /// purchase waits for Ask to Buy or extra authentication.
    var products: [IAPProduct]?
    var transactions: [String]?
    var pending: Bool?
    /// "session.load": the saved session text ("session.load" with nothing saved answers `done` without it).
    var session: String?
    /// "deviceCheck.token": Apple's DeviceCheck token (base64) and the DeviceCheck server it is for ("development" or "production").
    var deviceToken: String?
    var deviceEnv: String?
    /// "steps.get": one entry a day, oldest first. Handed to the page and kept nowhere.
    var steps: [DaySteps]?
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
