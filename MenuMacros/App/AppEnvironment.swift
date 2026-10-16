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
    /// Links the app is opened with (a shared shopping list): MenuMacrosApp hands them in, the web view shows them.
    let links = LinkInbox()

    init(scanner: any BarcodeScanning, location: any LocationProviding, sharer: any Sharing, appleSignIn: any AppleSigningIn, webSignIn: any WebSigningIn, notifications: any NotificationScheduling) {
        self.scanner = scanner
        self.location = location
        self.sharer = sharer
        self.appleSignIn = appleSignIn
        self.webSignIn = webSignIn
        self.notifications = notifications
    }

    /// The real iPhone services.
    static func live() -> AppEnvironment {
        AppEnvironment(scanner: VisionKitBarcodeScanner(), location: CoreLocationService(), sharer: ActivityShareService(), appleSignIn: AuthorizationAppleSignIn(), webSignIn: AuthenticationSessionWebSignIn(), notifications: UserNotificationScheduler())
    }

    /// Fakes, for previews and tests.
    static func preview() -> AppEnvironment {
        AppEnvironment(scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(), appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(), notifications: FakeNotificationScheduler())
    }
}
