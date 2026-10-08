import XCTest

final class MenuMacrosUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunchShowsTheFourTabs() throws {
        let app = XCUIApplication()
        app.launch()
        for name in ["Home", "Saved", "Today", "Settings"] {
            XCTAssertTrue(app.tabBars.buttons[name].waitForExistence(timeout: 5), "missing tab \(name)")
        }
    }
}
