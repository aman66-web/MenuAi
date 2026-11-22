package com.amanmarwaha.numbite

/** The fixed addresses and names of the app (the Android twin of MenuMacros/App/AppConfig.swift). Nothing secret lives here: no key of any kind. */
object AppConfig {
    /** The packed web app is served from the app's own assets at this origin (WebViewAssetLoader); our API's CORS allow-list accepts exactly it (web/lib/cors.ts). */
    const val APP_HOST = "appassets.androidplatform.net"
    const val APP_ORIGIN = "https://$APP_HOST"
    const val START_URL = "$APP_ORIGIN/app"

    /** Where the packed web app sits inside the APK's assets (scripts/build_android_web.sh). */
    const val ASSET_ROOT = "WebApp"

    /** Our API on the live website: the only thing the app calls besides the menus and photos it loads from the site. */
    const val API_BASE = "https://numbite.com/api/v1/"

    /** Where the sign-in tab ends (numbite://auth?code=...); also on Supabase's Redirect URLs list (docs/ACCOUNTS_SYNC.md). */
    const val AUTH_CALLBACK_SCHEME = "numbite"

    /** The website's hosts: a shared shopping list or a friend's invite on one of them opens in the app. */
    val WEBSITE_HOSTS = setOf("numbite.com", "www.numbite.com")

    /** Google Play: one subscription with two base plans; the page names a plan "<subscription>:<base plan>" (docs/ANDROID_BRIDGE.md). */
    const val PREMIUM_SUBSCRIPTION_ID = "com.amanmarwaha.numbite.premium"
    val IAP_PRODUCT_IDS = setOf("$PREMIUM_SUBSCRIPTION_ID:annual", "$PREMIUM_SUBSCRIPTION_ID:monthly")
}
