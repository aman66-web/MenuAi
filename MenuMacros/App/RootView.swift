import SwiftUI

/// The free launch (founder 2026-10-12): the whole app is the web app packed inside it (Features/WebApp, docs/APP_BUILD.md), full screen.
/// Its own tab bar, screens and eleven languages come from the web app; the iPhone adds the scanner, location and share sheet.
struct RootView: View {
    @Environment(AppEnvironment.self) private var environment
    private let files: WebAppFiles?

    init(files: WebAppFiles? = WebAppFiles()) {
        self.files = files
    }

    var body: some View {
        if files != nil {
            WebAppView(files: files, environment: environment)
                .ignoresSafeArea()
        } else {
            // Only seen in a build made without running scripts/build_app_web.sh first.
            ContentUnavailableView(
                "The app's pages are missing",
                systemImage: "shippingbox",
                description: Text("Run scripts/build_app_web.sh, then build again in Xcode (docs/APP_BUILD.md).")
            )
        }
    }
}

#Preview("Pages missing") {
    RootView(files: nil)
        .environment(AppEnvironment.preview())
}

#Preview("App") {
    RootView()
        .environment(AppEnvironment.preview())
}
