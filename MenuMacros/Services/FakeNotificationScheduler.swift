import Foundation

/// For previews and tests: remembers what it was asked and answers like a phone that has been asked (or not).
final class FakeNotificationScheduler: NotificationScheduling {
    var permission: NotificationPermission
    /// What the person answers when the prompt is shown.
    var answerToPrompt: NotificationPermission
    private(set) var promptsShown = 0
    /// Every plan received, oldest first.
    private(set) var plans: [[ReminderPlanItem]] = []
    private(set) var settingsOpened = 0

    init(permission: NotificationPermission = .notDetermined, answerToPrompt: NotificationPermission = .granted) {
        self.permission = permission
        self.answerToPrompt = answerToPrompt
    }

    func requestPermission() async -> NotificationPermission {
        if permission == .notDetermined {
            promptsShown += 1
            permission = answerToPrompt
        }
        return permission
    }

    func status() async -> NotificationPermission { permission }

    func replaceReminders(_ plan: [ReminderPlanItem]) async { plans.append(plan) }

    func openSettings() { settingsOpened += 1 }
}

/// For tests: a notification centre in memory, with the system's rules that matter here (the same identifier replaces; the prompt shows once).
final class FakeNotificationCenter: NotificationCenterAccess {
    var status: NotificationPermission
    var answerToPrompt: Bool
    /// Identifiers the system refuses to schedule.
    var refusing: Set<String> = []
    private(set) var promptsShown = 0
    private(set) var pending: [String: ReminderNotification] = [:]
    private(set) var delivered: Set<String> = []
    /// What was done, in order: "add <identifier>", "removePending <identifiers>", "removeDelivered <identifiers>".
    private(set) var calls: [String] = []

    init(status: NotificationPermission = .notDetermined, answerToPrompt: Bool = true) {
        self.status = status
        self.answerToPrompt = answerToPrompt
    }

    /// Puts something in the centre before the test starts (another feature's notification, or one left over from an earlier plan).
    func seed(pending notification: ReminderNotification) { pending[notification.identifier] = notification }
    func seed(delivered identifier: String) { delivered.insert(identifier) }

    func authorizationStatus() async -> NotificationPermission { status }

    func requestAuthorization() async -> Bool {
        guard status == .notDetermined else { return status == .granted }
        promptsShown += 1
        status = answerToPrompt ? .granted : .denied
        return answerToPrompt
    }

    func pendingIdentifiers() async -> [String] { pending.keys.sorted() }

    func deliveredIdentifiers() async -> [String] { delivered.sorted() }

    func add(_ notification: ReminderNotification) async -> Bool {
        calls.append("add \(notification.identifier)")
        if refusing.contains(notification.identifier) { return false }
        pending[notification.identifier] = notification
        return true
    }

    func removePending(identifiers: [String]) {
        calls.append("removePending \(identifiers.sorted().joined(separator: ","))")
        for identifier in identifiers { pending[identifier] = nil }
    }

    func removeDelivered(identifiers: [String]) {
        calls.append("removeDelivered \(identifiers.sorted().joined(separator: ","))")
        delivered.subtract(identifiers)
    }
}
