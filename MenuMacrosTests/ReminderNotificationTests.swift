import Foundation
import Testing
import UserNotifications
@testable import MenuMacros

/// Reminders ring as local notifications (docs/APP_BUILD.md "Reminders (local notifications)"; the web side is web/lib/mm/reminders.ts and
/// web/lib/mm/native.ts). The page's JSON is never trusted: every field is checked and a bad entry is ignored.
struct ReminderPlanDecodingTests {
    /// One plan entry as WebKit hands it over: a daily 08:00 reminder unless told otherwise.
    private func entry(_ changes: [String: Any] = [:], removing: [String] = [], id: String = "r1") -> [String: Any] {
        var base: [String: Any] = ["id": id, "title": "Morning reminder", "body": "Tap to open Numbite", "hour": 8, "minute": 0]
        base.merge(changes) { _, new in new }
        for key in removing { base[key] = nil }
        return base
    }

    private func onlyItem(_ raw: [String: Any]) throws -> ReminderPlanItem {
        let parsed = try #require(ReminderPlanItem.parsePlan([raw]))
        return try #require(parsed.items.first)
    }

    @Test func aDailyReminderIsRead() throws {
        let item = try onlyItem(entry())
        #expect(item == ReminderPlanItem(id: "r1", title: "Morning reminder", body: "Tap to open Numbite", hour: 8, minute: 0, ring: .daily))
    }

    @Test func certainDaysAreIosWeekdaysSortedWithoutRepeats() throws {
        let item = try onlyItem(entry(["weekdays": [5, 2, 2, 7] as [Any]]))
        #expect(item.ring == .weekdays([2, 5, 7]))
    }

