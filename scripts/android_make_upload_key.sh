#!/usr/bin/env bash
# Makes the upload key for Google Play, once. INTERACTIVE: keytool asks YOU for the password (twice) and for the name fields, and the script asks you once more to save it for the build. Nothing here is ever seen by Claude and Claude never runs it.
#   ./scripts/android_make_upload_key.sh
# It writes ~/.numbite-android/upload.keystore (alias "upload", RSA 2048, valid about 27 years). BACK THAT FILE UP (a password manager's file store, an
# encrypted drive): without it you cannot upload updates under this key (Google can reset an upload key, but it takes days).
set -euo pipefail
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
dir="$HOME/.numbite-android"
keystore="$dir/upload.keystore"
if [ ! -x "$JAVA_HOME/bin/keytool" ]; then echo "keytool not found at $JAVA_HOME/bin (brew install openjdk@21)." >&2; exit 1; fi
if [ -e "$keystore" ]; then echo "$keystore already exists. Refusing to replace it (a new key would not match the one Google Play knows). Move it away yourself if you really mean to." >&2; exit 1; fi
mkdir -p "$dir"
chmod 700 "$dir"
echo "keytool will now ask for a password. Choose a long one and keep it in your password manager. Press Enter on the same password for the key itself when asked."
"$JAVA_HOME/bin/keytool" -genkeypair -v -keystore "$keystore" -alias upload -keyalg RSA -keysize 2048 -validity 10000
chmod 600 "$keystore"
echo
echo "Now type the same password once more so the build can sign bundles for you (it is saved only in $dir/keystore.properties, readable only by you; nothing is shown)."
read -r -s -p "Password: " pw
echo
read -r -s -p "Again: " pw2
echo
if [ -z "$pw" ] || [ "$pw" != "$pw2" ]; then echo "The two passwords differ (or are empty). Run keytool's key again later, or write $dir/keystore.properties by hand (see docs/ANDROID_BUILD.md)." >&2; exit 1; fi
umask 077
printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=upload\nkeyPassword=%s\n' "$keystore" "$pw" "$pw" > "$dir/keystore.properties"
chmod 600 "$dir/keystore.properties"
unset pw pw2
cat <<MSG

Done: $keystore and $dir/keystore.properties (keep the password in your password manager and back both files up).
Then tell Claude "the key is made": it builds the signed bundle with ./scripts/build_android.sh aab and uploads it. In Google Play Console keep "Use Play App Signing" (the default):
Google then holds the real signing key and this one is only the upload key.
MSG
