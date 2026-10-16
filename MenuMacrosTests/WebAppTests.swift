import Foundation
import Testing
@testable import MenuMacros

/// The packed web app's file lookup (the same rules as web/e2e/serve-app.mjs) and the bridge messages (web/lib/mm/native.ts).
struct WebAppFilesTests {
    /// A tiny export: index.html, app.html, app/chain.html, app/chain.txt, _next/x.js, 404.html, and an "app" folder.
    private func makeExport() throws -> WebAppFiles {
        let root = FileManager.default.temporaryDirectory.appending(path: "webapp-\(UUID().uuidString)", directoryHint: .isDirectory)
        for path in ["index.html", "app.html", "app/chain.html", "app/chain.txt", "_next/static/x.js", "404.html", "logos/kfc.png"] {
            let file = root.appending(path: path, directoryHint: .notDirectory)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(path.utf8).write(to: file)
        }
        return WebAppFiles(root: root)
    }

    private func name(_ files: WebAppFiles, _ address: String) -> String? {
        guard let url = URL(string: address), let file = files.file(for: url) else { return nil }
        return String(file.path(percentEncoded: false).dropFirst(files.root.path(percentEncoded: false).count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    @Test func pagesAndFilesAreFoundTheWayTheBrowserTestsServeThem() throws {
        let files = try makeExport()
        #expect(name(files, "app://menumath/app") == "app.html") // "app" is also a folder: the page wins
        #expect(name(files, "app://menumath/app/") == "app.html")
        #expect(name(files, "app://menumath/app/chain?id=kfc") == "app/chain.html")
        #expect(name(files, "app://menumath/app/chain.txt?_rsc=1") == "app/chain.txt")
        #expect(name(files, "app://menumath/") == "index.html")
        #expect(name(files, "app://menumath/_next/static/x.js") == "_next/static/x.js")
        #expect(name(files, "app://menumath/logos/kfc.png") == "logos/kfc.png")
        #expect(name(files, "app://menumath/nothing-here") == nil)
        #expect(files.notFoundPage != nil)
    }

    @Test func nothingOutsideThePackedFolderAndNoOtherHost() throws {
        let files = try makeExport()
        #expect(name(files, "app://menumath/../etc/passwd") == nil)
        #expect(name(files, "app://menumath/app/%2E%2E/%2E%2E/secret") == nil)
        #expect(name(files, "app://elsewhere/app") == nil)
        #expect(name(files, "https://menumath/app") == nil)
    }

    @Test func contentTypes() {
        #expect(WebAppFiles.mimeType(for: URL(filePath: "/a/b.html")) == "text/html; charset=utf-8")
        #expect(WebAppFiles.mimeType(for: URL(filePath: "/a/b.js")) == "text/javascript; charset=utf-8")
        #expect(WebAppFiles.mimeType(for: URL(filePath: "/a/b.webp")) == "image/webp")
        #expect(WebAppFiles.mimeType(for: URL(filePath: "/a/b.woff2")) == "font/woff2")
        #expect(WebAppFiles.mimeType(for: URL(filePath: "/a/b.unknown")) == "application/octet-stream")
    }
}

struct BridgeMessageTests {
    /// A message as WebKit hands it over (an NSDictionary from the page's JavaScript object).
    private func msg(_ body: [String: Any]) -> Any { body }

    @Test func theRequestsTheWebAppSends() {
        #expect(BridgeRequest(body: msg(["id": "abc-1", "action": "scan", "payload": [String: Any]()])) == .scan(id: "abc-1"))
        #expect(BridgeRequest(body: msg(["id": "abc-2", "action": "locate", "payload": ["onlyIfAllowed": true]])) == .locate(id: "abc-2", onlyIfAllowed: true))
        #expect(BridgeRequest(body: msg(["id": "abc-3", "action": "share", "payload": ["title": "Shopping list", "text": "Milk"]]))
                == .share(id: "abc-3", content: ShareContent(title: "Shopping list", text: "Milk")))
    }

    @Test func theSignInRequests() {
        #expect(BridgeRequest(body: msg(["id": "a-1", "action": "appleSignIn", "payload": [String: Any]()])) == .appleSignIn(id: "a-1"))
        #expect(BridgeRequest(body: msg(["id": "w-1", "action": "webAuth", "payload": ["provider": "google"]])) == .webAuth(id: "w-1", provider: "google"))
        // only the providers we offer, and only with a provider named
        #expect(BridgeRequest(body: msg(["id": "w-2", "action": "webAuth", "payload": ["provider": "facebook"]])) == nil)
        #expect(BridgeRequest(body: msg(["id": "w-3", "action": "webAuth", "payload": [String: Any]()])) == nil)
        #expect(BridgeRequest(body: msg(["id": "w-4", "action": "webAuth", "payload": ["provider": "https://evil.example"]])) == nil)
    }

    @Test func anythingElseIsIgnored() {
        #expect(BridgeRequest(body: msg(["id": "x", "action": "deleteEverything"])) == nil)
        #expect(BridgeRequest(body: msg(["id": "<script>", "action": "scan"])) == nil)
        #expect(BridgeRequest(body: msg(["action": "scan"])) == nil)
        #expect(BridgeRequest(body: "scan") == nil)
        #expect(BridgeRequest(body: msg(["id": "x", "action": "share", "payload": ["text": ""]])) == nil)
        #expect(BridgeRequest(body: msg(["id": "x", "action": "share", "payload": ["text": "a", "imageDataUrl": "data:text/html;base64,AAAA"]])) == nil)
    }

    @Test func aShareCardPictureIsDecoded() {
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        let request = BridgeRequest(body: msg(["id": "s", "action": "share", "payload": ["text": "My order", "imageDataUrl": "data:image/png;base64," + png.base64EncodedString()]]))
        #expect(request == .share(id: "s", content: ShareContent(text: "My order", image: png)))
    }

    @Test func repliesAreSafeJavaScript() throws {
        let script = try #require(BridgeReply(code: "5000157024671").script(for: "abc-1"))
        #expect(script == #"window.__menumathReply && window.__menumathReply("abc-1", {"code":"5000157024671"});"#)
        let denied = try #require(BridgeReply.failure("denied").script(for: "a\"b"))
        #expect(denied.contains(#""a\"b""#)) // the id is JSON-escaped
    }

    @Test @MainActor func theBridgeUsesTheServices() async {
        let bridge = NativeBridge(
            scanner: FakeBarcodeScanner(outcome: .code("12345678")), location: FakeLocationService(outcome: .denied), sharer: FakeShareService(completes: false),
            appleSignIn: FakeAppleSignIn(), webSignIn: FakeWebSignIn(), notifications: FakeNotificationScheduler()
        )
        #expect(await bridge.handle(.scan(id: "a")) == BridgeReply(code: "12345678"))
        #expect(await bridge.handle(.locate(id: "b", onlyIfAllowed: true)) == .failure("denied"))
        #expect(await bridge.handle(.share(id: "c", content: ShareContent(text: "x"))) == .failure("cancelled"))
    }

    @Test @MainActor func signInAnswersGoBackToThePage() async throws {
        let signedIn = NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(),
            appleSignIn: FakeAppleSignIn(outcome: .token(idToken: "aaa.bbb.ccc", nonce: "n0nceN0nceN0nce", authorizationCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv.k3v6J0sdsfDzwEl7ZmYMpw")),
            webSignIn: FakeWebSignIn(outcome: .code(authCode: String(repeating: "A", count: 60), verifier: String(repeating: "v", count: 64))),
            notifications: FakeNotificationScheduler()
        )
        #expect(await signedIn.handle(.appleSignIn(id: "a")) == BridgeReply(idToken: "aaa.bbb.ccc", nonce: "n0nceN0nceN0nce", appleCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv.k3v6J0sdsfDzwEl7ZmYMpw"))
        #expect(await signedIn.handle(.webAuth(id: "b", provider: "google")) == BridgeReply(authCode: String(repeating: "A", count: 60), verifier: String(repeating: "v", count: 64)))
        let script = try #require(BridgeReply(idToken: "aaa.bbb.ccc", nonce: "n0nceN0nceN0nce").script(for: "a-1"))
        #expect(script.contains(#""idToken":"aaa.bbb.ccc""#))

        let backedOut = NativeBridge(
            scanner: FakeBarcodeScanner(), location: FakeLocationService(), sharer: FakeShareService(),
            appleSignIn: FakeAppleSignIn(outcome: .cancelled), webSignIn: FakeWebSignIn(outcome: .unavailable), notifications: FakeNotificationScheduler()
        )
        #expect(await backedOut.handle(.appleSignIn(id: "a")) == .failure("cancelled"))
        #expect(await backedOut.handle(.webAuth(id: "b", provider: "google")) == .failure("unavailable"))
    }
}

/// The small secrets sign-in needs, and reading where the secure browser sheet finished (docs/ACCOUNTS_SYNC.md).
struct SignInTests {
    @Test func theFingerprintMatchesTheRFC7636Example() {
        // RFC 7636 appendix B: this verifier must give exactly this challenge (the server uses the same rule, web/lib/auth/pkce.ts)
        #expect(AuthSecrets.sha256Base64URL("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        #expect(AuthSecrets.sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func randomSecretsAreLongUrlSafeAndDifferent() {
        let a = AuthSecrets.randomURLSafe(byteCount: 48)
        let b = AuthSecrets.randomURLSafe(byteCount: 48)
        #expect(a.count == 64) // 48 bytes -> 64 characters, the verifier length the server accepts (43 to 128)
        #expect(a != b)
        #expect(a.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") })
        #expect(AuthSecrets.randomURLSafe(byteCount: 32).count == 43)
    }

    @Test func theBrowserSheetsAnswerIsReadCarefully() {
        let verifier = String(repeating: "v", count: 64)
        let code = String(repeating: "Ab-_9", count: 20)
        let ok = URL(string: "numbite://auth?code=\(code)")
        #expect(WebSignInOutcome.parse(callback: ok, error: nil, verifier: verifier) == .code(authCode: code, verifier: verifier))
        #expect(WebSignInOutcome.parse(callback: URL(string: "numbite://auth?error=cancelled"), error: nil, verifier: verifier) == .cancelled)
        #expect(WebSignInOutcome.parse(callback: URL(string: "numbite://auth?error=failed"), error: nil, verifier: verifier) == .unavailable)
        #expect(WebSignInOutcome.parse(callback: URL(string: "numbite://auth?code=short"), error: nil, verifier: verifier) == .unavailable)
        #expect(WebSignInOutcome.parse(callback: URL(string: "https://evil.example/?code=\(code)"), error: nil, verifier: verifier) == .unavailable)
        #expect(WebSignInOutcome.parse(callback: nil, error: nil, verifier: verifier) == .unavailable)
    }
}
