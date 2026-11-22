#!/usr/bin/env bash
# Builds the Android app (docs/ANDROID_BUILD.md):
#   ./scripts/build_android.sh debug          a debug APK (debuggable, the fake purchase service available): android/app/build/outputs/apk/debug/app-debug.apk
#   ./scripts/build_android.sh apk            a release APK, signed with the upload key when ~/.numbite-android/keystore.properties exists, unsigned otherwise
#   ./scripts/build_android.sh aab            the release App Bundle Google Play takes: android/app/build/outputs/bundle/release/app-release.aab (same signing rule)
#   add --no-web to skip packing the web app again (it is packed by scripts/build_android_web.sh, which needs NEXT_PUBLIC_SUPPORT_EMAIL: the address the live site shows)
#   NEXT_PUBLIC_SUPPORT_EMAIL=you@yourdomain ./scripts/build_android.sh aab
# The release key is made once with scripts/android_make_upload_key.sh; this script never reads or prints a password.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"

target="${1:-}"
case "$target" in
  debug) task=":app:assembleDebug" ;;
  apk)   task=":app:assembleRelease" ;;
  aab)   task=":app:bundleRelease" ;;
  *) echo "Usage: $0 debug|apk|aab [--no-web]" >&2; exit 2 ;;
esac
shift
web=1
for arg in "$@"; do
  case "$arg" in
    --no-web) web=0 ;;
    *) echo "Unknown option $arg" >&2; exit 2 ;;
  esac
done

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
if [ ! -x "$JAVA_HOME/bin/java" ]; then echo "No JDK 21 at $JAVA_HOME (brew install openjdk@21), or set JAVA_HOME. Android Studio's own JDK 25 does not work with this Gradle." >&2; exit 1; fi
if [ ! -d "$ANDROID_HOME/platforms" ]; then echo "No Android SDK at $ANDROID_HOME, or set ANDROID_HOME." >&2; exit 1; fi

if [ "$web" = "1" ]; then
  "$here/scripts/build_android_web.sh"
elif [ ! -f "$here/android/app/src/main/assets/WebApp/app.html" ]; then
  echo "--no-web, but android/app/src/main/assets/WebApp has no packed web app: run without --no-web first." >&2
  exit 1
fi

if [ "$target" != "debug" ]; then
  props="$HOME/.numbite-android/keystore.properties"
  if [ -f "$props" ]; then
    echo "Release build: signing with the upload key described in $props."
  else
    echo "Release build: $props is missing, so this build is UNSIGNED (fine to test, Google Play will not take it). Make the key with scripts/android_make_upload_key.sh." >&2
  fi
fi

cd "$here/android"
./gradlew "$task" --console=plain

case "$target" in
  debug) out="app/build/outputs/apk/debug/app-debug.apk" ;;
  apk)   out="$(ls app/build/outputs/apk/release/*.apk | head -1)" ;;
  aab)   out="app/build/outputs/bundle/release/app-release.aab" ;;
esac
echo "Built $here/android/$out ($(du -h "$out" | cut -f1))"
