import OSLog
import StoreKit
import UIKit

/// The App Store, through StoreKit 2. Needs the In-App Purchase capability and our two subscriptions in App Store Connect (AppConfig.iapProductIDs);
/// Config/Numbite.storekit has them for testing in Xcode and in the unit tests.
final class StoreKitPurchaseService: PurchaseService {
    /// Listens for transactions that don't come back from `purchase(id:)`: renewals, Ask to Buy approvals, refunds, purchases made on another device or
    /// before the app was last closed. Started once, as the app starts (MenuMacrosApp.init), so none is missed.
    private static var updatesListener: Task<Void, Never>?

    static func startListeningForTransactions() {
        guard updatesListener == nil else { return }
        updatesListener = Task.detached(priority: .background) {
            for await update in Transaction.updates {
                await StoreKitPurchaseService.handle(update)
            }
        }
    }

    /// A verified transaction is finished (Apple keeps offering an unfinished one); the page reads what it unlocks from `currentEntitlements`, which it
    /// asks for at launch, whenever the app comes back to the front, and at once when this says something arrived (NativeBridge passes the note on to the page).
    /// An unverified one is never finished or granted.
    nonisolated static func handle(_ update: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = update else {
            if case .unverified(let transaction, let error) = update {
                Logger.purchases.error("A purchase update for \(transaction.productID, privacy: .public) could not be verified: \(error.localizedDescription, privacy: .public)")
            }
            return
        }
        let state = transaction.revocationDate == nil ? "active" : "refunded or revoked"
        Logger.purchases.info("Purchase update for \(transaction.productID, privacy: .public): \(state, privacy: .public)")
        await transaction.finish()
        await MainActor.run { NotificationCenter.default.post(name: .numbitePurchasesChanged, object: nil) }
    }

    func products(ids: [String]) async -> [IAPProduct]? {
        let wanted = IAPProduct.onlyOurs(ids)
        guard !wanted.isEmpty else { return [] }
        do {
            let found = try await Product.products(for: wanted)
            var described: [IAPProduct] = []
            for id in wanted {
                if let product = found.first(where: { $0.id == id }) { described.append(await Self.describe(product)) }
            }
            return described
        } catch {
            Logger.purchases.error("Loading the products failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    func purchase(id: String) async -> PurchaseOutcome {
        guard AppConfig.iapProductIDs.contains(id) else { return .failed }
        do {
            guard let product = try await Product.products(for: [id]).first else {
                Logger.purchases.error("The App Store doesn't know \(id, privacy: .public)")
                return .failed
            }
            let result: Product.PurchaseResult
            if let scene = Self.currentWindowScene {
                result = try await product.purchase(confirmIn: scene)
            } else {
                result = try await product.purchase()
            }
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    Logger.purchases.error("The purchase of \(id, privacy: .public) came back unverified: not granted")
                    return .failed
                }
                await transaction.finish()
                Logger.purchases.info("Purchased \(id, privacy: .public)")
                return .succeeded(jws: verification.jwsRepresentation)
            case .userCancelled:
                return .cancelled
            case .pending:
                Logger.purchases.info("The purchase of \(id, privacy: .public) is waiting (Ask to Buy or extra authentication)")
                return .pending
            @unknown default:
                return .failed
            }
        } catch StoreKitError.userCancelled {
            return .cancelled
        } catch {
            Logger.purchases.error("The purchase of \(id, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            return .failed
        }
    }

    func entitlements() async -> [String] {
        var signed: [String] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.revocationDate == nil,
                  AppConfig.iapProductIDs.contains(transaction.productID) else { continue }
            signed.append(result.jwsRepresentation)
        }
        return signed
    }

    func restore() async -> RestoreOutcome {
        do {
            try await AppStore.sync()
        } catch StoreKitError.userCancelled {
            return .cancelled
        } catch {
            Logger.purchases.error("Restoring purchases failed: \(error.localizedDescription, privacy: .public)")
            return .failed
        }
        return .transactions(await entitlements())
    }

    func manageSubscriptions() async {
        if let scene = Self.currentWindowScene {
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                return
            } catch {
                Logger.purchases.error("Apple's manage-subscriptions sheet failed, opening the App Store page: \(error.localizedDescription, privacy: .public)")
            }
        }
        _ = await UIApplication.shared.open(AppConfig.manageSubscriptionsURL)
    }

    private static func describe(_ product: Product) async -> IAPProduct {
        IAPProduct(id: product.id, name: product.displayName, price: product.displayPrice, period: period(of: product), trialDays: await freeTrialDays(of: product))
    }

    /// The free trial's length in days, when the product has one (an introductory offer that is free) and this Apple ID can still have it: Apple gives one
    /// introductory offer per subscription group per Apple ID, whatever account the person uses inside the app.
    private static func freeTrialDays(of product: Product) async -> Int? {
        guard let subscription = product.subscription, let offer = subscription.introductoryOffer, offer.paymentMode == .freeTrial,
              await subscription.isEligibleForIntroOffer else { return nil }
        let days: Int
        switch offer.period.unit {
        case .day: days = offer.period.value
        case .week: days = offer.period.value * 7
        case .month: days = offer.period.value * 30
        case .year: days = offer.period.value * 365
        @unknown default: return nil
        }
        return days * max(1, offer.periodCount)
    }

    /// "year" or "month" for a subscription that renews every 1 year or 1 month; anything else is "none" (none is sold: Annual and Monthly are the only products).
    private static func period(of product: Product) -> IAPProduct.Period {
        guard product.type == .autoRenewable, let period = product.subscription?.subscriptionPeriod, period.value == 1 else { return .noRenewal }
        switch period.unit {
        case .month: return .month
        case .year: return .year
        default: return .noRenewal
        }
    }

    /// The scene to show Apple's sheets in: the one in front, or any.
    private static var currentWindowScene: UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }
}

extension Notification.Name {
    /// Posted on the main actor when StoreKit reports a verified purchase update while the app runs (a renewal, an Ask to Buy approval, a refund, a purchase
    /// made on another device).
    nonisolated static let numbitePurchasesChanged = Notification.Name("NumbitePurchasesChanged")
}
