package com.amanmarwaha.numbite.web

import android.content.res.AssetManager
import android.util.Log
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import com.amanmarwaha.numbite.AppConfig
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream

/**
 * Serves the packed web app (assets/WebApp) to the web view on https://appassets.androidplatform.net/..., so the app opens and works with no connection
 * (the Android twin of BundleSchemeHandler.swift). The routing is [AppFiles]. Registered for the whole origin ("/"), so it never answers anything for another host.
 */
class AppAssetHandler(private val assets: AssetManager) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? = try {
        val found = AppFiles.resolve(path) { open(it) }
        if (found != null) response(found.first, found.second, 200, "OK") else notFound()
    } catch (e: Exception) {
        Log.e(TAG, "Could not serve a packed file", e)
        notFound()
    }

    private fun open(relative: String): InputStream? = try {
        assets.open("${AppConfig.ASSET_ROOT}/$relative", AssetManager.ACCESS_STREAMING)
    } catch (_: FileNotFoundException) {
        null // missing, or a folder
    } catch (_: IOException) {
        null
    }

    private fun notFound(): WebResourceResponse {
        val page = open("404.html")
        return if (page != null) response("404.html", page, 404, "Not Found")
        else response("missing.html", ByteArrayInputStream(MISSING_PAGE.toByteArray()), 404, "Not Found")
    }

    private fun response(name: String, body: InputStream, status: Int, reason: String): WebResourceResponse {
        val contentType = AppFiles.mimeType(name)
        return WebResourceResponse(
            AppFiles.typeOnly(contentType), AppFiles.charsetOf(contentType), status, reason,
            mapOf("Cache-Control" to "no-cache"), body,
        )
    }

    private companion object {
        const val TAG = "NumbiteAssets"
        /** Only seen in a build made without the pack (scripts/build_android.sh packs it). */
        const val MISSING_PAGE = "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Numbite</title>" +
            "<body style=\"font:16px sans-serif;padding:24px\">The app's pages are missing from this build. Run scripts/build_android.sh to pack them.</body>"
    }
}
