package com.amanmarwaha.numbite.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The routing rules must match BundleSchemeHandler.swift / WebAppFiles.swift (and web/e2e/serve-app.mjs). */
class AppFilesTest {
    private val files = setOf("index.html", "app.html", "app/settings.html", "app/index.html", "404.html", "_next/static/a.js", "menus/chains.json", "apple-icon.png", "f.html", "f/x.html")
    private fun resolve(path: String) = AppFiles.resolve(path) { if (it in files) it else null }?.first

    @Test fun rootIsIndex() {
        assertEquals(listOf("index.html"), AppFiles.candidates(""))
        assertEquals(listOf("index.html"), AppFiles.candidates("/"))
        assertEquals("index.html", resolve(""))
    }

    @Test fun extensionlessPathsTryTheFileThenHtmlThenIndex() {
        assertEquals(listOf("app/settings", "app/settings.html", "app/settings/index.html"), AppFiles.candidates("app/settings"))
        assertEquals("app/settings.html", resolve("app/settings"))
        assertEquals("app.html", resolve("app"))
    }

    @Test fun exactFilesWin() {
        assertEquals("_next/static/a.js", resolve("_next/static/a.js"))
        assertEquals("apple-icon.png", resolve("apple-icon.png"))
        assertEquals("menus/chains.json", resolve("menus/chains.json"))
    }

    @Test fun aTrailingSlashMeansADirectory() {
        assertEquals(listOf("app/index.html", "app.html"), AppFiles.candidates("app/"))
        assertEquals("app/index.html", resolve("app/"))
        // a folder named like a page, with a trailing slash: the folder's index first, then the page
        assertEquals("f.html", resolve("f/"))
    }

    @Test fun aFolderWithoutAFileIsNotAFile() {
        // "f" exists as a folder, so it can't be opened (open() answers null for a folder): the .html is used
        assertEquals("f.html", resolve("f"))
    }

    @Test fun missingFilesAreNotFound() {
        assertNull(resolve("nope"))
        assertNull(resolve("app/missing/deeper"))
    }

    @Test fun neverLeavesThePackedFolder() {
        assertNull(AppFiles.candidates("../etc/passwd"))
        assertNull(AppFiles.candidates("app/../../x"))
        assertNull(AppFiles.candidates("a/./b"))
        assertNull(AppFiles.candidates("a\\b"))
        assertNull(AppFiles.candidates("a\u0000b"))
        assertNull(resolve("../index.html"))
    }

    @Test fun doubledSlashesAreIgnoredLikeOnTheIphone() {
        assertEquals(listOf("app/settings", "app/settings.html", "app/settings/index.html"), AppFiles.candidates("app//settings"))
    }

    @Test fun mimeTypes() {
        assertEquals("text/html; charset=utf-8", AppFiles.mimeType("app/index.html"))
        assertEquals("text/plain; charset=utf-8", AppFiles.mimeType("__next.!KHNpdGUp.__PAGE__.txt"))
        assertEquals("text/javascript; charset=utf-8", AppFiles.mimeType("_next/static/chunks/main.js"))
        assertEquals("text/css; charset=utf-8", AppFiles.mimeType("a.css"))
        assertEquals("application/json", AppFiles.mimeType("menus/x.json"))
        assertEquals("application/manifest+json", AppFiles.mimeType("manifest.webmanifest"))
        assertEquals("image/svg+xml", AppFiles.mimeType("a.svg"))
        assertEquals("image/png", AppFiles.mimeType("a.PNG"))
        assertEquals("image/jpeg", AppFiles.mimeType("a.jpg"))
        assertEquals("image/jpeg", AppFiles.mimeType("a.jpeg"))
        assertEquals("image/webp", AppFiles.mimeType("menu-images/kfc/zinger.webp"))
        assertEquals("image/x-icon", AppFiles.mimeType("favicon.ico"))
        assertEquals("font/woff2", AppFiles.mimeType("a.woff2"))
        assertEquals("application/wasm", AppFiles.mimeType("a.wasm"))
        assertEquals("application/octet-stream", AppFiles.mimeType("apple-app-site-association"))
        assertEquals("application/octet-stream", AppFiles.mimeType("dir.with.dots/noext"))
    }

    @Test fun contentTypeIsSplitForWebResourceResponse() {
        assertEquals("text/html", AppFiles.typeOnly("text/html; charset=utf-8"))
        assertEquals("utf-8", AppFiles.charsetOf("text/html; charset=utf-8"))
        assertNull(AppFiles.charsetOf("image/png"))
        assertEquals("image/png", AppFiles.typeOnly("image/png"))
    }
}
