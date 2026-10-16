import Foundation
import OSLog
import UIKit
import UserNotifications

/// What the scheduler needs from the notification centre, so the replace-everything logic can be tested without the system's.
protocol NotificationCenterAccess {
    func authorizationStatus() async -> NotificationPermission
    /// Shows the system prompt (only ever shown once by iOS). True when the person allowed.
    func requestAuthorization() async -> Bool
    func pendingIdentifiers() async -> [String]
    func deliveredIdentifiers() async -> [String]
    /// Schedules it; a notification with an identifier that is already pending takes its place. False when the system refused.
    func add(_ notification: ReminderNotification) async -> Bool
    func removePending(identifiers: [String])
    func removeDelivered(identifiers: [String])
}

/// Local notifications for the reminders on Home: the web app sends a plan, this makes the phone ring exactly that. No server, no account, nothing
/// leaves the phone. Needs no capability, Info.plist key or entitlement.
///
/// iOS facts that shape this:
/// - The person is asked once (`requestAuthorization`); the web app asks only when they save their first reminder. Scheduling works before and
///   after that answer (a notification is only shown if they allowed it, and one scheduled while "denied" rings if they switch it on later).
/// - Pending notifications, including repeating ones, survive the app being closed, force-quit or the phone restarting.
/// - At most 64 are pending per app, so the plan is capped at 60 (ReminderPlan.maxNotifications).
/// - Adding a request whose identifier is already pending replaces it. So a plan is applied by adding everything first and only then removing our
///   identifiers that are no longer wanted: there is never a moment with nothing scheduled, and sending the same plan twice changes nothing.
/// - Only identifiers starting "mm.reminder." are ours to remove.
final class UserNotificationScheduler: NotificationScheduling {
    private let center: any NotificationCenterAccess
    private let now: () -> Date
    private let calendar: () -> Calendar
    /// The newest plan received while one was still being applied. Plans are applied one at a time (two at once could each remove what the other added).
    private var waitingPlan: [ReminderPlanItem]?
    private var isApplying = false

    init(center: any NotificationCenterAccess = SystemNotificationCenter(), now: @escaping () -> Date = { Date() }, calendar: @escaping () -> Calendar = { UserNotificationScheduler.localGregorian() }) {
        self.center = center
        self.now = now
        self.calendar = calendar
    }

    /// Dates in a plan are Gregorian "YYYY-MM-DD" whatever calendar the phone shows (a Buddhist-calendar phone counts 2026 as 2569), on the phone's clock.
    /// `autoupdatingCurrent`, not `current`: `current` is a snapshot taken when first read, so after the phone changes time zone while the app is still
    /// running the dates the page sends (worked out on the new clock) would be read on the old one.
    nonisolated static func localGregorian() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.autoupdatingCurrent
        return calendar
    }

    func status() async -> NotificationPermission {
        await center.authorizationStatus()
    }

    func requestPermission() async -> NotificationPermission {
        let current = await center.authorizationStatus()
        // iOS shows its prompt only while the answer is "not determined"; after that the person's answer stands until they change it in Settings.
        guard current == .notDetermined else { return current }
        _ = await center.requestAuthorization()
        return await center.authorizationStatus()
    }

    func replaceReminders(_ plan: [ReminderPlanItem]) async {
        waitingPlan = plan
        guard !isApplying else { return } // the call that is running applies the newest plan when it finishes its current one
        isApplying = true
        while let next = waitingPlan {
            waitingPlan = nil
            await apply(next)
        }
        isApplying = false
    }

    func openSettings() {
        // iOS 16+: the page for Numbite's notifications. (Counts only; never a reminder's words are logged.)
        guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private func apply(_ plan: [ReminderPlanItem]) async {
        let schedule = ReminderSchedule.make(for: plan, now: now(), calendar: calendar())
        if schedule.leftOutForRoom > 0 || schedule.unusableDates > 0 {
            Logger.reminders.warning("Reminder plan: \(schedule.leftOutForRoom) left out for room, \(schedule.unusableDates) dates already past or not real")
        }
        var failed = 0
        for notification in schedule.notifications {
            if !(await center.add(notification)) { failed += 1 }
        }
        let wanted = Set(schedule.notifications.map(\.identifier))
        let stale = await center.pendingIdentifiers().filter { ReminderPlan.isOurs($0) && !wanted.contains($0) }
        if !stale.isEmpty { center.removePending(identifiers: stale) }
        // A ring that is already on the lock screen or in Notification Center stays while its reminder exists, but goes with a deleted one (or Clear data).
        let planned = Set(plan.map(\.id))
        let gone = await center.deliveredIdentifiers().filter { identifier in
            guard let id = ReminderNotification.owner(ofIdentifier: identifier) else { return false }
            return !planned.contains(id)
        }
        if !gone.isEmpty { center.removeDelivered(identifiers: gone) }
        Logger.reminders.info("Reminders scheduled: \(schedule.notifications.count - failed) of \(schedule.notifications.count), \(stale.count) old removed")
    }
}

/// The real thing: UNUserNotificationCenter. The completion-handler forms are used on purpose, with @Sendable closures that hand back only plain
/// values: the system calls them on its own queue, and this module's default isolation is the main actor.
struct SystemNotificationCenter: NotificationCenterAccess {
    func authorizationStatus() async -> NotificationPermission {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { @Sendable settings in
                continuation.resume(returning: NotificationPermission(settings.authorizationStatus))
            }
        }
    }

    func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { @Sendable granted, error in
                if let error { Logger.reminders.error("Asking for notification permission failed: \(error.localizedDescription, privacy: .public)") }
                continuation.resume(returning: granted)
            }
        }
    }

    func pendingIdentifiers() async -> [String] {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getPendingNotificationRequests { @Sendable requests in
                continuation.resume(returning: requests.map(\.identifier))
            }
        }
    }

    func deliveredIdentifiers() async -> [String] {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getDeliveredNotifications { @Sendable notifications in
                continuation.resume(returning: notifications.map { $0.request.identifier })
            }
        }
    }

    func add(_ notification: ReminderNotification) async -> Bool {
        let content = UNMutableNotificationContent()
        content.title = notification.title
        content.body = notification.body // empty when the person wrote no note: the page sends its own neutral line, translated
        content.sound = .default
        content.userInfo = ["reminderId": notification.reminderID]
        // no badge, no actions, no category: tapping a reminder just opens the app

        let trigger: UNCalendarNotificationTrigger
        switch notification.timing {
        case .daily(let hour, let minute):
            trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: hour, minute: minute), repeats: true)
        case .weekly(let weekday, let hour, let minute):
            trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: hour, minute: minute, weekday: weekday), repeats: true)
        case .once(let date):
            // The phone's own calendar and time zone, from the moment worked out above: right on a phone that shows a Buddhist or Japanese calendar too.
            // (`autoupdatingCurrent` for both: the live zone and calendar, not a snapshot of them.)
            let calendar = Calendar.autoupdatingCurrent
            var parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            parts.calendar = calendar
            parts.timeZone = TimeZone.autoupdatingCurrent
            trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        }
        let request = UNNotificationRequest(identifier: notification.identifier, content: content, trigger: trigger)
        return await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().add(request) { @Sendable error in
                if let error { Logger.reminders.error("Scheduling a reminder failed: \(error.localizedDescription, privacy: .public)") }
                continuation.resume(returning: error == nil)
            }
        }
    }

    func removePending(identifiers: [String]) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers)
    }

    func removeDelivered(identifiers: [String]) {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: identifiers)
    }
}
