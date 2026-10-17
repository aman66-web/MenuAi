import Foundation
import Testing
@testable import MenuMacros

/// Opening a friend's invite (web/lib/community/friendCode.ts has the format; docs/APP_BUILD.md the setup).
struct FriendInviteLinkTests {
    /// A friend code as the web app makes one: 8 characters from an alphabet with no 0, O, 1, I or L.
    private let code = "K7M2QXWA"

    private func url(_ address: String) throws -> URL { try #require(URL(string: address)) }

    @Test func theWebsiteLinkOpensTheFriendsPageInsideTheApp() throws {
        let opened = try #require(FriendInviteLink.appURL(for: url("https://numbite.com/f#\(code)")))
        #expect(opened.absoluteString == "app://menumath/app/community/friends#\(code)")
        #expect(opened.scheme == WebAppFiles.scheme && opened.host == WebAppFiles.host)
        #expect(FriendInviteLink.appURL(for: try url("https://www.numbite.com/f/#\(code)"))?.fragment == code)
        #expect(FriendInviteLink.appURL(for: try url("HTTPS://Numbite.com/f#\(code)"))?.fragment == code)
    }

    @Test func theAppsOwnAddressWorksToo() throws {
        #expect(FriendInviteLink.code(in: try url("numbite://f#\(code)")) == code)
        #expect(FriendInviteLink.code(in: try url("numbite:///f#\(code)")) == code)
        #expect(FriendInviteLink.code(in: try url("NUMBITE://f/#\(code)")) == code)
    }

    @Test func aCodeIsTidiedTheWayTheWebAppTidiesIt() throws {
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#k7m2-qxwa")) == code) // lower case, a hyphen in the middle
        #expect(FriendInviteLink.normalised("K7M2-QXWA") == code)
        #expect(FriendInviteLink.normalised("k7m2qxwa") == code)
    }

    @Test func nothingElseIsOpened() throws {
        #expect(FriendInviteLink.appURL(for: try url("https://numbite.com/f")) == nil) // no code in it
        #expect(FriendInviteLink.appURL(for: try url("https://numbite.com/f#")) == nil)
        #expect(FriendInviteLink.appURL(for: try url("https://numbite.com/privacy#\(code)")) == nil) // another page
        #expect(FriendInviteLink.appURL(for: try url("https://numbite.com/f/more#\(code)")) == nil)
        #expect(FriendInviteLink.appURL(for: try url("https://numbite.com.evil.example/f#\(code)")) == nil) // another site
        #expect(FriendInviteLink.appURL(for: try url("https://evil.example/f#\(code)")) == nil)
        #expect(FriendInviteLink.appURL(for: try url("http://numbite.com/f#\(code)")) == nil) // plain http is never a link of ours
        #expect(FriendInviteLink.appURL(for: try url("numbite://auth?code=\(code)")) == nil) // the sign-in callback
        #expect(FriendInviteLink.appURL(for: try url("numbite://auth#\(code)")) == nil)
        #expect(FriendInviteLink.appURL(for: try url("app://menumath/app/community/friends#\(code)")) == nil) // our own pages aren't "links"
        #expect(FriendInviteLink.appURL(for: try url("https://numbite.com/l#\(code)")) == nil) // a shopping list link is the other parser's
        #expect(FriendInviteLink.appURL(for: try url("javascript:alert(1)")) == nil)
    }

    @Test func theCodeIsExactlyEightCharactersFromTheFriendCodeAlphabet() throws {
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXW")) == nil) // seven
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXWAB")) == nil) // nine
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXW0")) == nil) // 0 is never in a code
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXWO")) == nil) // nor O, 1, I or L
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXW1")) == nil)
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXWL")) == nil)
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2QXW%22")) == nil) // percent-encoded quote
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#K7M2%20QXW")) == nil)
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#%3Cscript%3E")) == nil)
        #expect(FriendInviteLink.code(in: try url("https://numbite.com/f#abcdefgh-_9")) == nil)
    }

    @Test @MainActor func theInboxHoldsTheLatestLinkOfEitherKindAndIgnoresTheRest() throws {
        let inbox = LinkInbox()
        inbox.open(try url("https://numbite.com/privacy"))
        inbox.open(try url("numbite://auth?code=abc"))
        #expect(inbox.request == nil)
        inbox.open(try url("https://numbite.com/f#\(code)"))
        let friend = try #require(inbox.request)
        #expect(friend.url.path == "/app/community/friends")
        #expect(friend.url.fragment == code)
        inbox.open(try url("https://numbite.com/f#\(code)"))
        #expect(inbox.request?.id != friend.id) // the same invite opened again is a new request
        inbox.open(try url("https://numbite.com/privacy")) // a link that isn't ours leaves the waiting one alone
        #expect(inbox.request?.url == friend.url)
        inbox.open(try url("https://numbite.com/l#1AbCdEfW1sidGVzY28iXQ")) // and a shopping list link still opens its own page
        #expect(inbox.request?.url.path == "/app/groceries/list/shared")
    }

    @Test func thePageThePackedAppServesForItExists() throws {
        // The address resolves to the Friends page like any other (web/e2e/serve-app.mjs rules): a file "app/community/friends.html".
        let root = FileManager.default.temporaryDirectory.appending(path: "webapp-\(UUID().uuidString)", directoryHint: .isDirectory)
        let file = root.appending(path: "app/community/friends.html", directoryHint: .notDirectory)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("friends".utf8).write(to: file)
        let opened = try #require(FriendInviteLink.appURL(for: url("https://numbite.com/f#\(code)")))
        #expect(WebAppFiles(root: root).file(for: opened)?.lastPathComponent == "friends.html")
    }
}
