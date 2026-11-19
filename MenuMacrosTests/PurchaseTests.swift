import Foundation
import StoreKit
import StoreKitTest
import Testing
@testable import MenuMacros

/// Apple In-App Purchase through the bridge (the page side is web/lib/payments; actions `iap.products`, `iap.purchase`, `iap.entitlements`,
/// `iap.restore`, `iap.manage`). The page's messages are never trusted: only our three products ever reach the App Store.
struct PurchaseBridgeParsingTests {
    private let annual = AppConfig.iapAnnualProductID
    private let monthly = AppConfig.iapMonthlyProductID
    private let pass90 = AppConfig.iapPass90ProductID

    private func request(_ action: String, _ payload: Any? = [String: Any](), id: String = "iap-1") -> BridgeRequest? {
        var body: [String: Any] = ["id": id, "action": action]
        if let payload { body["payload"] = payload }
        return BridgeRequest(body: body)
    }

    @Test func theThreeProductIDs() {
        #expect(AppConfig.iapProductIDs == ["com.amanmarwaha.numbite.pro.annual", "com.amanmarwaha.numbite.pro.monthly", "com.amanmarwaha.numbite.pro.pass90"])
    }

    @Test func productsAreAskedForInOrderWithOthersDropped() {
        #expect(request("iap.products", ["ids": [annual, monthly, pass90]]) == .iapProducts(id: "iap-1", productIDs: [annual, monthly, pass90]))
        // not ours (even a longer id that starts like ours) and repeats are dropped; the order asked is kept
        let mixed: [String: Any] = ["ids": [pass90, "com.evil.free", annual + ".free", annual, pass90]]
        #expect(request("iap.products", mixed) == .iapProducts(id: "iap-1", productIDs: [pass90, annual]))
        // an empty list is a real question (the answer is an empty list)
        #expect(request("iap.products", ["ids": [String]()]) == .iapProducts(id: "iap-1", productIDs: []))
        #expect(request("iap.products", ["ids": ["com.evil.free"]]) == .iapProducts(id: "iap-1", productIDs: []))
    }

    @Test func aMalformedProductsRequestIsIgnored() {
        #expect(request("iap.products") == nil) // no payload
        #expect(request("iap.products", [String: Any]()) == nil) // no ids
        #expect(request("iap.products", ["ids": annual]) == nil) // not a list
        #expect(request("iap.products", ["ids": [1, 2] as [Any]]) == nil)
        #expect(request("iap.products", ["ids": [annual, 5] as [Any]]) == nil)
        #expect(request("iap.products", ["ids": [annual, NSNull()] as [Any]]) == nil)
        #expect(request("iap.products", ["ids": NSNull()]) == nil)
        #expect(request("iap.products", "ids") == nil) // a payload that isn't an object
        #expect(request("iap.products", ["ids": Array(repeating: annual, count: BridgeRequest.maxProductIDs + 1)]) == nil)
        #expect(request("iap.products", ["ids": Array(repeating: annual, count: BridgeRequest.maxProductIDs)]) == .iapProducts(id: "iap-1", productIDs: [annual]))
    }

    @Test func onlyOurProductsCanBeBought() {
        #expect(request("iap.purchase", ["id": annual]) == .iapPurchase(id: "iap-1", productID: annual))
        #expect(request("iap.purchase", ["id": monthly]) == .iapPurchase(id: "iap-1", productID: monthly))
        #expect(request("iap.purchase", ["id": pass90]) == .iapPurchase(id: "iap-1", productID: pass90))
        #expect(request("iap.purchase", ["id": "com.evil.free"]) == nil)
        #expect(request("iap.purchase", ["id": annual + ".free"]) == nil)
        #expect(request("iap.purchase", ["id": " " + annual]) == nil)
        #expect(request("iap.purchase", ["id": annual.uppercased()]) == nil)
        #expect(request("iap.purchase", ["id": ""]) == nil)
        #expect(request("iap.purchase", ["id": 1]) == nil)
        #expect(request("iap.purchase", ["id": [annual]]) == nil)
        #expect(request("iap.purchase", ["ids": [annual]]) == nil)
        #expect(request("iap.purchase", [String: Any]()) == nil)
        #expect(request("iap.purchase") == nil)
    }

