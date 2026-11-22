package com.amanmarwaha.numbite.web

import android.Manifest
import android.net.Uri
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import com.amanmarwaha.numbite.AppConfig
import com.amanmarwaha.numbite.bridge.PermissionBroker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * What the page may ask the phone for, and only the app's own page: the camera for its barcode scanner and photo screens (after Android's own camera question, once), a
 * photo field, and the position for the map when it isn't asking the app. The microphone, and every other page or frame, is refused (WebAppView.swift's
 * decideMediaCapturePermissionsFor).
 */
class NumbiteChromeClient(
    private val permissions: PermissionBroker,
    private val files: FileChooser,
    private val scope: CoroutineScope,
) : WebChromeClient() {

    private fun isOurs(origin: Uri?): Boolean = origin != null && BridgeHost.isOurOrigin(origin)

    override fun onPermissionRequest(request: PermissionRequest) {
        val wantsCameraOnly = request.resources.isNotEmpty() && request.resources.all { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
        if (!isOurs(request.origin) || !wantsCameraOnly) {
            request.deny()
            return
        }
        scope.launch {
            try {
                if (permissions.request(Manifest.permission.CAMERA)) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
            } catch (_: IllegalStateException) {
                // the page went away while the question was open
            }
        }
    }

    override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback) {
        val ours = origin != null && runCatching { isOurs(Uri.parse(origin)) }.getOrDefault(false)
        if (!ours) {
            callback.invoke(origin, false, false)
            return
        }
        scope.launch {
            // approximate position only, and only once the person has said yes in Android's own question
            val granted = permissions.request(Manifest.permission.ACCESS_COARSE_LOCATION)
            callback.invoke(origin, granted, false)
        }
    }

    override fun onShowFileChooser(webView: WebView, filePathCallback: ValueCallback<Array<Uri>>, fileChooserParams: FileChooserParams): Boolean =
        files.show(filePathCallback, fileChooserParams)

    // a full-screen request (a video) is not something the app's pages make
    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
        callback?.onCustomViewHidden()
    }

    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
        if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.w("NumbitePage", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
        return true
    }
}
