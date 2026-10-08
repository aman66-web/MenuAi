import Foundation

/// Fixed values the app needs (docs/SPEC.md §17). The URLs stay example.com placeholders until the site's address is final:
/// while they are placeholders, menu sync is skipped and submissions stay queued in the outbox.
nonisolated enum AppConfig {
    static let appName = "Menu Math"   // user-facing name; keep in sync with web/site.config.ts and docs/STORE.md
    static let websiteURL = URL(string: "https://example.com")!
    static let menuBaseURL = URL(string: "https://example.com/menus/")!
    static let apiBaseURL = URL(string: "https://example.com/api/v1/")!
    static let menuSyncInterval: TimeInterval = 6 * 60 * 60
    static let supportEmail = "support@example.com"
    static let privacyPolicyURL = URL(string: "https://example.com/privacy")!
    static let supportURL = URL(string: "https://example.com/support")!
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let appGroupID = "group.com.amanmarwaha.menumacros"
    static let yearlyProductID = "com.amanmarwaha.menumacros.pro.yearly"
    static let monthlyProductID = "com.amanmarwaha.menumacros.pro.monthly"
    static let freeSavedOrderLimit = 3
    static let newItemDays = 30
}
