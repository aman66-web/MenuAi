import AuthenticationServices
import UIKit

/// What signing in through the secure browser sheet (Google) ended with.
nonisolated enum WebSignInOutcome: Equatable, Sendable {
    /// The one-time code from numbite://auth?code=... and the PKCE verifier this app made for it. Both go to our API's /auth/exchange.
    case code(authCode: String, verifier: String)
    case cancelled
    case unavailable

    /// Reads where the sheet finished (`numbite://auth?code=...` or `numbite://auth?error=...`).
    static func parse(callback: URL?, error: Error?, verifier: String) -> WebSignInOutcome {
        if let failure = error as? ASWebAuthenticationSessionError, failure.code == .canceledLogin { return .cancelled }
        guard error == nil, let callback, callback.scheme == AppConfig.authCallbackScheme,
              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems else { return .unavailable }
        if items.first(where: { $0.name == "error" })?.value == "cancelled" { return .cancelled }
        guard let code = items.first(where: { $0.name == "code" })?.value, isPlausibleCode(code) else { return .unavailable }
        return .code(authCode: code, verifier: verifier)
    }

    /// Our sealed one-time code is long URL-safe text; anything else isn't ours.
    static func isPlausibleCode(_ code: String) -> Bool {
        code.count >= 40 && code.count <= 8192 && code.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }
}

/// Google blocks its sign-in page inside an app's own web view, so the app opens numbite.com's sign-in in the iPhone's secure browser sheet.
/// That page ends on numbite://auth?code=..., which the sheet hands straight back (no URL scheme to register for this).
protocol WebSigningIn {
    func signIn(provider: String) async -> WebSignInOutcome
}

final class AuthenticationSessionWebSignIn: NSObject, WebSigningIn, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func signIn(provider: String) async -> WebSignInOutcome {
        guard provider == "google" || provider == "apple" else { return .unavailable }
        let verifier = AuthSecrets.randomURLSafe(byteCount: 48)
        var components = URLComponents(url: AppConfig.apiBaseURL.appending(path: "auth/\(provider)/start"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "mode", value: "app"), URLQueryItem(name: "challenge", value: AuthSecrets.sha256Base64URL(verifier))]
        guard let url = components?.url else { return .unavailable }
        return await withCheckedContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: AppConfig.authCallbackScheme) { [weak self] callback, error in
                let outcome = WebSignInOutcome.parse(callback: callback, error: error, verifier: verifier)
                Task { @MainActor in self?.session = nil }
                continuation.resume(returning: outcome)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                continuation.resume(returning: .unavailable)
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

/// For previews and tests.
struct FakeWebSignIn: WebSigningIn {
    var outcome: WebSignInOutcome = .cancelled
    func signIn(provider: String) async -> WebSignInOutcome { outcome }
}
