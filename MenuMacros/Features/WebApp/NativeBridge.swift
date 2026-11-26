import Foundation
import OSLog
import StoreKit
import WebKit

/// Answers the page's requests (BridgeRequest) with the iPhone's own scanner, location, share sheet, sign-in sheets, reminder notifications, step counter
/// (Core Motion) and the App Store's In-App Purchase, and hands
/// the result back with window.__menumathReply (web/lib/mm/native.ts). Only the app's own pages (the main frame on app://menumath) are listened to.
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "menumath"

    weak var webView: WKWebView?
    private let scanner: any BarcodeScanning
    private let location: any LocationProviding
    private let sharer: any Sharing
    private let appleSignIn: any AppleSigningIn
    private let webSignIn: any WebSigningIn
    private let notifications: any NotificationScheduling
    private let purchases: any PurchaseService
    private let session: any SessionStoring
    private let deviceCheck: any DeviceChecking
    private let steps: any StepCounting

    init(scanner: any BarcodeScanning, location: any LocationProviding, sharer: any Sharing, appleSignIn: any AppleSigningIn, webSignIn: any WebSigningIn, notifications: any NotificationScheduling, purchases: any PurchaseService, session: any SessionStoring = InMemorySessionStore(), deviceCheck: any DeviceChecking = FakeDeviceCheck(outcome: .unavailable), steps: any StepCounting = FakeStepCounter(access: .unavailable)) {
        self.scanner = scanner
        self.location = location
        self.sharer = sharer
        self.appleSignIn = appleSignIn
        self.webSignIn = webSignIn
        self.notifications = notifications
        self.purchases = purchases
        self.session = session
        self.deviceCheck = deviceCheck
        self.steps = steps
        super.init()
        // A purchase that arrives while the app is open (StoreKitPurchaseService's updates listener posts this on the main actor): the page checks Apple's list
        // at once (web/app/app/_components/AppShell.tsx listens for "menumath:purchases") instead of at the next return to the front.
        NotificationCenter.default.addObserver(self, selector: #selector(purchasesChanged), name: .numbitePurchasesChanged, object: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.`protocol` == WebAppFiles.scheme,
              message.frameInfo.securityOrigin.host == WebAppFiles.host else { return }
        guard let request = BridgeRequest(body: message.body) else {
            // it failed its checks, but its id is sound: answer it, so the page doesn't wait out its timeout
            if let id = BridgeRequest.answerableID(in: message.body), let script = BridgeReply.failure("unavailable").script(for: id) { run(script) }
            return
        }
        Task {
            let reply = await handle(request)
            if let script = reply.script(for: request.id) { run(script) }
        }
    }

    /// Runs a reply in the page. The script ends with `true`, so the async form has a value to hand back (a bare undefined counts as an error there).
    private func run(_ script: String) {
        Task { _ = try? await webView?.evaluateJavaScript(script + " true;") }
    }

    @objc private func purchasesChanged() {
        run("window.dispatchEvent(new Event('menumath:purchases'));")
    }

    func handle(_ request: BridgeRequest) async -> BridgeReply {
        switch request {
        case .scan:
            switch await scanner.scan() {
            case .code(let digits): return BridgeReply(code: digits)
            case .cancelled: return .failure("cancelled")
            case .denied: return .failure("denied")
            case .unavailable: return .failure("unavailable")
            }
        case .locate(_, let onlyIfAllowed):
            switch await location.currentLocation(onlyIfAllowed: onlyIfAllowed) {
            case .found(let latitude, let longitude): return BridgeReply(lat: latitude, lng: longitude)
            case .denied: return .failure("denied")
            case .unavailable: return .failure("unavailable")
            }
        case .share(_, let content):
            return await sharer.share(content) ? BridgeReply(done: true) : .failure("cancelled")
        case .appleSignIn:
            switch await appleSignIn.signIn() {
            case .token(let idToken, let nonce, let authorizationCode): return BridgeReply(idToken: idToken, nonce: nonce, appleCode: authorizationCode)
            case .cancelled: return .failure("cancelled")
            case .unavailable: return .failure("unavailable")
            }
        case .webAuth(_, let provider):
            switch await webSignIn.signIn(provider: provider) {
            case .code(let authCode, let verifier): return BridgeReply(authCode: authCode, verifier: verifier)
            case .cancelled: return .failure("cancelled")
            case .unavailable: return .failure("unavailable")
            }
        case .notificationPermission:
            return BridgeReply(permission: await notifications.requestPermission().rawValue)
        case .notificationStatus:
            return BridgeReply(permission: await notifications.status().rawValue)
        case .syncReminders(_, let plan):
            if plan.ignored > 0 { Logger.reminders.warning("The page sent \(plan.ignored) reminder entries that were not valid; they were ignored") }
            await notifications.replaceReminders(plan.items)
            return BridgeReply(done: true)
        case .openNotificationSettings:
            notifications.openSettings()
            return BridgeReply(done: true)
        case .hideKeyboard:
            // resigns whatever has the focus inside the web view: the keyboard goes
            webView?.endEditing(true)
            return BridgeReply(done: true)
        case .iapProducts(_, let productIDs):
            guard let products = await purchases.products(ids: productIDs) else { return .failure("unavailable") }
            return BridgeReply(products: products)
        case .iapPurchase(_, let productID):
            switch await purchases.purchase(id: productID) {
            case .succeeded(let jws): return BridgeReply(transactions: [jws])
            case .cancelled: return .failure("cancelled")
            case .pending: return BridgeReply(pending: true)
            case .failed: return .failure("unavailable")
            }
        case .iapEntitlements:
            return BridgeReply(transactions: await purchases.entitlements())
        case .iapRestore:
            switch await purchases.restore() {
            case .transactions(let signed): return BridgeReply(transactions: signed)
            case .cancelled: return .failure("cancelled")
            case .failed: return .failure("unavailable")
            }
        case .iapManage:
            await purchases.manageSubscriptions()
            return BridgeReply(done: true)
        case .requestReview:
            // the page asks only after someone rated the app 5 (web/app/app/_components/RatingPrompt.tsx); Apple shows its pop-up or, past its yearly limit, nothing
            if let scene = webView?.window?.windowScene { AppStore.requestReview(in: scene) }
            return BridgeReply(done: true)
        case .sessionLoad:
            return BridgeReply(done: true, session: session.load())
        case .sessionSave(_, let value):
            session.save(value)
            return BridgeReply(done: true)
        case .deviceCheckToken:
            switch await deviceCheck.token() {
            case .token(let token, let environment): return BridgeReply(deviceToken: token, deviceEnv: environment)
            case .unavailable: return .failure("unavailable")
            }
        case .stepsStatus:
            let access = steps.access()
            return access == .unavailable ? .failure("unavailable") : BridgeReply(permission: access.rawValue)
        case .steps(_, let days, let ask):
            switch await steps.steps(days: days, ask: ask) {
            case .days(let list): return BridgeReply(steps: list)
            case .notDetermined: return BridgeReply(permission: StepAccess.notDetermined.rawValue)
            case .denied: return .failure("denied")
            case .unavailable: return .failure("unavailable")
            }
        case .openStepSettings:
            steps.openSettings()
            return BridgeReply(done: true)
        case .stopSteps:
            // Core Motion counts whether or not Numbite asks; the page simply stops asking
            return BridgeReply(done: true)
        }
    }
}
