import Observation

/// The app's dependencies, passed down through the SwiftUI environment (docs/SPEC.md §5). Each system service sits behind a protocol, with
/// a fake for previews and tests (Services/).
@Observable
final class AppEnvironment {
    let scanner: any BarcodeScanning
    let location: any LocationProviding
    let sharer: any Sharing

    init(scanner: any BarcodeScanning, location: any LocationProviding, sharer: any Sharing) {
        self.scanner = scanner
        self.location = location
        self.sharer = sharer
    }

    /// The real iPhone services.
    static func live() -> AppEnvironment {
        AppEnvironment(scanner: VisionKitBarcodeScanner(), location: CoreLocationService(), sharer: ActivityShareService())
    }

    /// Fakes, for previews and tests.
    static func preview() -> AppEnvironment {
        AppEnvironment(scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService())
    }
}
