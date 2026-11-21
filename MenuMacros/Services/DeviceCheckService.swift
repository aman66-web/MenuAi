import DeviceCheck
import Foundation
import OSLog

/// What Apple's DeviceCheck gave for this iPhone (web/lib/mm/native.ts "deviceCheck.token").
nonisolated enum DeviceCheckOutcome: Equatable, Sendable {
    /// Apple's one-time token for this iPhone (base64) and which of Apple's DeviceCheck servers it is for ("development" or "production").
    case token(String, environment: String)
    /// The Simulator, or an iPhone that couldn't make one just now.
    case unavailable
}

/// Apple's DeviceCheck: the free week (founder 2026-11-20: "we'll use the Apple device check"). The page asks for a token, our server sends it to Apple, and Apple
/// keeps two bits for this iPhone; bit 0 means "this iPhone had the free week" (web/lib/payments/freeWeek.ts), so deleting the app or making a new account doesn't
/// bring a second one. The token says nothing about the person; Apple tells our server only the two bits. No capability or entitlement is needed for this.
protocol DeviceChecking {
    func token() async -> DeviceCheckOutcome
}

/// The real one: DCDevice. Unsupported on the Simulator.
struct AppleDeviceCheck: DeviceChecking {
    /// A build run from Xcode is signed for development, and its tokens are checked on Apple's development DeviceCheck server; TestFlight and App Store builds
    /// (Release) use production.
    nonisolated static var environment: String {
        #if DEBUG
        "development"
        #else
        "production"
        #endif
    }

    func token() async -> DeviceCheckOutcome {
        guard let data = await Self.generate() else { return .unavailable }
        return .token(data.base64EncodedString(), environment: Self.environment)
    }

    /// DCDevice answers on a queue of its own: the closure is @Sendable, so it is never tied to the main actor.
    nonisolated private static func generate() async -> Data? {
        let device = DCDevice.current
        guard device.isSupported else { return nil }
        return await withCheckedContinuation { (continuation: CheckedContinuation<Data?, Never>) in
            device.generateToken { @Sendable data, error in
                if let error { Logger.account.error("DeviceCheck token failed: \(error.localizedDescription, privacy: .public)") }
                continuation.resume(returning: data)
            }
        }
    }
}

/// For previews and tests.
struct FakeDeviceCheck: DeviceChecking {
    var outcome: DeviceCheckOutcome = .token("ZmFrZS1kZXZpY2UtY2hlY2stdG9rZW4=", environment: "development")
    func token() async -> DeviceCheckOutcome { outcome }
}
