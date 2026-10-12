import XCTest

/// The app opens on the packed web app with no connection needed (docs/APP_BUILD.md): its first screen is "Choose your language".
final class MenuMacrosUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunchShowsTheWebAppsFirstScreen() throws {
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 10), "the web view is missing")
        XCTAssertTrue(web.staticTexts["Choose your language"].waitForExistence(timeout: 15), "the first screen didn't load from the app")
    }
}
