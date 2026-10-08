import SwiftUI

struct PreviewRootView: View {
    var body: some View {
        if let url = PreviewConfig.siteURL {
            WebView(url: url)
                .ignoresSafeArea()
        } else {
            ContentUnavailableView(
                "Set the site address",
                systemImage: "link",
                description: Text("Open PreviewConfig.swift and replace REPLACE-ME with your Vercel address, then press Run again.")
            )
        }
    }
}

#Preview("No address set") {
    PreviewRootView()
}
