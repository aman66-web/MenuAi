import Foundation
import Observation

/// The app's dependencies, passed down through the SwiftUI environment (docs/SPEC.md §5). Each system service sits behind a protocol, with
/// a fake for previews and tests (Services/).
@Observable
final class AppEnvironment {
    let scanner: any BarcodeScanning
    let location: any LocationProviding
    let sharer: any Sharing
    let appleSignIn: any AppleSigningIn
    let webSignIn: any WebSigningIn
    let notifications: any NotificationScheduling
    /// Apple In-App Purchase (the paid features).
    let purchases: any PurchaseService
    /// The account's sign-in, kept in the Keychain (SessionStore.swift).
    let session: any SessionStoring
    /// Apple's DeviceCheck: whether this iPhone already had the free week (DeviceCheckService.swift).
    let deviceCheck: any DeviceChecking
    /// Steps from the iPhone's motion chip (StepCounter.swift): Core Motion, never Apple Health.
    let steps: any StepCounting
    /// Links the app is opened with (a shared shopping list): MenuMacrosApp hands them in, the web view shows them.
    let links = LinkInbox()

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
    }

    /// The real iPhone services.
    static func live() -> AppEnvironment {
        AppEnvironment(scanner: VisionKitBarcodeScanner(), location: CoreLocationService(), sharer: ActivityShareService(), appleSignIn: AuthorizationAppleSignIn(), webSignIn: AuthenticationSessionWebSignIn(), notifications: UserNotificationScheduler(), purchases: StoreKitPurchaseService(), session: KeychainSessionStore(), deviceCheck: AppleDeviceCheck(), steps: liveSteps())
    }

    /// Core Motion's pedometer. A Debug build launched with -NumbiteFakeSteps uses a made-up week instead (the Simulator has no step counter), so the Steps
    /// screens can be checked there; a Release build always uses the real one.
    private static func liveSteps() -> any StepCounting {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-NumbiteFakeSteps") { return FakeStepCounter(access: .notDetermined, answer: .granted) }
        #endif
        return CoreMotionStepCounter()
    }

    /// Fakes, for previews and tests.
    static func preview() -> AppEnvironment {
        AppEnvironment(scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(), appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(), notifications: FakeNotificationScheduler(), purchases: FakePurchaseService(), deviceCheck: FakeDeviceCheck(), steps: FakeStepCounter())
    }
}
