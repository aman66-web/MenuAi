import Foundation

/// For previews and tests: a pretend App Store with the three products and their launch prices. Remembers what it was asked.
final class FakePurchaseService: PurchaseService {
    nonisolated static let sampleCatalogue = [
        IAPProduct(id: AppConfig.iapAnnualProductID, name: "Annual", price: "£14.99", period: .year),
        IAPProduct(id: AppConfig.iapMonthlyProductID, name: "Monthly", price: "£2.99", period: .month),
        IAPProduct(id: AppConfig.iapPass90ProductID, name: "Founding Member 90-Day Pass", price: "£9.99", period: .noRenewal),
    ]
    /// A made-up compact JWS (three dot-separated parts), never a real Apple signature.
    nonisolated static let sampleJWS = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJmYWtlIn0.ZmFrZS1zaWduYXR1cmU"

    var catalogue: [IAPProduct]
    /// False: the App Store can't be reached (products answer nil).
    var reachable: Bool
    var purchaseOutcome: PurchaseOutcome
    /// The signed transactions the person owns; a successful purchase adds to it.
    var owned: [String]
    /// What "Restore purchases" ends with; nil answers with what is owned.
    var restoreOutcome: RestoreOutcome?
    private(set) var purchasesAsked: [String] = []
    private(set) var restores = 0
    private(set) var manageShown = 0

    init(
        catalogue: [IAPProduct] = FakePurchaseService.sampleCatalogue,
        reachable: Bool = true,
        purchaseOutcome: PurchaseOutcome = .succeeded(jws: FakePurchaseService.sampleJWS),
        owned: [String] = [],
        restoreOutcome: RestoreOutcome? = nil
    ) {
        self.catalogue = catalogue
        self.reachable = reachable
        self.purchaseOutcome = purchaseOutcome
        self.owned = owned
        self.restoreOutcome = restoreOutcome
    }

    func products(ids: [String]) async -> [IAPProduct]? {
        guard reachable else { return nil }
        return IAPProduct.onlyOurs(ids).compactMap { id in catalogue.first { $0.id == id } }
    }

    func purchase(id: String) async -> PurchaseOutcome {
        purchasesAsked.append(id)
        if case .succeeded(let jws) = purchaseOutcome { owned.append(jws) }
        return purchaseOutcome
    }

    func entitlements() async -> [String] { owned }

    func restore() async -> RestoreOutcome {
        restores += 1
        return restoreOutcome ?? .transactions(owned)
    }

    func manageSubscriptions() async { manageShown += 1 }
}
