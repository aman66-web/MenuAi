import Foundation
import Testing
@testable import MenuMacros

/// Steps through the bridge (Services/StepCounter.swift; web/lib/mm/native.ts "steps.*", web/lib/mm/steps.ts). Core Motion, never Apple Health.
struct StepsBridgeTests {
    @MainActor private func bridge(_ steps: any StepCounting) -> NativeBridge {
        NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(), appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(),
            notifications: FakeNotificationScheduler(), purchases: FakePurchaseService(), steps: steps
        )
    }

    private var london: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/London") ?? .gmt
        return calendar
    }

    @Test func theRequestsThePageSends() {
        #expect(BridgeRequest(body: ["id": "s-1", "action": "steps.status"]) == .stepsStatus(id: "s-1"))
        #expect(BridgeRequest(body: ["id": "s-2", "action": "steps.get", "payload": ["days": 7, "ask": true]]) == .steps(id: "s-2", days: 7, ask: true))
        #expect(BridgeRequest(body: ["id": "s-3", "action": "steps.get", "payload": ["days": 3]]) == .steps(id: "s-3", days: 3, ask: false))
        #expect(BridgeRequest(body: ["id": "s-4", "action": "steps.openSettings"]) == .openStepSettings(id: "s-4"))
        #expect(BridgeRequest(body: ["id": "s-5", "action": "steps.stop"]) == .stopSteps(id: "s-5"))
    }

    @Test func daysAreKeptToOneToSevenAndTheQuestionNeedsExactlyTrue() {
        #expect(BridgeRequest(body: ["id": "a", "action": "steps.get", "payload": ["days": 400]]) == .steps(id: "a", days: 7, ask: false))
        #expect(BridgeRequest(body: ["id": "a", "action": "steps.get", "payload": ["days": -2]]) == .steps(id: "a", days: 1, ask: false))
        #expect(BridgeRequest(body: ["id": "a", "action": "steps.get", "payload": ["days": "7", "ask": "yes"]]) == .steps(id: "a", days: 7, ask: false))
        #expect(BridgeRequest(body: ["id": "a", "action": "steps.get"]) == .steps(id: "a", days: 7, ask: false))
        #expect(BridgeRequest(body: ["id": "a", "action": "steps.delete"]) == nil)
    }

    @Test @MainActor func turningOnAsksIOSOnceThenTheDaysGoBackOldestFirst() async {
        let week = [DaySteps(date: "2026-11-25", steps: 9034), DaySteps(date: "2026-11-26", steps: 4210)]
        let steps = FakeStepCounter(access: .notDetermined, answer: .granted, days: week)
        let bridge = bridge(steps)
        // opening Home never asks
        #expect(await bridge.handle(.stepsStatus(id: "a")) == BridgeReply(permission: "notDetermined"))
        #expect(await bridge.handle(.steps(id: "b", days: 7, ask: false)) == BridgeReply(permission: "notDetermined"))
        // "Turn on step counting"
        #expect(await bridge.handle(.steps(id: "c", days: 7, ask: true)) == BridgeReply(steps: week))
        #expect(await bridge.handle(.stepsStatus(id: "d")) == BridgeReply(permission: "granted"))
        #expect(steps.reads.map(\.ask) == [false, true])
    }

    @Test @MainActor func saidNoOrNoStepCounter() async {
        let refused = bridge(FakeStepCounter(access: .notDetermined, answer: .denied))
        #expect(await refused.handle(.steps(id: "a", days: 7, ask: true)) == .failure("denied"))
        #expect(await refused.handle(.stepsStatus(id: "b")) == BridgeReply(permission: "denied"))
        let simulator = bridge(FakeStepCounter(access: .unavailable))
        #expect(await simulator.handle(.stepsStatus(id: "c")) == .failure("unavailable"))
        #expect(await simulator.handle(.steps(id: "d", days: 7, ask: true)) == .failure("unavailable"))
        // a bridge made without a step counter (the older set-up) answers the same, so the page shows nothing
        let plain = NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(), appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(),
            notifications: FakeNotificationScheduler(), purchases: FakePurchaseService()
        )
        #expect(await plain.handle(.stepsStatus(id: "e")) == .failure("unavailable"))
    }

    @Test @MainActor func openSettingsAndStop() async {
        let steps = FakeStepCounter()
        let bridge = bridge(steps)
        #expect(await bridge.handle(.openStepSettings(id: "a")) == BridgeReply(done: true))
        #expect(steps.settingsOpened == 1)
        #expect(await bridge.handle(.stopSteps(id: "b")) == BridgeReply(done: true))
    }

    @Test func theReplyCarriesTheDaysAsThePageReadsThem() throws {
        let script = try #require(BridgeReply(steps: [DaySteps(date: "2026-11-26", steps: 4210)]).script(for: "s-1"))
        // key order inside an object is the encoder's own: check each field
        #expect(script.contains(#""steps":[{"#))
        #expect(script.contains(#""date":"2026-11-26""#))
        #expect(script.contains(#""steps":4210"#))
        #expect(!script.contains("partial")) // the iPhone never sends it
    }

    @Test func theDaysAreTheLastSevenCalendarDaysEndingNow() throws {
        let calendar = london
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 26, hour: 15, minute: 30)))
        let ranges = StepDays.ranges(days: 7, now: now, calendar: calendar)
        #expect(ranges.map(\.key) == ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"])
        #expect(ranges.last?.end == now) // today stops at now
        let first = try #require(ranges.first)
        #expect(calendar.component(.hour, from: first.start) == 0)
        #expect(first.end.timeIntervalSince(first.start) == TimeInterval(24 * 3600))
        #expect(StepDays.ranges(days: 30, now: now, calendar: calendar).count == 7)
        #expect(StepDays.ranges(days: 0, now: now, calendar: calendar).map(\.key) == ["2026-11-26"])
    }

    @Test func aDayWhenTheClocksGoBackIsTwentyFiveHours() throws {
        let calendar = london
        // Sunday 25 October 2026: the UK's clocks go back an hour
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 10, day: 26, hour: 12)))
        let sunday = try #require(StepDays.ranges(days: 2, now: now, calendar: calendar).first)
        #expect(sunday.key == "2026-10-25")
        #expect(sunday.end.timeIntervalSince(sunday.start) == TimeInterval(25 * 3600))
    }

    @Test func theMotionPrivacyStringIsInTheApp() {
        let text = Bundle.main.object(forInfoDictionaryKey: "NSMotionUsageDescription") as? String
        #expect(text?.contains("steps") == true)
    }
}
