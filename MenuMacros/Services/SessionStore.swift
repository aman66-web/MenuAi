import Foundation
import OSLog
import Security

/// Where the iPhone app keeps the account's sign-in (the page's session tokens, web/app/app/_lib/account.ts) so it survives the app being killed.
/// Founder 2026-11-18: "It always goes to this screen whenever you do the new build" — the page kept its tokens only in the web view's own storage, which
/// can lose its newest writes when iOS ends the app at once (an install, an update, a crash); the renewed token was lost, the old one was refused and the
/// person was signed out. The Keychain is written at once and kept on this iPhone only. Nothing here reads the tokens: it holds the page's text as given.
protocol SessionStoring: Sendable {
    /// The page's saved session text, or nil when there is none.
    func load() -> String?
    /// Keeps `value` (or forgets the session when it is nil: signing out, deleting the account).
    func save(_ value: String?)
}

/// The real one: one generic-password item in this app's Keychain, readable after the first unlock, never synced to iCloud or another device.
nonisolated struct KeychainSessionStore: SessionStoring {
    private let service = "com.amanmarwaha.MenuMacros.session"
    private let account = "account-session"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    func load() -> String? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            if status != errSecItemNotFound { Logger.account.error("Keychain read failed: \(status)") }
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    func save(_ value: String?) {
        guard let value else {
            let status = SecItemDelete(query as CFDictionary)
            if status != errSecSuccess && status != errSecItemNotFound { Logger.account.error("Keychain delete failed: \(status)") }
            return
        }
        let data = Data(value.utf8)
        let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let status = SecItemAdd(add as CFDictionary, nil)
            if status != errSecSuccess { Logger.account.error("Keychain add failed: \(status)") }
        } else if update != errSecSuccess {
            Logger.account.error("Keychain update failed: \(update)")
        }
    }
}

/// For tests and previews: kept in memory only.
final class InMemorySessionStore: SessionStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?

    init(_ value: String? = nil) { self.value = value }

    func load() -> String? { lock.withLock { value } }
    func save(_ value: String?) { lock.withLock { self.value = value } }
}
