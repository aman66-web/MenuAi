import Foundation

/// The limits and names for reminder notifications. Everything the phone is told comes from the web view's JSON (web/lib/mm/native.ts), and that is
/// never trusted: every field is checked, a bad item is ignored, and counts and lengths are capped here too, whatever the page already did.
nonisolated enum ReminderPlan {
    /// Every notification Numbite schedules has an identifier starting with this: replacing "everything we scheduled" means everything with this prefix.
    static let identifierPrefix = "mm.reminder."
    /// iOS keeps at most 64 pending local notifications per app. The web plan stays under 60; this is the last line of defence.
    static let maxNotifications = 60
    /// The web app allows 12 reminders. More items than this are not a plan we made.
    static let maxItems = 50
    /// Lengths of what shows on the lock screen. The web app already keeps the name to 40 and the note to 120 characters.
    static let maxTitleLength = 100
    static let maxBodyLength = 200
    /// Dates of an "every few days" reminder (the web app sends up to 20).
    static let maxDatesPerItem = 20

    static func isOurs(_ identifier: String) -> Bool { identifier.hasPrefix(identifierPrefix) }
}

/// A local date and time, "YYYY-MM-DDTHH:MM" (the phone's own clock; web/lib/mm/reminders.ts PlanItem.fireAt).
nonisolated struct ReminderMoment: Equatable, Sendable {
    let year: Int
    let month: Int
    let day: Int
    let hour: Int
    let minute: Int

    init(year: Int, month: Int, day: Int, hour: Int, minute: Int) {
        self.year = year
        self.month = month
        self.day = day
        self.hour = hour
        self.minute = minute
    }

    /// Exactly 16 ASCII characters in that shape; anything else is nil. (Whether the day exists, 30 February, is checked in `date(in:)`.)
    init?(_ text: String) {
        let bytes = Array(text.utf8)
        guard bytes.count == 16, bytes[4] == 0x2D, bytes[7] == 0x2D, bytes[10] == 0x54, bytes[13] == 0x3A else { return nil }
        func number(_ range: Range<Int>) -> Int? {
            var value = 0
            for index in range {
                let digit = Int(bytes[index]) - 0x30
                guard (0...9).contains(digit) else { return nil }
                value = value * 10 + digit
            }
            return value
        }
        guard let year = number(0..<4), let month = number(5..<7), let day = number(8..<10), let hour = number(11..<13), let minute = number(14..<16),
              (2000...2200).contains(year), (1...12).contains(month), (1...31).contains(day), (0...23).contains(hour), (0...59).contains(minute)
        else { return nil }
        self.init(year: year, month: month, day: day, hour: hour, minute: minute)
    }

    /// Back to the text it came from, which also names its notification.
    var text: String {
        func two(_ value: Int) -> String { value < 10 ? "0\(value)" : "\(value)" }
        let years = year < 1000 ? "0\(year)" : "\(year)"
        return "\(years)-\(two(month))-\(two(day))T\(two(hour)):\(two(minute))"
    }

    /// The moment on `calendar`'s clock, or nil when that day doesn't exist (30 February comes back from Foundation as 2 March, so the day is compared).
    /// A time that doesn't exist on a real day (inside the hour clocks skip in spring) is left to Foundation; the web app never sends one.
    func date(in calendar: Calendar) -> Date? {
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)) else { return nil }
        let back = calendar.dateComponents([.year, .month, .day], from: date)
        guard back.year == year, back.month == month, back.day == day else { return nil }
        return date
    }
}

