import Foundation

/// Fixed values the app needs (docs/SPEC.md §17). Since the free launch (founder 2026-10-12) the app is the web app packed inside it
/// (docs/APP_BUILD.md): the web app reaches the live website itself (NEXT_PUBLIC_REMOTE_BASE in scripts/build_app_web.sh, numbite.com),
/// so the website addresses below are only for the native screens planned later (docs/BUILD_PLAN.md).
nonisolated enum AppConfig {
    static let appName = "Numbite"   // user-facing name; keep in sync with web/site.config.ts and docs/STORE.md
    /// Where the packed web app starts (Features/WebApp/WebAppFiles.swift). The API on the live website allows this origin (web/lib/cors.ts).
    static let webAppStartURL = URL(string: "app://menumath/app")!
    static let websiteURL = URL(string: "https://numbite.com")!
    static let menuBaseURL = URL(string: "https://numbite.com/menus/")!
    static let apiBaseURL = URL(string: "https://numbite.com/api/v1/")!
    static let menuSyncInterval: TimeInterval = 6 * 60 * 60
    static let supportEmail = "support@example.com"   // placeholder until a numbite.com mailbox exists
    static let privacyPolicyURL = URL(string: "https://numbite.com/privacy")!
    static let supportURL = URL(string: "https://numbite.com/support")!
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let appGroupID = "group.com.amanmarwaha.menumacros"
    static let yearlyProductID = "com.amanmarwaha.menumacros.pro.yearly"
    static let monthlyProductID = "com.amanmarwaha.menumacros.pro.monthly"
    static let freeSavedOrderLimit = 3
    static let newItemDays = 30
}