    @Test func entitlementsRestoreAndManage() {
        #expect(request("iap.entitlements") == .iapEntitlements(id: "iap-1"))
        #expect(request("iap.restore") == .iapRestore(id: "iap-1"))
        #expect(request("iap.manage") == .iapManage(id: "iap-1"))
        #expect(request("review.request") == .requestReview(id: "iap-1"))
        // no payload at all is the same as an empty one
        #expect(request("iap.entitlements", nil) == .iapEntitlements(id: "iap-1"))
        #expect(request("iap.restore", nil) == .iapRestore(id: "iap-1"))
        #expect(request("iap.manage", nil) == .iapManage(id: "iap-1"))
    }

    @Test func badRequestIDsAndUnknownActionsAreIgnored() {
        #expect(request("iap.entitlements", id: "<script>") == nil)
        #expect(request("iap.purchase", ["id": annual], id: "") == nil)
        #expect(request("iap.products", ["ids": [annual]], id: String(repeating: "a", count: 65)) == nil)
        #expect(request("iap.purchase", ["id": annual], id: "a.b") == nil)
        #expect(request("iap.refund", ["id": annual]) == nil)
        #expect(request("iap.Purchase", ["id": annual]) == nil)
        #expect(request("iap", ["id": annual]) == nil)
    }

    @Test func theRequestKeepsItsID() {
        #expect(request("iap.purchase", ["id": pass90], id: "p-9")?.id == "p-9")
        #expect(request("iap.products", ["ids": [annual]], id: "p-8")?.id == "p-8")
        #expect(request("iap.manage", id: "p-7")?.id == "p-7")
    }
}

/// The answers as the page reads them (window.__menumathReply): only the fields that are set.
struct PurchaseReplyTests {
    /// The reply object inside the script, as the page's JavaScript would see it.
    private func object(_ reply: BridgeReply) throws -> [String: Any] {
        let data = try JSONEncoder().encode(reply)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func productsReply() throws {
        let reply = BridgeReply(products: FakePurchaseService.sampleCatalogue)
        let json = try object(reply)
        #expect(Set(json.keys) == ["products"])
        let products = try #require(json["products"] as? [[String: Any]])
        #expect(products.count == 3)
        // the two renewing plans carry the free week (trialDays, only when this Apple ID can still have it); the 90-day pass has none
        #expect(products.map { Set($0.keys) } == [["id", "name", "price", "period", "trialDays"], ["id", "name", "price", "period", "trialDays"], ["id", "name", "price", "period"]])
        #expect(products.map { $0["trialDays"] as? Int } == [7, 7, nil])
        #expect(products.map { $0["id"] as? String } == AppConfig.iapProductIDs)
        #expect(products.map { $0["name"] as? String } == ["Annual", "Monthly", "Founding Member 90-Day Pass"])
        #expect(products.map { $0["price"] as? String } == ["£14.99", "£2.99", "£9.99"])
        #expect(products.map { $0["period"] as? String } == ["year", "month", "none"])
        #expect(try object(BridgeReply(products: [])).keys.sorted() == ["products"])
    }

    @Test func transactionsAndPendingReplies() throws {
        let jws = "aaa.bbb.ccc"
        #expect(BridgeReply(transactions: [jws]).script(for: "t-1") == #"window.__menumathReply && window.__menumathReply("t-1", {"transactions":["aaa.bbb.ccc"]});"#)
        #expect(BridgeReply(transactions: []).script(for: "t-2") == #"window.__menumathReply && window.__menumathReply("t-2", {"transactions":[]});"#)
        #expect(BridgeReply(pending: true).script(for: "t-3") == #"window.__menumathReply && window.__menumathReply("t-3", {"pending":true});"#)
        #expect(BridgeReply.failure("unavailable").script(for: "t-4") == #"window.__menumathReply && window.__menumathReply("t-4", {"error":"unavailable"});"#)
        #expect(BridgeReply.failure("cancelled").script(for: "t-5") == #"window.__menumathReply && window.__menumathReply("t-5", {"error":"cancelled"});"#)
        #expect(BridgeReply(done: true).script(for: "t-6") == #"window.__menumathReply && window.__menumathReply("t-6", {"done":true});"#)
        // nothing that isn't set is sent
        #expect(Set(try object(BridgeReply(transactions: [jws, jws])).keys) == ["transactions"])
    }

    @Test func aPeriodOfNoneReadsBack() throws {
        let product = IAPProduct(id: AppConfig.iapPass90ProductID, name: "Founding Member 90-Day Pass", price: "£9.99", period: .noRenewal)
        let data = try JSONEncoder().encode(product)
        #expect(String(decoding: data, as: UTF8.self).contains(#""period":"none""#))
        #expect(try JSONDecoder().decode(IAPProduct.self, from: data) == product)
        // no free trial: the key isn't sent at all
        #expect(!String(decoding: data, as: UTF8.self).contains("trialDays"))
    }

    @Test func aFreeTrialIsSentInDays() throws {
        let product = IAPProduct(id: AppConfig.iapAnnualProductID, name: "Annual", price: "£14.99", period: .year, trialDays: 7)
        let data = try JSONEncoder().encode(product)
        #expect(String(decoding: data, as: UTF8.self).contains(#""trialDays":7"#))
        #expect(try JSONDecoder().decode(IAPProduct.self, from: data) == product)
    }
}

/// The bridge hands each purchase outcome back as the page expects it.
@MainActor
struct PurchaseBridgeTests {
    private func bridge(_ purchases: FakePurchaseService) -> NativeBridge {
        NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(),
            appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(), notifications: FakeNotificationScheduler(), purchases: purchases
        )
    }

