import Foundation
import UserNotifications

/// Without a delegate, iOS shows nothing for a notification that arrives while the app is open, so a reminder that came due while the person was
/// looking at Numbite would pass unseen. This one shows ours as a banner with its sound, and keeps it in Notification Center afterwards.
/// Tapping a reminder needs no code: iOS just opens the app.
///
/// Installed once, as the app starts: `MenuMacrosApp.init()` calls `install()`. The centre holds its delegate weakly, hence the shared instance.
nonisolated final class ReminderNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = ReminderNotificationDelegate()

    static func install() {
        UNUserNotificationCenter.current().delegate = shared
    }

    /// How a notification is shown while the app is open: ours as a banner, with sound, and kept in the list; anything else not at all.
    static func presentation(forIdentifier identifier: String) -> UNNotificationPresentationOptions {
        ReminderPlan.isOurs(identifier) ? [.banner, .list, .sound] : []
    }

    // nonisolated on purpose: iOS calls this on its own queue, not on the main actor
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        Self.presentation(forIdentifier: notification.request.identifier)
    }
}