    @Test func everyFewDaysCarriesItsDates() throws {
        let item = try onlyItem(entry(["fireAt": ["2026-10-20T09:05", "2026-10-23T09:05", "2026-10-20T09:05"] as [Any]]))
        #expect(item.ring == .oneOffs([
            ReminderMoment(year: 2026, month: 10, day: 20, hour: 9, minute: 5),
            ReminderMoment(year: 2026, month: 10, day: 23, hour: 9, minute: 5),
        ]))
    }

    @Test func aMissingOrNullNoteIsEmptyNotInvented() throws {
        #expect(try onlyItem(entry(removing: ["body"])).body == "")
        #expect(try onlyItem(entry(["body": NSNull()])).body == "")
        // null weekdays / dates mean "not there" too
        #expect(try onlyItem(entry(["weekdays": NSNull(), "fireAt": NSNull()])).ring == .daily)
    }

    @Test func badEntriesAreIgnoredAndTheGoodOnesKept() throws {
        let bad: [[String: Any]] = [
            entry(["hour": 24]), entry(["hour": -1]), entry(["minute": 60]), entry(["hour": "8"]), entry(["hour": 8.5]), entry(["hour": true]),
            entry(removing: ["hour"]), entry(removing: ["minute"]), entry(removing: ["id"]), entry(removing: ["title"]),
            entry(id: "has.dot"), entry(id: ""), entry(id: String(repeating: "a", count: 65)), entry(id: "emoji-🙂"), entry(id: "sp ace"),
            entry(["title": ""]), entry(["title": " \n\t "]), entry(["title": 5]), entry(["body": 5]),
            entry(["weekdays": [0] as [Any]]), entry(["weekdays": [8] as [Any]]), entry(["weekdays": [1.5] as [Any]]), entry(["weekdays": ["2"] as [Any]]),
            entry(["weekdays": [Any]()]), entry(["weekdays": "2"]), entry(["weekdays": [NSNull()] as [Any]]), entry(["weekdays": [1, 2, 99] as [Any]]),
            entry(["weekdays": [2] as [Any], "fireAt": ["2026-10-20T09:05"] as [Any]]), // two ways of ringing: refused, not guessed at
            entry(["fireAt": [Any]()]), entry(["fireAt": "2026-10-20T09:05"]), entry(["fireAt": [5] as [Any]]),
            entry(["fireAt": ["2026-13-01T08:00"] as [Any]]), entry(["fireAt": ["2026-10-20 09:05"] as [Any]]), entry(["fireAt": ["2026-10-20T9:05"] as [Any]]),
            entry(["fireAt": ["2026-10-20T24:00"] as [Any]]), entry(["fireAt": ["2026-10-20T09:05", "nonsense"] as [Any]]),
        ]
        let good = entry(id: "good")
        let junk: [Any] = ["text", 3, NSNull(), [1, 2], true]
        let parsed = try #require(ReminderPlanItem.parsePlan(bad + [good] + junk))
        #expect(parsed.items.map(\.id) == ["good"])
        #expect(parsed.ignored == bad.count + junk.count)
    }

    @Test func aNumberIsNeverAYesOrNo() throws {
        #expect(ReminderPlanItem(payload: entry(["hour": NSNumber(value: true)])) == nil)
        #expect(ReminderPlanItem(payload: entry(["hour": NSNumber(value: 8)])) != nil)
        #expect(ReminderPlanItem(payload: entry(["hour": NSNumber(value: 8.0)])) != nil) // JavaScript has one kind of number
    }

    @Test func aPlanThatIsNotAListIsNotAPlan() {
        #expect(ReminderPlanItem.parsePlan(nil) == nil)
        #expect(ReminderPlanItem.parsePlan("items") == nil)
        #expect(ReminderPlanItem.parsePlan(NSNull()) == nil)
        #expect(ReminderPlanItem.parsePlan(["id": "r1"] as [String: Any]) == nil)
        #expect(ReminderPlanItem.parsePlan([Any]()) == ReminderPlanItem.Parsed(items: [], ignored: 0)) // an empty list is a real plan: no reminders
    }

    @Test func textIsCleanedAndCut() throws {
        let item = try onlyItem(entry(["title": "  Weekly\n injection\t", "body": "Line one\r\nLine two"]))
        #expect(item.title == "Weekly  injection")
        #expect(item.body == "Line one  Line two")
        let family = "👨‍👩‍👧‍👦"
        let longTitle = try onlyItem(entry(["title": String(repeating: "a", count: 99) + family + "zzz"]))
        #expect(longTitle.title.count == ReminderPlan.maxTitleLength)
        #expect(longTitle.title.last == Character(family)) // cut between characters, never inside one
        #expect(try onlyItem(entry(["body": String(repeating: "b", count: 500)])).body.count == ReminderPlan.maxBodyLength)
    }

    @Test func joinersAndDirectionMarksSurviveButLineBreaksDoNot() throws {
        // Persian, Urdu and Indic words need U+200C / U+200D, and emoji sequences need U+200D: they are format characters (Unicode category Cf), not controls,
        // so what the person typed reaches the lock screen unchanged (web/lib/mm/reminders.ts keeps them too)
        let persian = "می\u{200C}خواهم"
        #expect(try onlyItem(entry(["title": persian])).title == persian)
        let marked = "a\u{200E}b\u{200F}c\u{061C}d"
        #expect(try onlyItem(entry(["title": marked])).title == marked)
        let family = "👨‍👩‍👧‍👦"
        #expect(try onlyItem(entry(["title": family])).title == family)
        // a name made only of a joiner is not empty, as on the web
        #expect(ReminderPlanItem(payload: entry(["title": "\u{200D}"])) != nil)
        // real line breaks, tabs and the line and paragraph separators become spaces
        #expect(try onlyItem(entry(["body": "one\u{2028}two\u{2029}three\u{0085}four\tfive"])).body == "one two three four five")
    }

    @Test func countsAreCapped() throws {
        let many = (0..<60).map { entry(id: "r\($0)") }
        let parsed = try #require(ReminderPlanItem.parsePlan(many))
        #expect(parsed.items.count == ReminderPlan.maxItems)
        #expect(parsed.ignored == 10)

        let twice = try #require(ReminderPlanItem.parsePlan([entry(id: "same"), entry(["title": "Other"], id: "same")]))
        #expect(twice.items.map(\.title) == ["Morning reminder"]) // the first one with an id wins
        #expect(twice.ignored == 1)

        func text(_ month: Int, _ day: Int) -> String { String(format: "2026-%02d-%02dT09:00", month, day) }
        let november: [String] = (1...28).map { text(11, $0) }
        let december: [String] = (1...17).map { text(12, $0) }
        let dates = november + december
        #expect(dates.count == 45)
        guard case .oneOffs(let moments) = try onlyItem(entry(["fireAt": dates as [Any]])).ring else {
            Issue.record("expected one-off dates")
            return
        }
        #expect(moments.count == ReminderPlan.maxDatesPerItem)
        #expect(moments.first?.text == "2026-11-01T09:00")
    }

    @Test func momentsAreReadStrictly() {
        #expect(ReminderMoment("2026-10-20T09:05") == ReminderMoment(year: 2026, month: 10, day: 20, hour: 9, minute: 5))
        #expect(ReminderMoment("2026-10-20T09:05")?.text == "2026-10-20T09:05")
        for text in ["", "2026-10-20", "2026-10-20T09:05:00", " 2026-10-20T09:05", "2026-10-20T09:05 ", "2026-10-20t09:05", "2026/10/20T09:05",
                     "2026-00-20T09:05", "2026-10-32T09:05", "2026-10-20T24:00", "2026-10-20T09:60", "1999-10-20T09:05", "２０２６-10-20T09:05", "2026-1O-20T09:05"] {
            #expect(ReminderMoment(text) == nil, "\(text) should not be a moment")
        }
    }

    @Test func aDayThatDoesNotExistIsNotADate() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/London"))
        #expect(try #require(ReminderMoment("2026-02-30T09:00")).date(in: calendar) == nil)
        #expect(try #require(ReminderMoment("2027-02-29T09:00")).date(in: calendar) == nil)
        #expect(try #require(ReminderMoment("2028-02-29T09:00")).date(in: calendar) != nil) // a leap day is real
        #expect(try #require(ReminderMoment("2026-04-31T09:00")).date(in: calendar) == nil)
    }
}

