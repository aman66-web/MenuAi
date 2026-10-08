import SwiftUI

/// The four tabs (docs/SPEC.md §8): Home · Saved · Today · Settings. Placeholder screens until their milestones (M3, M7).
struct RootView: View {
    private var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(AppConfig.appName) \(version) (\(build))"
    }

    var body: some View {
        TabView {
            PlaceholderScreen(title: "Home", message: "Restaurants, search and nearby chains arrive in the next milestones.", systemImage: "house")
                .tabItem { Label("Home", systemImage: "house") }
            PlaceholderScreen(title: "Saved", message: "Your saved orders will live here.", systemImage: "bookmark")
                .tabItem { Label("Saved", systemImage: "bookmark") }
            PlaceholderScreen(title: "Today", message: "What you've eaten today will live here.", systemImage: "clock")
                .tabItem { Label("Today", systemImage: "clock") }
            PlaceholderScreen(title: "Settings", message: "Targets, preferences and help will live here.", systemImage: "gearshape", footer: versionText)
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

#Preview {
    RootView()
        .environment(AppEnvironment())
}
