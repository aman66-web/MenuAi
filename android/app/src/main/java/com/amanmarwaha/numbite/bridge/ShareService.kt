package com.amanmarwaha.numbite.bridge

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File

/** The text (and, for an order, the picture) to put in the share sheet (ShareContent in BridgeMessages.swift). */
data class ShareContent(val title: String?, val text: String, val image: ByteArray?) {
    override fun equals(other: Any?): Boolean =
        other is ShareContent && title == other.title && text == other.text && (image?.contentEquals(other.image ?: ByteArray(0)) ?: (other.image == null))
    override fun hashCode(): Int = 31 * (31 * (title?.hashCode() ?: 0) + text.hashCode()) + (image?.contentHashCode() ?: 0)

    companion object {
        const val MAX_TEXT_LENGTH = 20_000
        const val MAX_IMAGE_BYTES = 4_000_000
        const val IMAGE_PREFIX = "data:image/png;base64,"
    }
}

interface Sharing {
    /** True when the share sheet was shown, false when it couldn't be (no app can take it). Android does not say whether the person finished, so "shown" is the answer. */
    suspend fun share(content: ShareContent): Boolean
}

/** Android's own share sheet (ACTION_SEND through the chooser). The picture is written to the app's cache and handed over by the FileProvider (xml/file_paths.xml). */
class IntentShareService(private val context: Context, private val activityProvider: () -> Activity?) : Sharing {
    override suspend fun share(content: ShareContent): Boolean = try {
        val send = Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_TEXT, content.text)
        content.title?.takeIf { it.isNotBlank() }?.let { send.putExtra(Intent.EXTRA_SUBJECT, it) }
        if (content.image != null) {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", writeImage(content.image))
            send.type = "image/png"
            send.putExtra(Intent.EXTRA_STREAM, uri)
            send.clipData = ClipData.newRawUri("", uri)
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            send.type = "text/plain"
        }
        val chooser = Intent.createChooser(send, content.title?.takeIf { it.isNotBlank() })
        val host = activityProvider()
        if (host != null) {
            host.startActivity(chooser)
        } else {
            context.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        true
    } catch (e: Exception) {
        Log.w(TAG, "Could not open the share sheet", e)
        false
    }

    private fun writeImage(bytes: ByteArray): File {
        val folder = File(context.cacheDir, "share").apply { mkdirs() }
        folder.listFiles()?.forEach { it.delete() } // only the newest picture is kept
        return File(folder, "numbite-${System.currentTimeMillis()}.png").also { it.writeBytes(bytes) }
    }

    private companion object { const val TAG = "NumbiteShare" }
}