    private let annual = AppConfig.iapAnnualProductID
    private let pass90 = AppConfig.iapPass90ProductID

    @Test func productsInTheOrderAsked() async {
        let store = FakePurchaseService()
        let reply = await bridge(store).handle(.iapProducts(id: "p", productIDs: [pass90, annual]))
        #expect(reply == BridgeReply(products: [FakePurchaseService.sampleCatalogue[2], FakePurchaseService.sampleCatalogue[0]]))
        // a product the App Store doesn't know is left out
        let partial = FakePurchaseService(catalogue: [FakePurchaseService.sampleCatalogue[0]])
        #expect(await bridge(partial).handle(.iapProducts(id: "p", productIDs: [pass90, annual])) == BridgeReply(products: [FakePurchaseService.sampleCatalogue[0]]))
        #expect(await bridge(store).handle(.iapProducts(id: "p", productIDs: [])) == BridgeReply(products: []))
        #expect(await bridge(FakePurchaseService(reachable: false)).handle(.iapProducts(id: "p", productIDs: [annual])) == .failure("unavailable"))
    }

    @Test func eachPurchaseOutcome() async {
        let bought = FakePurchaseService(purchaseOutcome: .succeeded(jws: "h.p.s"))
        #expect(await bridge(bought).handle(.iapPurchase(id: "b", productID: annual)) == BridgeReply(transactions: ["h.p.s"]))
        #expect(bought.purchasesAsked == [annual])
        #expect(await bridge(FakePurchaseService(purchaseOutcome: .cancelled)).handle(.iapPurchase(id: "b", productID: annual)) == .failure("cancelled"))
        #expect(await bridge(FakePurchaseService(purchaseOutcome: .pending)).handle(.iapPurchase(id: "b", productID: annual)) == BridgeReply(pending: true))
        #expect(await bridge(FakePurchaseService(purchaseOutcome: .failed)).handle(.iapPurchase(id: "b", productID: pass90)) == .failure("unavailable"))
    }

    @Test func entitlementsAreWhatIsOwned() async {
        #expect(await bridge(FakePurchaseService()).handle(.iapEntitlements(id: "e")) == BridgeReply(transactions: []))
        #expect(await bridge(FakePurchaseService(owned: ["a.b.c", "d.e.f"])).handle(.iapEntitlements(id: "e")) == BridgeReply(transactions: ["a.b.c", "d.e.f"]))
        // after a purchase the page's next check sees it
        let store = FakePurchaseService(purchaseOutcome: .succeeded(jws: "h.p.s"))
        let native = bridge(store)
        _ = await native.handle(.iapPurchase(id: "b", productID: annual))
        #expect(await native.handle(.iapEntitlements(id: "e")) == BridgeReply(transactions: ["h.p.s"]))
    }

    @Test func eachRestoreOutcome() async {
        let store = FakePurchaseService(owned: ["a.b.c"])
        #expect(await bridge(store).handle(.iapRestore(id: "r")) == BridgeReply(transactions: ["a.b.c"]))
        #expect(store.restores == 1)
        #expect(await bridge(FakePurchaseService()).handle(.iapRestore(id: "r")) == BridgeReply(transactions: []))
        #expect(await bridge(FakePurchaseService(restoreOutcome: .cancelled)).handle(.iapRestore(id: "r")) == .failure("cancelled"))
        #expect(await bridge(FakePurchaseService(restoreOutcome: .failed)).handle(.iapRestore(id: "r")) == .failure("unavailable"))
    }