/// One reminder as the web app's plan describes it (web/lib/mm/reminders.ts PlanItem), after every field has been checked.
nonisolated struct ReminderPlanItem: Equatable, Sendable {
    /// How it rings. The three are exclusive; a plan item that says two things is refused rather than guessed at.
    nonisolated enum Ring: Equatable, Sendable {
        /// Every day at hour:minute (one repeating notification).
        case daily
        /// Certain days: iOS weekday numbers, 1 = Sunday ... 7 = Saturday, sorted, no repeats (one repeating notification per weekday).
        case weekdays([Int])
        /// "Every few days": the dates the web app worked out (one one-off notification per date). Hour and minute are not used for these.
        case oneOffs([ReminderMoment])
    }

    let id: String
    let title: String
    let body: String
    let hour: Int
    let minute: Int
    let ring: Ring

    /// What `parsePlan` made of the page's list.
    nonisolated struct Parsed: Equatable, Sendable {
        var items: [ReminderPlanItem]
        /// Entries left out because they were not valid reminders (or repeated an id, or came after the 50th).
        var ignored: Int
    }

    /// The page's `items` array. nil when it isn't an array at all (the request is then ignored: it never wipes the reminders on a garbled message).
    /// An empty array is a real plan: no reminders.
    static func parsePlan(_ raw: Any?) -> Parsed? {
        guard let list = raw as? [Any] else { return nil }
        var items: [ReminderPlanItem] = []
        var ignored = 0
        var seen = Set<String>()
        for (index, element) in list.enumerated() {
            if index >= ReminderPlan.maxItems {
                ignored += list.count - index
                break
            }
            guard let dictionary = element as? [String: Any], let item = ReminderPlanItem(payload: dictionary), seen.insert(item.id).inserted else {
                ignored += 1
                continue
            }
            items.append(item)
        }
        return Parsed(items: items, ignored: ignored)
    }

    init(id: String, title: String, body: String, hour: Int, minute: Int, ring: Ring) {
        self.id = id
        self.title = title
        self.body = body
        self.hour = hour
        self.minute = minute
        self.ring = ring
    }

    /// nil when anything is wrong with the item. A weekday or date that is wrong refuses the whole item (ringing on the wrong day is worse than not
    /// ringing, and the page shows its own list either way). Only the text is trimmed: too long a name or note is cut, not refused.
    init?(payload: [String: Any]) {
        guard let id = payload["id"] as? String, Self.isValidID(id),
              let rawTitle = payload["title"] as? String,
              let hour = Self.wholeNumber(payload["hour"]), (0...23).contains(hour),
              let minute = Self.wholeNumber(payload["minute"]), (0...59).contains(minute)
        else { return nil }
        let title = Self.clean(rawTitle, limit: ReminderPlan.maxTitleLength)
        guard !title.isEmpty else { return nil }
        let body: String
        switch Self.present(payload["body"]) {
        case nil: body = ""
        case let text as String: body = Self.clean(text, limit: ReminderPlan.maxBodyLength)
        default: return nil
        }

        let weekdays = Self.present(payload["weekdays"])
        let fireAt = Self.present(payload["fireAt"])
        let ring: Ring
        switch (weekdays, fireAt) {
        case (nil, nil):
            ring = .daily
        case (let days?, nil):
            guard let list = days as? [Any], !list.isEmpty, list.count <= 14 else { return nil }
            var numbers = Set<Int>()
            for element in list {
                guard let day = Self.wholeNumber(element), (1...7).contains(day) else { return nil }
                numbers.insert(day)
            }
            ring = .weekdays(numbers.sorted())
        case (nil, let dates?):
            guard let list = dates as? [Any], !list.isEmpty else { return nil }
            var moments: [ReminderMoment] = []
            for element in list.prefix(ReminderPlan.maxDatesPerItem * 2) {
                guard let text = element as? String, let moment = ReminderMoment(text) else { return nil }
                if !moments.contains(moment) { moments.append(moment) }
            }
            ring = .oneOffs(Array(moments.prefix(ReminderPlan.maxDatesPerItem)))
        default:
            return nil // both weekdays and dates
        }
        self.init(id: id, title: title, body: body, hour: hour, minute: minute, ring: ring)
    }

    /// The web app's ids: letters, digits, "-" and "_", 1 to 64 long. No ".", so an identifier "mm.reminder.<id>.<kind>" can always be read back.
    static func isValidID(_ id: String) -> Bool {
        (1...64).contains(id.utf8.count) && id.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_")
        }
    }

    /// JSON null counts as "not there".
    private static func present(_ value: Any?) -> Any? {
        value is NSNull ? nil : value
    }

    /// A whole number sent as a number. A JavaScript `true` arrives as a number 1 in WebKit's bridge, so booleans are refused; so is 8.5.
    private static func wholeNumber(_ value: Any?) -> Int? {
        guard let value, !(value is NSNull) else { return nil }
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
        return value as? Int
    }

    /// What goes on a lock screen: real control characters (line breaks, tabs) and the line and paragraph separators become spaces, ends trimmed, then cut
    /// to whole characters. The invisible joiners and the left/right marks (Unicode category Cf: U+200C, U+200D, U+200E, U+200F, U+061C) are KEPT, as in
    /// web/lib/mm/reminders.ts: Persian, Urdu and Indic words and emoji sequences need them, and a name the person typed correctly must reach the lock
    /// screen unchanged (`CharacterSet.controlCharacters` also holds category Cf, so it is not used here). The page has already taken out the hidden
    /// characters that can change reading order or hide text.
    static func clean(_ text: String, limit: Int) -> String {
        let space = Unicode.Scalar(UInt8(ascii: " "))
        var spaced = String.UnicodeScalarView()
        for scalar in text.unicodeScalars {
            switch scalar.properties.generalCategory {
            case .control, .lineSeparator, .paragraphSeparator:
                spaced.append(space)
            default:
                spaced.append(scalar)
            }
        }
        return String(String(spaced).trimmingCharacters(in: .whitespacesAndNewlines).prefix(limit))
    }
}

