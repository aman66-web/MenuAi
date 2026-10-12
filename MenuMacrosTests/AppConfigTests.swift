import Testing
@testable import MenuMacros

struct AppConfigTests {
    @Test func appNameMatchesTheWebsite() {
        #expect(AppConfig.appName == "Menu Math")
    }

    @Test func theWebAppStartsOnTheAppsOwnScheme() {
        // web/lib/cors.ts lets exactly this origin call the API on the live website
        #expect(AppConfig.webAppStartURL.absoluteString == "app://menumath/app")
        #expect(WebAppFiles.scheme == "app" && WebAppFiles.host == "menumath")
    }
}
