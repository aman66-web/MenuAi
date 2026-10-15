import Foundation
import Testing
@testable import MenuMacros

/// Opening a shopping list a friend shared (web/lib/mm/shareList.ts has the format; docs/APP_BUILD.md the setup).
struct SharedListLinkTests {
    /// What the web app makes: "1", a six character check, then base64url text.
    private let code = "1AbCdEf" + "W1sidGVzY28iLFsiczI3MjQwNzU1OCIsWyJzMSIsMl1dXV0"

    private func url(_ address: String) throws -> URL { try #require(URL(string: address)) }

    @Test func theWebsiteLinkOpensThePageInsideTheApp() throws {
        let opened = try #require(SharedListLink.appURL(for: url("https://numbite.com/l#\(code)")))
        #expect(opened.absoluteString == "app://menumath/app/groceries/list/shared#\(code)")
        #expect(opened.scheme == WebAppFiles.scheme && opened.host == WebAppFiles.host)
        #expect(SharedListLink.appURL(for: try url("https://www.numbite.com/l/#\(code)"))?.fragment == code)
        #expect(SharedListLink.appURL(for: try url("HTTPS://Numbite.com/l#\(code)"))?.fragment == code)
    }

    @Test func theAppsOwnAddressWorksToo() throws {
        #expect(SharedListLink.code(in: try url("numbite://l#\(code)")) == code)
        #expect(SharedListLink.code(in: try url("numbite:///l#\(code)")) == code)
        #expect(SharedListLink.code(in: try url("NUMBITE://l/#\(code)")) == code)
    }

    @Test func nothingElseIsOpened() throws {
        #expect(SharedListLink.appURL(for: try url("https://numbite.com/l")) == nil) // no list in it
        #expect(SharedListLink.appURL(for: try url("https://numbite.com/l#")) == nil)
        #expect(SharedListLink.appURL(for: try url("https://numbite.com/privacy#\(code)")) == nil) // another page
        #expect(SharedListLink.appURL(for: try url("https://numbite.com/l/more#\(code)")) == nil)
        #expect(SharedListLink.appURL(for: try url("https://numbite.com.evil.example/l#\(code)")) == nil) // another site
        #expect(SharedListLink.appURL(for: try url("https://evil.example/l#\(code)")) == nil)
        #expect(SharedListLink.appURL(for: try url("http://numbite.com/l#\(code)")) == nil) // plain http is never a link of ours
        #expect(SharedListLink.appURL(for: try url("numbite://auth?code=\(code)")) == nil) // the sign-in callback
        #expect(SharedListLink.appURL(for: try url("numbite://auth#\(code)")) == nil)
        #expect(SharedListLink.appURL(for: try url("app://menumath/app/groceries/list/shared#\(code)")) == nil) // our own pages aren't "links"
        #expect(SharedListLink.appURL(for: try url("javascript:alert(1)")) == nil)
    }

    @Test func theCodeIsOnlyTheCharactersAListUses() throws {
        #expect(SharedListLink.code(in: try url("https://numbite.com/l#abc")) == nil) // too short to be a list
        #expect(SharedListLink.code(in: try url("https://numbite.com/l#abcdefgh%22%3E%3Cscript%3E")) == nil) // percent-encoded quotes and tags
        #expect(SharedListLink.code(in: try url("https://numbite.com/l#abcdefgh+/=")) == nil)
        #expect(SharedListLink.code(in: try url("https://numbite.com/l#abcdefgh-_9")) == "abcdefgh-_9")
        #expect(SharedListLink.code(in: try url("https://numbite.com/l#" + String(repeating: "a", count: SharedListLink.maxCodeLength))) != nil)
        #expect(SharedListLink.code(in: try url("https://numbite.com/l#" + String(repeating: "a", count: SharedListLink.maxCodeLength + 1))) == nil)
    }

    @Test @MainActor func theInboxHoldsTheLatestListLinkAndIgnoresTheRest() throws {
        let inbox = LinkInbox()
        #expect(inbox.request == nil)
        inbox.open(try url("https://numbite.com/privacy"))
        inbox.open(try url("numbite://auth?code=abc"))
        #expect(inbox.request == nil)
        inbox.open(try url("https://numbite.com/l#\(code)"))
        let first = try #require(inbox.request)
        #expect(first.url.fragment == code)
        inbox.open(try url("https://numbite.com/l#\(code)"))
        #expect(inbox.request?.id != first.id) // the same link opened again is a new request
        inbox.open(try url("https://numbite.com/privacy")) // a link that isn't ours leaves the waiting one alone
        #expect(inbox.request?.url == first.url)
    }

    @Test func theWebViewLoadsEachRequestOnceAndOnlyWhenItIsNotAlreadyShowing() throws {
        let page = try url("app://menumath/app/groceries/list/shared#\(code)")
        let request = LinkInbox.Request(id: UUID(), url: page)
        #expect(LinkInbox.shouldLoad(nil, lastHandled: nil, showing: nil) == false)
        #expect(LinkInbox.shouldLoad(request, lastHandled: nil, showing: WebAppFiles.startURL))
        #expect(LinkInbox.shouldLoad(request, lastHandled: request.id, showing: WebAppFiles.startURL) == false) // already handled
        #expect(LinkInbox.shouldLoad(request, lastHandled: UUID(), showing: page) == false) // already on that page (the same link arrived twice)
        let again = LinkInbox.Request(id: UUID(), url: page)
        #expect(LinkInbox.shouldLoad(again, lastHandled: request.id, showing: WebAppFiles.startURL)) // tapped again after leaving it
    }

    @Test func thePageThePackedAppServesForItExists() throws {
        // The address resolves to the shared-list page like any other (web/e2e/serve-app.mjs rules): a file "app/groceries/list/shared.html".
        let root = FileManager.default.temporaryDirectory.appending(path: "webapp-\(UUID().uuidString)", directoryHint: .isDirectory)
        let file = root.appending(path: "app/groceries/list/shared.html", directoryHint: .notDirectory)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("shared".utf8).write(to: file)
        let opened = try #require(SharedListLink.appURL(for: url("https://numbite.com/l#\(code)")))
        #expect(WebAppFiles(root: root).file(for: opened)?.lastPathComponent == "shared.html")
    }
}