    @Test func manageShowsApplesSheet() async {
        let store = FakePurchaseService()
        #expect(await bridge(store).handle(.iapManage(id: "m")) == BridgeReply(done: true))
        #expect(store.manageShown == 1)
    }

    @Test func fromThePagesMessageToTheAnswer() async throws {
        let store = FakePurchaseService(purchaseOutcome: .succeeded(jws: "h.p.s"))
        let request = try #require(BridgeRequest(body: ["id": "x-1", "action": "iap.purchase", "payload": ["id": pass90]] as [String: Any]))
        let reply = await bridge(store).handle(request)
        #expect(reply.script(for: request.id) == #"window.__menumathReply && window.__menumathReply("x-1", {"transactions":["h.p.s"]});"#)
        #expect(store.purchasesAsked == [pass90])
    }
}

/// Config/Numbite.storekit: the three products, as the App Store will have them.
struct StoreKitConfigurationFileTests {
    static var fileURL: URL {
        // MenuMacrosTests/PurchaseTests.swift -> the repository -> Config/Numbite.storekit (Config/ isn't part of the app)
        URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appending(path: "Config/Numbite.storekit")
    }

    @Test func itHoldsExactlyOurThreeProducts() throws {
        let data = try Data(contentsOf: Self.fileURL)
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let groups = try #require(root["subscriptionGroups"] as? [[String: Any]])
        #expect(groups.count == 1)
        #expect(groups.first?["name"] as? String == "Numbite Pro")
        let renewing = try #require(groups.first?["subscriptions"] as? [[String: Any]])
        #expect(renewing.map { $0["productID"] as? String } == [AppConfig.iapAnnualProductID, AppConfig.iapMonthlyProductID])
        #expect(renewing.map { $0["displayPrice"] as? String } == ["14.99", "2.99"])
        #expect(renewing.map { $0["recurringSubscriptionPeriod"] as? String } == ["P1Y", "P1M"])
        // both subscriptions start with a free week (the 90-day pass can't have a trial: it isn't a subscription that renews)
        for sub in renewing {
            let offer = try #require(sub["introductoryOffer"] as? [String: Any])
            #expect(offer["paymentMode"] as? String == "free" && offer["subscriptionPeriod"] as? String == "P1W")
        }
        let nonRenewing = try #require(root["nonRenewingSubscriptions"] as? [[String: Any]])
        #expect(nonRenewing.map { $0["productID"] as? String } == [AppConfig.iapPass90ProductID])
        #expect(nonRenewing.first?["displayPrice"] as? String == "9.99")
        let settings = try #require(root["settings"] as? [String: Any])
        #expect(settings["_storefront"] as? String == "GBR")
        #expect(settings["_locale"] as? String == "en_GB")
    }
}

/// StoreKitPurchaseService against StoreKit's own test App Store (SKTestSession with Config/Numbite.storekit): no dialogs, nothing real is charged.
/// One at a time: the session's transactions are shared by the whole test run.
/// Opt-in (NUMBITE_STOREKIT_TESTS=1, run from Xcode with Product > Test): on the iOS 26.5 simulator `xcodebuild test` never hands the .storekit file to StoreKit's
/// test service (SKInternalErrorDomain Code=3; Apple's known issue FB22237318, developer.apple.com/forums/thread/826971), so from the command line these can't run.
@MainActor
@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["NUMBITE_STOREKIT_TESTS"] == "1", "StoreKit's test service is only reliable from Xcode on iOS 26.5"))
struct StoreKitPurchaseServiceTests {
    private let annual = AppConfig.iapAnnualProductID
    private let pass90 = AppConfig.iapPass90ProductID