/// From a checked plan to the notifications the phone is asked to schedule.
struct ReminderScheduleTests {
    private func london() throws -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/London"))
        return calendar
    }

    private func date(_ calendar: Calendar, _ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0) throws -> Date {
        try #require(calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)))
    }

    private func item(_ id: String, ring: ReminderPlanItem.Ring, hour: Int = 8, minute: Int = 0) -> ReminderPlanItem {
        ReminderPlanItem(id: id, title: "Reminder \(id)", body: "A note", hour: hour, minute: minute, ring: ring)
    }

    @Test func everyDayIsOneRepeatingNotification() throws {
        let calendar = try london()
        let schedule = ReminderSchedule.make(for: [item("r1", ring: .daily, hour: 7, minute: 45)], now: try date(calendar, 2026, 10, 16, 12), calendar: calendar)
        #expect(schedule.notifications == [
            ReminderNotification(identifier: "mm.reminder.r1.daily", reminderID: "r1", title: "Reminder r1", body: "A note", timing: .daily(hour: 7, minute: 45))
        ])
    }

    @Test func certainDaysAreOneRepeatingNotificationPerWeekday() throws {
        let calendar = try london()
        let schedule = ReminderSchedule.make(for: [item("r2", ring: .weekdays([2, 5]), hour: 20, minute: 30)], now: try date(calendar, 2026, 10, 16), calendar: calendar)
        #expect(schedule.notifications.map(\.identifier) == ["mm.reminder.r2.wd2", "mm.reminder.r2.wd5"])
        #expect(schedule.notifications.map(\.timing) == [.weekly(weekday: 2, hour: 20, minute: 30), .weekly(weekday: 5, hour: 20, minute: 30)])
    }

    @Test func everyFewDaysAreOneOffsAndPastDatesAreDropped() throws {
        let calendar = try london()
        let now = try date(calendar, 2026, 10, 16, 12, 0)
        let moments = ["2026-10-16T09:00", "2026-10-16T12:00", "2026-10-16T12:01", "2026-10-19T09:00", "2026-02-30T09:00"].compactMap { ReminderMoment($0) }
        let schedule = ReminderSchedule.make(for: [item("r3", ring: .oneOffs(moments))], now: now, calendar: calendar)
        // earlier today and "right now" are gone, 30 February is not a day: three unusable, two left
        #expect(schedule.unusableDates == 3)
        #expect(schedule.notifications.map(\.identifier) == ["mm.reminder.r3.at2026-10-16T12:01", "mm.reminder.r3.at2026-10-19T09:00"])
        let first = try date(calendar, 2026, 10, 16, 12, 1)
        let second = try date(calendar, 2026, 10, 19, 9, 0)
        #expect(schedule.notifications.map(\.timing) == [.once(first), .once(second)])
    }

    @Test func aReminderWithNoDatesLeftRingsNothing() throws {
        let calendar = try london()
        let moments = ["2026-10-01T09:00"].compactMap { ReminderMoment($0) }
        let schedule = ReminderSchedule.make(for: [item("r3", ring: .oneOffs(moments))], now: try date(calendar, 2026, 10, 16), calendar: calendar)
        #expect(schedule.notifications.isEmpty)
        #expect(schedule.leftOutForRoom == 0)
    }

    @Test func theLimitLeavesWholeRemindersOutAndTriesTheNext() throws {
        let calendar = try london()
        var items = (0..<9).map { item("r\($0)", ring: .weekdays([1, 2, 3, 4, 5, 6])) } // 54
        items.append(item("big", ring: .weekdays([1, 2, 3, 4, 5, 6, 7]))) // 61: no room, so not at all (never on only some of its days)
        items.append(item("small", ring: .daily)) // 55
        let schedule = ReminderSchedule.make(for: items, now: try date(calendar, 2026, 10, 16), calendar: calendar)
        #expect(schedule.notifications.count == 55)
        #expect(schedule.leftOutForRoom == 1)
        #expect(!schedule.notifications.contains { $0.reminderID == "big" })
        #expect(schedule.notifications.last?.identifier == "mm.reminder.small.daily")
        #expect(ReminderPlan.maxNotifications < 64) // iOS keeps 64 pending per app
    }

    @Test func ourIdentifiersCanBeReadBack() {
        #expect(ReminderNotification.owner(ofIdentifier: "mm.reminder.abc-1_x.daily") == "abc-1_x")
        #expect(ReminderNotification.owner(ofIdentifier: "mm.reminder.abc.at2026-10-20T09:05") == "abc")
        #expect(ReminderNotification.owner(ofIdentifier: "mm.reminder.abc.wd3") == "abc")
        #expect(ReminderNotification.owner(ofIdentifier: "other.thing") == nil)
        #expect(ReminderNotification.owner(ofIdentifier: "mm.reminder.") == nil)
        #expect(ReminderNotification.owner(ofIdentifier: "mm.reminder..daily") == nil)
        #expect(ReminderPlan.isOurs("mm.reminder.x.daily") && !ReminderPlan.isOurs("mm.reminders.x") && !ReminderPlan.isOurs("x.mm.reminder."))
    }
}

