import Foundation
import OSLog

/// One In-App Purchase product as the page shows it: Apple's own name and price (localised by StoreKit, e.g. "£49.99"), never ours.
nonisolated struct IAPProduct: Codable, Equatable, Sendable {
    /// How often it renews: "month", "year", or "none" for anything that doesn't renew every month or year (none is sold now; the page still reads it).
    nonisolated enum Period: String, Codable, Equatable, Sendable {
        case month
        case year
        case noRenewal = "none"
    }

    var id: String
    var name: String
    var price: String
    var period: Period
    /// The free trial's length in days, only when the product has one and this Apple ID can still have it (Apple gives one per subscription group per Apple ID).
    var trialDays: Int? = nil

    /// Only our products (AppConfig.iapProductIDs), each once, in the order given.
    static func onlyOurs(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        return ids.filter { AppConfig.iapProductIDs.contains($0) && seen.insert($0).inserted }
    }
}

/// What a purchase ended with.
nonisolated enum PurchaseOutcome: Equatable, Sendable {
    /// Apple's signed transaction (the compact JWS), for our server to check. Only ever a verified one.
    case succeeded(jws: String)
    case cancelled
    /// Waiting for someone else (Ask to Buy) or for extra authentication: it arrives later through Transaction.updates and the page's next entitlement check.
    case pending
    /// Product not found, an unverified transaction (never granted), or StoreKit failed.
    case failed
}

/// What "Restore purchases" ended with.
nonisolated enum RestoreOutcome: Equatable, Sendable {
    /// The signed transactions the person is entitled to now (may be empty).
    case transactions([String])
    /// The person closed Apple's sign-in.
    case cancelled
    case failed
}

/// Apple In-App Purchase (StoreKit 2) for the paid features: the page asks through the bridge (BridgeRequest `iap.*`), this talks to the App Store.
/// It only hands back what Apple signed: deciding what that unlocks is the page's and our server's job.
@MainActor
protocol PurchaseService: Sendable {
    /// The products with these ids that the App Store knows, in the order asked (ids it doesn't know are left out). Nil when the App Store can't be reached.
    func products(ids: [String]) async -> [IAPProduct]?
    /// Shows Apple's purchase sheet for this product.
    func purchase(id: String) async -> PurchaseOutcome
    /// The signed transactions for what the person owns now (verified, not refunded, only our products). Never shows anything.
    func entitlements() async -> [String]
    /// Asks the App Store for the person's purchases again (may show Apple's sign-in), then answers like `entitlements()`.
    func restore() async -> RestoreOutcome
    /// Shows Apple's own manage-subscriptions sheet (or the App Store's subscriptions page).
    func manageSubscriptions() async
}

extension Logger {
    /// Product ids and outcomes only: never a transaction id, an Apple account or a price paid.
    nonisolated static let purchases = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Numbite", category: "purchases")
}
