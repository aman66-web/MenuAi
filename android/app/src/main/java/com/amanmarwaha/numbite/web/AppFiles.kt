package com.amanmarwaha.numbite.web

/**
 * How an address on the app's own origin finds one of the packed web app's files: exactly BundleSchemeHandler.swift / WebAppFiles.swift on the iPhone, and
 * web/e2e/serve-app.mjs which the browser tests use. The query and the "#" never reach here; then the exact file, then "<path>.html", then
 * "<path>/index.html"; anything else is the not-found page. Pure Kotlin so it is unit-tested without a phone.
 */
object AppFiles {
    /**
     * The files to try, in order, for the part of the address after the host ("app/settings", "", "app/"), as paths inside the packed folder. Null when the
     * path tries to leave the folder (".." or "." parts, a backslash, a NUL): that is a not-found page, never a file.
     */
    fun candidates(path: String): List<String>? {
        val parts = path.split('/').filter { it.isNotEmpty() }
        if (parts.any { it == ".." || it == "." || it.contains('\\') || it.contains('\u0000') }) return null
        if (parts.isEmpty()) return listOf("index.html")
        val base = parts.joinToString("/")
        return if (path.endsWith("/")) listOf("$base/index.html", "$base.html") else listOf(base, "$base.html", "$base/index.html")
    }

    /** The first candidate `open` can open (it returns null for a missing file or a folder), with what it opened; null when none opens. */
    fun <T> resolve(path: String, open: (String) -> T?): Pair<String, T>? {
        for (candidate in candidates(path) ?: return null) {
            val opened = open(candidate) ?: continue
            return candidate to opened
        }
        return null
    }

    /** The Content-Type for a file name: as WebAppFiles.mimeType on the iPhone, plus the few types a newer pack could hold. */
    fun mimeType(name: String): String = when (name.substringAfterLast('/').substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html; charset=utf-8"
        "txt" -> "text/plain; charset=utf-8"
        "js", "mjs" -> "text/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "json", "map" -> "application/json"
        "webmanifest" -> "application/manifest+json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "avif" -> "image/avif"
        "gif" -> "image/gif"
        "ico" -> "image/x-icon"
        "woff2" -> "font/woff2"
        "woff" -> "font/woff"
        "ttf" -> "font/ttf"
        "wasm" -> "application/wasm"
        "xml" -> "application/xml"
        else -> "application/octet-stream"
    }

    /** Splits "type; charset=x" into the two parts WebResourceResponse wants (it takes the type and the encoding apart). */
    fun typeOnly(contentType: String): String = contentType.substringBefore(';').trim()
    fun charsetOf(contentType: String): String? = contentType.substringAfter("charset=", "").trim().ifEmpty { null }
}
