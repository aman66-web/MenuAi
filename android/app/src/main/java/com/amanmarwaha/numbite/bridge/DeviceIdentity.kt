package com.amanmarwaha.numbite.bridge

import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

/**
 * The phone's identity for the free week (founder, 22 November 2026: stop a second free week on the same phone, as Apple's DeviceCheck does on an iPhone). The page asks
 * for it with `device.id` (web/lib/mm/native.ts) only while the server may still start a week for the account; the answer is a one-way hash, and the Android ID itself
 * never leaves the phone. Our server hashes that again with a secret of its own and keeps only the result, to stop a second free week (web/lib/payments/freeWeek.ts).
 */
interface DeviceIdentifying {
    /** 64 lower-case hex characters, or null when the phone has no usable Android ID. */
    fun deviceHash(): String?
}

object DeviceHash {
    /** The text that goes in front of the Android ID, so the hash can't be matched against anyone else's use of it. */
    const val PREFIX = "numbite-device:"

    /** SHA-256 of [PREFIX] + the Android ID as 64 lower-case hex characters; null for no ID or a blank one. */
    fun of(androidId: String?): String? {
        val id = androidId?.trim().orEmpty()
        if (id.isEmpty()) return null
        val digest = MessageDigest.getInstance("SHA-256").digest((PREFIX + id).toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}

/**
 * `Settings.Secure.ANDROID_ID`: on Android 8 and later one value for each app signing key, user and phone. It stays when the app is deleted and installed again, and
 * changes only when the phone is reset to factory settings. (Google's own "device recall" would last through a reset too, but it is a closed beta for apps with production
 * usage, which Numbite does not have yet.)
 */
class AndroidDeviceIdentity(private val context: Context) : DeviceIdentifying {
    override fun deviceHash(): String? =
        DeviceHash.of(Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID))
}
