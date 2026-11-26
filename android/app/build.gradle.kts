import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: the founder's upload key, described in ~/.numbite-android/keystore.properties (storeFile, storePassword, keyAlias, keyPassword). That file
// is made by the founder (scripts/android_make_upload_key.sh tells him how) and never lives in the repository. Without it the release build is still made,
// unsigned, so nothing here can fail for want of a key. Nothing from the file is ever printed.
val keystoreProperties = Properties().apply {
    val file = File(System.getProperty("user.home"), ".numbite-android/keystore.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}
val canSignRelease = listOf("storeFile", "storePassword", "keyAlias", "keyPassword").all { !keystoreProperties.getProperty(it).isNullOrBlank() } &&
    File(keystoreProperties.getProperty("storeFile").orEmpty()).isFile

android {
    namespace = "com.amanmarwaha.numbite"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.amanmarwaha.numbite"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.1"
    }

    signingConfigs {
        if (canSignRelease) {
            create("upload") {
                storeFile = File(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (canSignRelease) signingConfig = signingConfigs.getByName("upload")
        }
    }

    androidResources {
        // The packed web app (assets/WebApp, made by scripts/build_android_web.sh) has folders that start with an underscore (_next, _not-found). aapt's default
        // pattern silently drops those, which would leave the app with no scripts at all; keep every file but the junk a version-control tool leaves.
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~"
        // Already-compressed files are stored as they are (they are read back on every page load).
        noCompress += listOf("webp", "woff2")
    }
    testOptions {
        // Log.w and friends do nothing in plain JVM tests instead of throwing
        unitTests.isReturnDefaultValues = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.browser:browser:1.9.0")
    // Google's own barcode scanner screen (no camera permission in our app; Google Play services shows it): the Android twin of the iPhone's VisionKit scanner
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // Google's own in-app review pop-up (the page asks only after someone rated the app 5); the Android twin of Apple's requestReview
    implementation("com.google.android.play:review-ktx:2.0.2")
    implementation("com.android.billingclient:billing-ktx:8.0.0")
    // Steps (founder approved 2026-11-26, CLAUDE.md rule 6): Google Play services' on-phone step recording, the Recording API on mobile (FitnessLocal, no
    // Google account, ten days kept on the phone, nothing sent). Only the Local* classes are used (bridge/PlayStepRecorder.kt); never Google Fit's cloud APIs.
    implementation("com.google.android.gms:play-services-fitness:21.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation("junit:junit:4.13.2")
    // Android's own org.json is only a stub in plain JVM tests; this is the same API for the unit tests (test only, never in the app).
    testImplementation("org.json:json:20250517")
}
