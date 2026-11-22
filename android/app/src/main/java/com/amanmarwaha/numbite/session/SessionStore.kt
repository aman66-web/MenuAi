package com.amanmarwaha.numbite.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import java.io.File
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Where the Android app keeps the account's sign-in (the page's session tokens, web/app/app/_lib/account.ts) so it survives the app being killed
 * (SessionStore.swift: the Keychain on the iPhone). The page kept its tokens only in the web view's own storage, which can lose its newest writes when the system
 * ends the app at once; the renewed token was lost, the old one refused and the person signed out. This is written at once, encrypted with a key that never leaves
 * the phone's Keystore, kept in the app's private storage and excluded from backup.
 */
interface SessionStoring {
    /** The page's saved session text, or null when there is none (or it can't be read). */
    fun load(): String?
    /** Keeps `value`, or forgets the session when it is null (signing out, deleting the account). */
    fun save(value: String?)
}

class KeystoreSessionStore(context: Context) : SessionStoring {
    private val file = File(context.applicationContext.filesDir, "session.bin")
    private val crypto = SessionCrypto(::key)

    @Synchronized
    override fun load(): String? = try {
        if (!file.isFile) null else crypto.decrypt(file.readBytes()).also { if (it == null) file.delete() }
    } catch (e: Exception) {
        Log.w(TAG, "The saved session could not be read", e)
        null
    }

    @Synchronized
    override fun save(value: String?) {
        try {
            if (value == null) {
                file.delete()
                return
            }
            // written whole to a side file, then moved over the old one: a crash in between leaves the old session, never half of a new one
            val side = File(file.parentFile, "session.bin.tmp")
            side.writeBytes(crypto.encrypt(value))
            if (!side.renameTo(file)) {
                file.delete()
                side.renameTo(file)
            }
        } catch (e: Exception) {
            Log.w(TAG, "The session could not be saved", e)
        }
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val TAG = "NumbiteSession"
        const val PROVIDER = "AndroidKeyStore"
        const val ALIAS = "numbite_session_v1"
    }
}

/** For tests: kept in memory only. */
class InMemorySessionStore(private var value: String? = null) : SessionStoring {
    @Synchronized override fun load(): String? = value
    @Synchronized override fun save(value: String?) { this.value = value }
}
