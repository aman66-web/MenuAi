import Foundation
import OSLog
import UserNotifications

/// Whether the person lets Numbite show notifications (Settings › Notifications › Numbite). iOS asks only once; after that the answer is theirs to change.
nonisolated enum NotificationPermission: String, Equatable, Sendable {
    case granted
    case denied
    /// Not asked yet.
    case notDetermined

    /// iOS has five states. Authorized, provisional (delivered quietly) and ephemeral (App Clips) all let a reminder through, so they are all
    /// "granted". A state this code doesn't know yet is "notDetermined": the page then says nothing and asks again, and the system just answers.
    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .authorized, .provisional, .ephemeral: self = .granted
        case .denied: self = .denied
        case .notDetermined: self = .notDetermined
        @unknown default: self = .notDetermined
        }
    }
}

/// Rings the reminders the person made on Home (web/lib/mm/reminders.ts), as local notifications scheduled by the phone itself. Nothing leaves the
/// phone (CLAUDE.md rule 4). The web app works out WHAT rings and WHEN (a plan); this only schedules what it is given.
protocol NotificationScheduling {
    /// Shows the system's "Allow notifications?" prompt if the person has never been asked; otherwise just says what they answered.
    func requestPermission() async -> NotificationPermission
    /// What the person answered, without asking.
    func status() async -> NotificationPermission
    /// Makes the phone ring exactly this plan and nothing else Numbite scheduled before (an empty plan cancels every reminder).
    func replaceReminders(_ plan: [ReminderPlanItem]) async
    /// Opens the iPhone's Settings page for Numbite's notifications.
    func openSettings()
}

extension Logger {
    /// Counts and states only: never a reminder's name or note (they can be about medication).
    nonisolated static let reminders = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Numbite", category: "reminders")
}
