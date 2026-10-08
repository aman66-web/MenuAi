import SwiftUI

/// A stand-in for a screen that arrives in a later milestone (docs/BUILD_PLAN.md). Replaced one by one as the milestones land.
struct PlaceholderScreen: View {
    let title: String
    let message: String
    let systemImage: String
    var footer: String?

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label(title, systemImage: systemImage)
            } description: {
                VStack(spacing: 8) {
                    Text(message)
                    if let footer {
                        Text(footer)
                            .font(.footnote)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(title)
        }
    }
}

#Preview {
    PlaceholderScreen(title: "Home", message: "Restaurants and search arrive in a later milestone.", systemImage: "house", footer: "Version 1.0 (1)")
}
