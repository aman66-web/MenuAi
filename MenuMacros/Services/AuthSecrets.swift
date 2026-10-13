import CryptoKit
import Foundation
import Security

/// The small secrets sign-in needs (docs/ACCOUNTS_SYNC.md): a random string, and its SHA-256 fingerprint.
nonisolated enum AuthSecrets {
    /// `byteCount` random bytes, as URL-safe text (no padding): 48 bytes make the 64-character PKCE verifier, 32 the Apple nonce.
    static func randomURLSafe(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        precondition(status == errSecSuccess, "The system could not make random bytes")
        return base64URL(Data(bytes))
    }

    /// PKCE (RFC 7636) "S256": base64url(SHA-256(verifier)). The page keeps the verifier; only this fingerprint goes in the sign-in address.
    static func sha256Base64URL(_ text: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(text.utf8))))
    }

    /// What Apple wants in `request.nonce`: the hex SHA-256 of the raw nonce. Apple puts it in the identity token; we send the raw one on.
    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