/// One notification to schedule: what it says and when it rings.
nonisolated struct ReminderNotification: Equatable, Sendable {
    nonisolated enum Timing: Equatable, Sendable {
        /// Every day at this time on the phone's clock (follows the phone to a new time zone).
        case daily(hour: Int, minute: Int)
        /// Every week on this iOS weekday (1 = Sunday ... 7 = Saturday).
        case weekly(weekday: Int, hour: Int, minute: Int)
        /// Once, at this moment (worked out on the phone's clock when the plan was made).
        case once(Date)
    }

    /// "mm.reminder.<reminder id>.<kind>": the same text for the same notification every time, so sending a plan again replaces it, never doubles it.
    let identifier: String
    let reminderID: String
    let title: String
    let body: String
    let timing: Timing

    /// The reminder id inside one of our identifiers; nil for anything else.
    static func owner(ofIdentifier identifier: String) -> String? {
        guard ReminderPlan.isOurs(identifier) else { return nil }
        let id = identifier.dropFirst(ReminderPlan.identifierPrefix.count).prefix { $0 != "." }
        return id.isEmpty ? nil : String(id)
    }
}

/// The notifications a plan turns into.
nonisolated struct ReminderSchedule: Equatable, Sendable {
    var notifications: [ReminderNotification]
    /// Reminders left out whole because the notifications were used up (a reminder never rings on only some of its days).
    var leftOutForRoom: Int
    /// Dates of "every few days" reminders that are already past or not real days.
    var unusableDates: Int

    /// `calendar` is the phone's Gregorian calendar on its current time zone (dates in a plan are written that way whatever calendar the phone shows).
    /// The reminders are taken in order; one that wouldn't fit in the notifications left is left out whole and the next, smaller one is tried.
    static func make(for items: [ReminderPlanItem], now: Date, calendar: Calendar, limit: Int = ReminderPlan.maxNotifications) -> ReminderSchedule {
        var notifications: [ReminderNotification] = []
        var leftOutForRoom = 0
        var unusableDates = 0
        for item in items {
            func notification(_ kind: String, _ timing: ReminderNotification.Timing) -> ReminderNotification {
                ReminderNotification(identifier: ReminderPlan.identifierPrefix + item.id + "." + kind, reminderID: item.id, title: item.title, body: item.body, timing: timing)
            }
            var group: [ReminderNotification] = []
            switch item.ring {
            case .daily:
                group = [notification("daily", .daily(hour: item.hour, minute: item.minute))]
            case .weekdays(let days):
                group = days.map { notification("wd\($0)", .weekly(weekday: $0, hour: item.hour, minute: item.minute)) }
            case .oneOffs(let moments):
                for moment in moments {
                    guard let date = moment.date(in: calendar), date > now else {
                        unusableDates += 1
                        continue
                    }
                    group.append(notification("at" + moment.text, .once(date)))
                }
            }
            if group.isEmpty { continue }
            if notifications.count + group.count > limit {
                leftOutForRoom += 1
                continue
            }
            notifications.append(contentsOf: group)
        }
        return ReminderSchedule(notifications: notifications, leftOutForRoom: leftOutForRoom, unusableDates: unusableDates)
    }
}