/// Replacing everything Numbite scheduled, against a notification centre in memory.
@MainActor
struct ReminderSchedulerTests {
    private func london() throws -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/London"))
        return calendar
    }

    private func makeScheduler(_ center: FakeNotificationCenter) throws -> UserNotificationScheduler {
        let calendar = try london()
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 10, day: 16, hour: 12)))
        return UserNotificationScheduler(center: center, now: { now }, calendar: { calendar })
    }

    private func item(_ id: String, ring: ReminderPlanItem.Ring = .daily, hour: Int = 8) -> ReminderPlanItem {
        ReminderPlanItem(id: id, title: "Reminder \(id)", body: "", hour: hour, minute: 0, ring: ring)
    }

    private func notification(_ identifier: String) -> ReminderNotification {
        ReminderNotification(identifier: identifier, reminderID: "x", title: "t", body: "b", timing: .daily(hour: 1, minute: 0))
    }

    @Test func aPlanReplacesOurOldOnesAndLeavesEverythingElse() async throws {
        let center = FakeNotificationCenter(status: .granted)
        center.seed(pending: notification("mm.reminder.old.daily"))
        center.seed(pending: notification("other.thing"))
        center.seed(delivered: "mm.reminder.old.daily")
        center.seed(delivered: "mm.reminder.r1.daily")
        center.seed(delivered: "other.thing")
        let scheduler = try makeScheduler(center)

        await scheduler.replaceReminders([item("r1"), item("r2", ring: .weekdays([2, 5]))])

        #expect(center.pending.keys.sorted() == ["mm.reminder.r1.daily", "mm.reminder.r2.wd2", "mm.reminder.r2.wd5", "other.thing"])
        // a ring on the lock screen goes with a reminder that no longer exists; the one for a reminder that does stays
        #expect(center.delivered == ["mm.reminder.r1.daily", "other.thing"])
        // everything new is added before anything old is taken away: never a moment with nothing scheduled
        let firstRemoval = try #require(center.calls.firstIndex { $0.hasPrefix("remove") })
        #expect(center.calls[..<firstRemoval].allSatisfy { $0.hasPrefix("add ") })
        #expect(center.calls.count - firstRemoval == 2) // the old pending one, the old delivered one
    }

    @Test func anEmptyPlanCancelsEveryReminder() async throws {
        let center = FakeNotificationCenter(status: .granted)
        center.seed(pending: notification("other.thing"))
        center.seed(delivered: "other.thing")
        let scheduler = try makeScheduler(center)
        await scheduler.replaceReminders([item("r1"), item("r2", ring: .weekdays([3]))])
        #expect(center.pending.count == 3)

        await scheduler.replaceReminders([])

        #expect(center.pending.keys.sorted() == ["other.thing"])
        #expect(center.delivered == ["other.thing"])
    }

    @Test func sendingThePlanAgainChangesNothing() async throws {
        let center = FakeNotificationCenter(status: .granted)
        let scheduler = try makeScheduler(center)
        let plan = [item("r1"), item("r2", ring: .weekdays([2, 5]))]
        await scheduler.replaceReminders(plan)
        let after = center.pending
        let calls = center.calls.count
        await scheduler.replaceReminders(plan)
        #expect(center.pending == after)
        #expect(center.calls.dropFirst(calls).allSatisfy { $0.hasPrefix("add ") }) // adds again (replacing in place), nothing removed
    }

    @Test func aNewTimeReplacesTheOldInPlace() async throws {
        let center = FakeNotificationCenter(status: .granted)
        let scheduler = try makeScheduler(center)
        await scheduler.replaceReminders([item("r1", hour: 8)])
        await scheduler.replaceReminders([item("r1", hour: 9)])
        #expect(center.pending.count == 1)
        #expect(center.pending["mm.reminder.r1.daily"]?.timing == .daily(hour: 9, minute: 0))
    }

    @Test func aDateThatDroppedOutOfTheListIsTakenAway() async throws {
        let center = FakeNotificationCenter(status: .granted)
        let scheduler = try makeScheduler(center)
        let both = ["2026-10-20T09:00", "2026-10-23T09:00"].compactMap { ReminderMoment($0) }
        await scheduler.replaceReminders([item("r3", ring: .oneOffs(both))])
        #expect(center.pending.count == 2)
        await scheduler.replaceReminders([item("r3", ring: .oneOffs(Array(both.dropFirst())))])
        #expect(center.pending.keys.sorted() == ["mm.reminder.r3.at2026-10-23T09:00"])
    }

    @Test func aNotificationTheSystemRefusesDoesNotStopTheRest() async throws {
        let center = FakeNotificationCenter(status: .granted)
        center.refusing = ["mm.reminder.r1.daily"]
        let scheduler = try makeScheduler(center)
        await scheduler.replaceReminders([item("r1"), item("r2")])
        #expect(center.pending.keys.sorted() == ["mm.reminder.r2.daily"])
    }

    @Test func remindersAreScheduledEvenBeforeThePersonHasAnswered() async throws {
        // a notification only shows if they allow it, but one scheduled while "denied" rings if they switch it on later
        for status in [NotificationPermission.notDetermined, .denied] {
            let center = FakeNotificationCenter(status: status)
            let scheduler = try makeScheduler(center)
            await scheduler.replaceReminders([item("r1")])
            #expect(center.pending.keys.sorted() == ["mm.reminder.r1.daily"])
            #expect(center.promptsShown == 0) // scheduling never asks
        }
    }

    @Test func thePromptIsShownOnlyWhileTheAnswerIsUnknown() async throws {
        let allowing = FakeNotificationCenter(status: .notDetermined, answerToPrompt: true)
        let scheduler = try makeScheduler(allowing)
        #expect(await scheduler.status() == .notDetermined)
        #expect(await scheduler.requestPermission() == .granted)
        #expect(await scheduler.requestPermission() == .granted)
        #expect(allowing.promptsShown == 1)

        let refusing = FakeNotificationCenter(status: .notDetermined, answerToPrompt: false)
        let refused = try makeScheduler(refusing)
        #expect(await refused.requestPermission() == .denied)
        #expect(await refused.requestPermission() == .denied)
        #expect(refusing.promptsShown == 1)

        let alreadyDenied = FakeNotificationCenter(status: .denied)
        let denied = try makeScheduler(alreadyDenied)
        #expect(await denied.requestPermission() == .denied) // iOS can't ask again: the page shows its "open Settings" line
        #expect(alreadyDenied.promptsShown == 0)
    }

    @Test func theFiveIosStatesBecomeThree() {
        #expect(NotificationPermission(.authorized) == .granted)
        #expect(NotificationPermission(.provisional) == .granted)
        #expect(NotificationPermission(.ephemeral) == .granted)
        #expect(NotificationPermission(.denied) == .denied)
        #expect(NotificationPermission(.notDetermined) == .notDetermined)
    }

    @Test func aReminderThatComesDueWhileTheAppIsOpenIsShown() {
        let options = ReminderNotificationDelegate.presentation(forIdentifier: "mm.reminder.r1.daily")
        #expect(options.contains(.banner) && options.contains(.sound) && options.contains(.list))
        #expect(!options.contains(.badge))
        #expect(ReminderNotificationDelegate.presentation(forIdentifier: "something.else").isEmpty)
    }
}

