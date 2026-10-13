import AuthenticationServices
import UIKit

/// What Sign in with Apple ended with.
nonisolated enum AppleSignInOutcome: Equatable, Sendable {
    /// Apple's identity token (a signed JWT) and the raw nonce whose hash is inside it. Both go to our API, never anywhere else.
    case token(idToken: String, nonce: String)
    case cancelled
    /// Apple's sheet couldn't be shown, or answered without a token.
    case unavailable
}

/// The iPhone's own "Sign in with Apple" sheet. Needs the Sign in with Apple capability on the app target (Xcode › Signing & Capabilities).
protocol AppleSigningIn {
    func signIn() async -> AppleSignInOutcome
}

final class AuthorizationAppleSignIn: AppleSigningIn {
    private var coordinator: AppleSignInCoordinator?

    func signIn() async -> AppleSignInOutcome {
        let nonce = AuthSecrets.randomURLSafe(byteCount: 32)
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        request.nonce = AuthSecrets.sha256Hex(nonce)
        return await withCheckedContinuation { continuation in
            let coordinator = AppleSignInCoordinator(nonce: nonce) { [weak self] outcome in
                self?.coordinator = nil
                continuation.resume(returning: outcome)
            }
            self.coordinator = coordinator
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = coordinator
            controller.presentationContextProvider = coordinator
            controller.performRequests()
        }
    }
}

private final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let nonce: String
    private let finish: (AppleSignInOutcome) -> Void

    init(nonce: String, finish: @escaping (AppleSignInOutcome) -> Void) {
        self.nonce = nonce
        self.finish = finish
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken, let token = String(data: data, encoding: .utf8) else {
            finish(.unavailable)
            return
        }
        finish(.token(idToken: token, nonce: nonce))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let failure = error as? ASAuthorizationError, failure.code == .canceled {
            finish(.cancelled)
        } else {
            finish(.unavailable)
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

/// For previews and tests.
struct FakeAppleSignIn: AppleSigningIn {
    var outcome: AppleSignInOutcome = .cancelled
    func signIn() async -> AppleSignInOutcome { outcome }
}
