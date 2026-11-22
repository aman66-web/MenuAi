#!/usr/bin/env bash
# Makes the upload key for Google Play, once. INTERACTIVE: keytool asks YOU for the password (twice) and for the name fields. Nothing here ever sees, stores or
# prints the password, and Claude never runs this script.
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
cat <<MSG

Done: $keystore
Next, make the file Gradle reads, $dir/keystore.properties, with a text editor (it is NOT in the repository), exactly four lines:

  storeFile=$keystore
  storePassword=<the password you just typed>
  keyAlias=upload
  keyPassword=<the same password, unless you typed a different one for the key>

then lock it:  chmod 600 $dir/keystore.properties

After that ./scripts/build_android.sh aab builds a signed bundle. In Google Play Console choose "Use Play App Signing" (the default) when you upload the first bundle:
Google then holds the real signing key and this one is only the upload key. Print its fingerprint for Play Console if it asks:
  $JAVA_HOME/bin/keytool -list -v -keystore $keystore -alias upload   (it asks for the password)
MSG
