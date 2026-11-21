import Foundation
import Testing
@testable import MenuMacros

/// Apple's DeviceCheck token for the free week (Services/DeviceCheckService.swift; web/lib/mm/native.ts "deviceCheck.token", web/lib/payments/freeWeek.ts).
struct DeviceCheckTests {
    @MainActor private func bridge(_ deviceCheck: any DeviceChecking) -> NativeBridge {
        NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(), appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(),
            notifications: FakeNotificationScheduler(), purchases: FakePurchaseService(), deviceCheck: deviceCheck
        )
    }

    @Test func thePageMayAskForTheToken() {
        #expect(BridgeRequest(body: ["id": "a", "action": "deviceCheck.token"]) == .deviceCheckToken(id: "a"))
        #expect(BridgeRequest(body: ["id": "a", "action": "deviceCheck.token", "payload": ["ignored": true]]) == .deviceCheckToken(id: "a"))
        #expect(BridgeRequest(body: ["id": "a", "action": "deviceCheck.other"]) == nil)
    }

    @Test @MainActor func theTokenAndItsServerGoBackToThePage() async {
        let reply = await bridge(FakeDeviceCheck(outcome: .token("dG9rZW4=", environment: "production"))).handle(.deviceCheckToken(id: "a"))
        #expect(reply == BridgeReply(deviceToken: "dG9rZW4=", deviceEnv: "production"))
    }

    @Test @MainActor func theSimulatorAnswersUnavailable() async {
        #expect(await bridge(FakeDeviceCheck(outcome: .unavailable)).handle(.deviceCheckToken(id: "a")) == .failure("unavailable"))
        // a bridge made without DeviceCheck (the tests' and previews' older set-up) answers the same
        let plain = NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(), appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(),
            notifications: FakeNotificationScheduler(), purchases: FakePurchaseService()
        )
        #expect(await plain.handle(.deviceCheckToken(id: "b")) == .failure("unavailable"))
    }

    @Test func theReplyCarriesTheTokenAsThePageReadsIt() throws {
        let script = try #require(BridgeReply(deviceToken: "dG9rZW4+cw==", deviceEnv: "development").script(for: "d-1"))
        #expect(script.contains(#""deviceToken":"dG9rZW4+cw==""#))
        #expect(script.contains(#""deviceEnv":"development""#))
    }

    @Test func aDebugBuildUsesAppleDevelopmentServer() {
        #if DEBUG
        #expect(AppleDeviceCheck.environment == "development")
        #else
        #expect(AppleDeviceCheck.environment == "production")
        #endif
    }
}