/// The page's four reminder requests and the app's answers.
@MainActor
struct ReminderBridgeTests {
    private func msg(_ body: [String: Any]) -> Any { body }

    private func makeBridge(_ notifications: FakeNotificationScheduler) -> NativeBridge {
        NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(),
            appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(), notifications: notifications
        )
    }

    @Test func theRequestsTheWebAppSends() {
        #expect(BridgeRequest(body: msg(["id": "n-1", "action": "notifications.requestPermission", "payload": [String: Any]()])) == .notificationPermission(id: "n-1"))
        #expect(BridgeRequest(body: msg(["id": "n-2", "action": "notifications.status"])) == .notificationStatus(id: "n-2"))
        #expect(BridgeRequest(body: msg(["id": "n-3", "action": "notifications.openSettings", "payload": [String: Any]()])) == .openNotificationSettings(id: "n-3"))
        let plan: [String: Any] = ["items": [["id": "r1", "title": "Morning reminder", "body": "", "hour": 8, "minute": 0] as [String: Any], "junk"] as [Any]]
        let request = BridgeRequest(body: msg(["id": "n-4", "action": "notifications.syncReminders", "payload": plan]))
        let expected = ReminderPlanItem(id: "r1", title: "Morning reminder", body: "", hour: 8, minute: 0, ring: .daily)
        #expect(request == .syncReminders(id: "n-4", plan: ReminderPlanItem.Parsed(items: [expected], ignored: 1)))
    }

    @Test func aPlanIsNeededForASync() {
        // not a list at all: ignored, so a garbled message can never wipe the reminders
        #expect(BridgeRequest(body: msg(["id": "n-5", "action": "notifications.syncReminders"])) == nil)
        #expect(BridgeRequest(body: msg(["id": "n-5", "action": "notifications.syncReminders", "payload": ["items": "all of them"]])) == nil)
        #expect(BridgeRequest(body: msg(["id": "n-5", "action": "notifications.syncReminders", "payload": ["plan": [Any]()]])) == nil)
        // an empty list is a real plan
        #expect(BridgeRequest(body: msg(["id": "n-6", "action": "notifications.syncReminders", "payload": ["items": [Any]()]]))
                == .syncReminders(id: "n-6", plan: ReminderPlanItem.Parsed(items: [], ignored: 0)))
    }

    @Test func permissionAnswersGoBackToThePage() async {
        let fake = FakeNotificationScheduler(permission: .notDetermined, answerToPrompt: .granted)
        let bridge = makeBridge(fake)
        #expect(await bridge.handle(.notificationStatus(id: "a")) == BridgeReply(permission: "notDetermined"))
        #expect(await bridge.handle(.notificationPermission(id: "b")) == BridgeReply(permission: "granted"))
        #expect(await bridge.handle(.notificationStatus(id: "c")) == BridgeReply(permission: "granted"))
        #expect(fake.promptsShown == 1)

        let refused = makeBridge(FakeNotificationScheduler(permission: .denied))
        #expect(await refused.handle(.notificationPermission(id: "d")) == BridgeReply(permission: "denied"))
    }

    @Test func thePlanIsHandedOverWholeAndSettingsOpen() async {
        let fake = FakeNotificationScheduler()
        let bridge = makeBridge(fake)
        let item = ReminderPlanItem(id: "r1", title: "Morning reminder", body: "", hour: 8, minute: 0, ring: .weekdays([2]))
        #expect(await bridge.handle(.syncReminders(id: "e", plan: ReminderPlanItem.Parsed(items: [item], ignored: 0))) == BridgeReply(done: true))
        #expect(await bridge.handle(.syncReminders(id: "f", plan: ReminderPlanItem.Parsed(items: [], ignored: 0))) == BridgeReply(done: true))
        #expect(fake.plans == [[item], []])
        #expect(await bridge.handle(.openNotificationSettings(id: "g")) == BridgeReply(done: true))
        #expect(fake.settingsOpened == 1)
    }

    @Test func repliesAreSafeJavaScript() throws {
        let script = try #require(BridgeReply(permission: "granted").script(for: "n-1"))
        #expect(script == #"window.__menumathReply && window.__menumathReply("n-1", {"permission":"granted"});"#)
    }
}
