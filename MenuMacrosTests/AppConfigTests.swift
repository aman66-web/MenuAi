import Testing
@testable import MenuMacros

struct AppConfigTests {
    @Test func appNameMatchesTheWebsite() {
        #expect(AppConfig.appName == "Menu Math")
    }

    @Test func freeTierAllowsThreeSavedOrders() {
        #expect(AppConfig.freeSavedOrderLimit == 3)
    }
}
