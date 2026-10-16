import SwiftUI

@main
struct MenuMacrosApp: App {
    @State private var environment = AppEnvironment.live()

    init() {
        // A reminder that comes due while the app is open is shown too (Services/ReminderNotificationDelegate.swift). Once, as the app starts.
        ReminderNotificationDelegate.install()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                // A shared shopping list: numbite://l#… and, once the Associated Domains capability is on, https://numbite.com/l#… (docs/APP_BUILD.md)
                .onOpenURL { environment.links.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let link = activity.webpageURL { environment.links.open(link) }
                }
        }
    }
}
