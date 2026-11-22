package com.amanmarwaha.numbite.web

import android.Manifest
import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.ComponentActivity
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import com.amanmarwaha.numbite.bridge.PermissionBroker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.io.File

/**
 * The page's photo fields (an image file input, `accept` set to the image types): Scan your food, Make it at home, a report's photo, a barcode photo. Two kinds in the page:
 *  - with `capture` ("Take a photo"): the camera app takes one into the app's cache (asking for the camera first, since the app has the permission in its
 *    manifest; without it the person is shown their photos instead);
 *  - without: Android's photo picker (no storage permission needed on Android 13+; Google Play's backport on 11 and 12, the document picker before that).
 * Anything that isn't an image field gets the system's own file chooser. Must be made while the activity is being created.
 */
class FileChooser(private val activity: ComponentActivity, private val permissions: PermissionBroker, private val scope: CoroutineScope) {
    private var callback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null

    private val pickOne = activity.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { finish(it?.let { uri -> arrayOf(uri) }) }
    private val pickMany = activity.registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_PICKS)) { finish(it.takeIf { list -> list.isNotEmpty() }?.toTypedArray()) }
    private val takePicture = activity.registerForActivityResult(ActivityResultContracts.TakePicture()) { taken -> finish(if (taken) cameraUri?.let { arrayOf(it) } else null) }
    private val anyFile = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        finish(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
    }

    /** Shows the right chooser for `params`. Returns false when it can't (the page then gets nothing, and the field simply stays empty). */
    fun show(filePathCallback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        callback?.onReceiveValue(null) // a field still waiting is answered "nothing chosen" before a new one starts
        callback = filePathCallback
        val types = params.acceptTypes.map { it.trim() }.filter { it.isNotEmpty() }
        val imagesOnly = types.isNotEmpty() && types.all { it.startsWith("image/") }
        try {
            when {
                imagesOnly && params.isCaptureEnabled -> scope.launch { takeOrPick() }
                imagesOnly && params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE -> pickMany.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                imagesOnly -> pickOne.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                else -> anyFile.launch(params.createIntent())
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not show a file chooser", e)
            finish(null)
            return false
        }
        return true
    }

    /** The page went away (or a new page loaded): a field still waiting must be answered or it never takes another. */
    fun cancel() = finish(null)

    private suspend fun takeOrPick() {
        try {
            if (permissions.request(Manifest.permission.CAMERA)) {
                val uri = newCameraUri(activity)
                cameraUri = uri
                takePicture.launch(uri)
            } else {
                pickOne.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not open the camera", e)
            finish(null)
        }
    }

    private fun finish(uris: Array<Uri>?) {
        callback?.onReceiveValue(uris)
        callback = null
    }

    companion object {
        private const val TAG = "NumbiteFiles"
        private const val MAX_PICKS = 10

        private fun newCameraUri(context: Context): Uri {
            val folder = File(context.cacheDir, "camera").apply { mkdirs() }
            val file = File(folder, "photo-${System.currentTimeMillis()}.jpg")
            return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        }

        /** Photos taken for the page and pictures made for a share are only ever needed for the moment: emptied at every start. */
        fun clearCache(context: Context) {
            for (name in listOf("camera", "share")) File(context.cacheDir, name).listFiles()?.forEach { it.delete() }
        }
    }
}