    /// StoreKit's test App Store takes a few seconds to start (RevenueCat's own StoreKit tests wait for it too), so this waits until it answers with our products.
    private func makeSession() async throws -> SKTestSession {
        // StoreKit's test service only reads a file inside the app's own folder, so the repo's file is copied there first (one source of truth: Config/Numbite.storekit).
        let local = FileManager.default.temporaryDirectory.appending(path: "Numbite.storekit")
        try? FileManager.default.removeItem(at: local)
        try FileManager.default.copyItem(at: StoreKitConfigurationFileTests.fileURL, to: local)
        let session = try SKTestSession(contentsOf: local)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.askToBuyEnabled = false
        session.storefront = "GBR"
        session.locale = Locale(identifier: "en_GB")
        session.clearTransactions()
        for _ in 0..<60 {
            if let found = try? await Product.products(for: AppConfig.iapProductIDs), found.count == AppConfig.iapProductIDs.count { return session }
            try await Task.sleep(for: .milliseconds(250))
        }
        Issue.record("StoreKit's test App Store never answered with the three products")
        return session
    }

    /// The JSON payload (middle part) of a compact JWS.
    private func payload(of jws: String) throws -> [String: Any] {
        let parts = jws.split(separator: ".", omittingEmptySubsequences: false)
        try #require(parts.count == 3)
        var base64 = parts[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        let data = try #require(Data(base64Encoded: base64))
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func productIDs(in signed: [String]) throws -> [String] {
        try signed.map { try payload(of: $0)["productId"] as? String ?? "" }
    }

    @Test func productsLoadWithApplesNamesAndPrices() async throws {
        let session = try await makeSession()
        defer { session.clearTransactions() }
        let service = StoreKitPurchaseService()
        let products = try #require(await service.products(ids: [pass90, "com.evil.free", annual, AppConfig.iapMonthlyProductID]))
        try #require(products.map(\.id) == [pass90, annual, AppConfig.iapMonthlyProductID])
        #expect(products.map(\.name) == ["Founding Member 90-Day Pass", "Annual", "Monthly"])
        #expect(products.map(\.period) == [.noRenewal, .year, .month])
        let prices = products.map(\.price)
        #expect(prices[0].contains("9.99") && prices[1].contains("14.99") && prices[2].contains("2.99"))
        #expect(prices.allSatisfy { $0.contains("£") })
        #expect(await service.products(ids: []) == [])
    }

    @Test func buyingTheAnnualThenARefund() async throws {
        let session = try await makeSession()
        defer { session.clearTransactions() }
        let service = StoreKitPurchaseService()
        #expect(await service.entitlements().isEmpty)

        let outcome = await service.purchase(id: annual)
        guard case .succeeded(let jws) = outcome else {
            Issue.record("The purchase ended with \(outcome)")
            return
        }
        #expect(jws.split(separator: ".", omittingEmptySubsequences: false).count == 3)
        #expect(try payload(of: jws)["productId"] as? String == annual)
        // For checking our server against a real transaction signed by Xcode's test store: written only when the run asks for it.
        if let out = ProcessInfo.processInfo.environment["NUMBITE_JWS_OUT"] {
            try Data(jws.utf8).write(to: URL(filePath: out))
        }

        let owned = await service.entitlements()
        #expect(try productIDs(in: owned) == [annual])

        // Refund it: it must leave the entitlements (revoked transactions are never handed to the page).
        var transactionID: UInt64?
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == annual { transactionID = transaction.id }
        }
        let identifier = try #require(transactionID)
        try session.refundTransaction(identifier: UInt(identifier))
        var afterRefund = await service.entitlements()
        for _ in 0..<30 where !afterRefund.isEmpty {
            try await Task.sleep(for: .milliseconds(100))
            afterRefund = await service.entitlements()
        }
        #expect(afterRefund.isEmpty)
    }

    @Test func the90DayPassIsAnEntitlement() async throws {
        let session = try await makeSession()
        defer { session.clearTransactions() }
        let service = StoreKitPurchaseService()
        guard case .succeeded(let jws) = await service.purchase(id: pass90) else {
            Issue.record("The 90-day pass could not be bought")
            return
        }
        #expect(try payload(of: jws)["productId"] as? String == pass90)
        #expect(try productIDs(in: await service.entitlements()) == [pass90])
        // restore answers like entitlements (StoreKit's test App Store needs no sign-in)
        let restored = await service.restore()
        guard case .transactions(let signed) = restored else {
            Issue.record("Restore ended with \(restored)")
            return
        }
        #expect(try productIDs(in: signed) == [pass90])
    }

    @Test func aProductThatIsNotOursIsNeverBought() async throws {
        let session = try await makeSession()
        defer { session.clearTransactions() }
        #expect(await StoreKitPurchaseService().purchase(id: "com.evil.free") == .failed)
    }
}
