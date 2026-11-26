import CoreMotion
import Foundation
import UIKit

/// One day's steps as the page reads them (web/lib/mm/steps.ts DaySteps): the iPhone's own calendar day ("YYYY-MM-DD", local time) and its step count.
nonisolated struct DaySteps: Codable, Equatable, Sendable {
    var date: String
    var steps: Int
    /// Counting began part-way through the day (Android's first day). Never set on the iPhone, which has counted all along.
    var partial: Bool?
}

/// Whether Numbite may read this iPhone's steps (Settings › Privacy & Security › Motion & Fitness, and Numbite's own switch there).
nonisolated enum StepAccess: String, Equatable, Sendable {
    case granted
    case denied
    /// Never asked: the first read shows iOS's own question.
    case notDetermined
    /// This iPhone (or the Simulator) can't count steps.
    case unavailable
}

nonisolated enum StepsOutcome: Equatable, Sendable {
    /// Oldest first.
    case days([DaySteps])
    case notDetermined
    case denied
    case unavailable
}

/// Steps for the page's Steps card and week (founder 2026-11-26: "the app should also track peoples steps too"). Read from the iPhone's motion chip through Core
/// Motion's pedometer, never from Apple Health (CLAUDE.md rule 4: Health is write-only). The counts are handed to the page and kept nowhere: not stored, not
/// synced, not sent. Core Motion itself keeps the last seven days.
protocol StepCounting {
    /// What iOS says, without asking.
    func access() -> StepAccess
    /// The last `days` days (1 to 7), oldest first. `ask`: the person just turned step counting on, so iOS may show its question (the answer waits for them);
    /// otherwise nobody is asked and "not asked yet" is the answer.
    func steps(days: Int, ask: Bool) async -> StepsOutcome
    /// Numbite's page in iPhone Settings, where Motion & Fitness can be switched back on.
    func openSettings()
}

/// The calendar days a read covers. Pure, so it is unit-tested.
nonisolated enum StepDays {
    nonisolated struct Range: Equatable, Sendable {
        let key: String
        let start: Date
        let end: Date
    }

    /// Core Motion keeps seven days of steps.
    static let maxDays = 7

    /// A number of days the page may ask for: 1 to 7.
    static func clamp(_ days: Int) -> Int { min(max(days, 1), maxDays) }

    /// "YYYY-MM-DD" for the calendar day `date` falls in.
    static func key(_ date: Date, calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The last `days` calendar days ending today, oldest first: each from its midnight to the next (today's up to `now`). Days whose midnight doesn't exist
    /// (a clock change at midnight) start at the first moment of the day, as Calendar gives it.
    static func ranges(days: Int, now: Date, calendar: Calendar) -> [Range] {
        let today = calendar.startOfDay(for: now)
        return (0..<clamp(days)).reversed().compactMap { back -> Range? in
            guard let start = calendar.date(byAdding: .day, value: -back, to: today) else { return nil }
            let dayStart = calendar.startOfDay(for: start)
            let next = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? now
            return Range(key: key(dayStart, calendar: calendar), start: dayStart, end: min(next, now))
        }
    }
}

/// The real one: CMPedometer. The Simulator has no step counter and answers "unavailable".
final class CoreMotionStepCounter: StepCounting {
    private let pedometer = CMPedometer()

    func access() -> StepAccess {
        guard CMPedometer.isStepCountingAvailable() else { return .unavailable }
        switch CMPedometer.authorizationStatus() {
        case .authorized: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    func steps(days: Int, ask: Bool) async -> StepsOutcome {
        switch access() {
        case .unavailable: return .unavailable
        case .denied: return .denied
        case .notDetermined where !ask: return .notDetermined
        case .notDetermined, .granted: break
        }
        var found: [DaySteps] = []
        // today first: the first read is the one that shows iOS's question, and its answer decides the rest
        for range in StepDays.ranges(days: days, now: Date(), calendar: .current).reversed() {
            switch await Self.query(pedometer, from: range.start, to: range.end) {
            case .steps(let count): found.append(DaySteps(date: range.key, steps: count))
            case .notAllowed: return .denied
            case .failed: continue
            }
        }
        if found.isEmpty, access() == .denied { return .denied }
        return .days(found.reversed())
    }

    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    nonisolated private enum Query: Sendable {
        case steps(Int)
        case notAllowed
        case failed
    }

    /// Core Motion answers on a queue of its own: the handler is @Sendable, so it is never tied to the main actor.
    nonisolated private static func query(_ pedometer: CMPedometer, from start: Date, to end: Date) async -> Query {
        await withCheckedContinuation { (continuation: CheckedContinuation<Query, Never>) in
            pedometer.queryPedometerData(from: start, to: end) { @Sendable data, error in
                if let error = error as NSError? {
                    let notAllowed = error.domain == CMErrorDomain && error.code == Int(CMErrorMotionActivityNotAuthorized.rawValue)
                    continuation.resume(returning: notAllowed ? .notAllowed : .failed)
                } else if let data {
                    continuation.resume(returning: .steps(max(0, data.numberOfSteps.intValue)))
                } else {
                    continuation.resume(returning: .failed)
                }
            }
        }
    }
}

/// For previews and tests, and (Debug builds only, with the launch argument -NumbiteFakeSteps) for checking the Steps screens in the Simulator, which has no step
/// counter. `answer` is what the person says to iOS's question when `access` is notDetermined and the page asks.
final class FakeStepCounter: StepCounting {
    private(set) var state: StepAccess
    let answer: StepAccess
    let days: [DaySteps]
    private(set) var reads: [(days: Int, ask: Bool)] = []
    private(set) var settingsOpened = 0

    init(access: StepAccess = .granted, answer: StepAccess = .granted, days: [DaySteps] = FakeStepCounter.sampleWeek()) {
        state = access
        self.answer = answer
        self.days = days
    }

    func access() -> StepAccess { state }

    func steps(days count: Int, ask: Bool) async -> StepsOutcome {
        reads.append((count, ask))
        if state == .notDetermined, ask { state = answer }
        switch state {
        case .granted: return .days(Array(days.suffix(StepDays.clamp(count))))
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        case .unavailable: return .unavailable
        }
    }

    func openSettings() { settingsOpened += 1 }

    /// A made-up week, for the Simulator and previews only (Debug): never shown in a Release build.
    static func sampleWeek(now: Date = Date(), calendar: Calendar = .current) -> [DaySteps] {
        let counts = [6120, 8450, 3980, 10230, 7010, 9340, 4210]
        return zip(StepDays.ranges(days: 7, now: now, calendar: calendar), counts).map { DaySteps(date: $0.key, steps: $1) }
    }
}
