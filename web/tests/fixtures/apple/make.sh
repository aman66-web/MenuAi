#!/bin/sh
# Makes the throwaway certificates and keys that tests/applePurchase.test.ts uses to stand in for Apple's.
# TEST ONLY: none of these keys or certificates is Apple's, none is used outside the tests, and they can be regenerated at any time:
#   sh web/tests/fixtures/apple/make.sh
# Works with OpenSSL 3 and macOS's LibreSSL. Only the leaf's and the Xcode stand-in's private keys are kept (the tests sign with them);
# the other keys are thrown away once their certificates are made.
set -eu

OUT="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DAYS=36500

cat > "$WORK/ext.cnf" <<'CNF'
[root]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash

[int]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
1.2.840.113635.100.6.2.1 = ASN1:NULL

[int_no_oid]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid

[int_not_ca]
basicConstraints = critical, CA:FALSE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
1.2.840.113635.100.6.2.1 = ASN1:NULL

[leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
1.2.840.113635.100.6.11.1 = ASN1:NULL

[leaf_no_oid]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid

[xcode]
basicConstraints = critical, CA:TRUE
keyUsage = critical, digitalSignature, keyCertSign
subjectKeyIdentifier = hash
CNF

key() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1" 2>/dev/null; }
csr() { openssl req -new -key "$1" -subj "$2" -out "$3"; }
# self-signed: key, subject, section, serial, out
selfsign() {
  csr "$1" "$2" "$WORK/self.csr"
  openssl x509 -req -in "$WORK/self.csr" -signkey "$1" -sha256 -days "$DAYS" -set_serial "$4" -extfile "$WORK/ext.cnf" -extensions "$3" -out "$5" 2>/dev/null
}
# signed by a CA: key, subject, section, serial, ca cert, ca key, out
issue() {
  csr "$1" "$2" "$WORK/issue.csr"
  openssl x509 -req -in "$WORK/issue.csr" -CA "$5" -CAkey "$6" -sha256 -days "$DAYS" -set_serial "$4" -extfile "$WORK/ext.cnf" -extensions "$3" -out "$7" 2>/dev/null
}

key "$WORK/root.key"
key "$WORK/other-root.key"
key "$WORK/int.key"
key "$WORK/int-imposter.key"
key "$OUT/leaf.key"
key "$OUT/xcode.key"

selfsign "$WORK/root.key" "/CN=Numbite Test Root/O=Numbite tests" root 1 "$OUT/root.pem"
selfsign "$WORK/other-root.key" "/CN=Unrelated Test Root/O=Somebody else" root 2 "$OUT/other-root.pem"
issue "$WORK/int.key" "/CN=Numbite Test Intermediate/O=Numbite tests" int 3 "$OUT/root.pem" "$WORK/root.key" "$OUT/int.pem"
# The same intermediate (same name, same key) without Apple's intermediate marker.
issue "$WORK/int.key" "/CN=Numbite Test Intermediate/O=Numbite tests" int_no_oid 4 "$OUT/root.pem" "$WORK/root.key" "$OUT/int-no-oid.pem"
# The same intermediate (same name, same key, marker included) that says it is not a certificate authority.
issue "$WORK/int.key" "/CN=Numbite Test Intermediate/O=Numbite tests" int_not_ca 9 "$OUT/root.pem" "$WORK/root.key" "$OUT/int-not-ca.pem"
# Same name as the real intermediate, marker included, but a different key: it did not sign the leaf.
issue "$WORK/int-imposter.key" "/CN=Numbite Test Intermediate/O=Numbite tests" int 5 "$OUT/root.pem" "$WORK/root.key" "$OUT/int-imposter.pem"
issue "$OUT/leaf.key" "/CN=Numbite Test Leaf/O=Numbite tests" leaf 6 "$OUT/int.pem" "$WORK/int.key" "$OUT/leaf.pem"
# The same leaf (same name, same key) without Apple's leaf marker.
issue "$OUT/leaf.key" "/CN=Numbite Test Leaf/O=Numbite tests" leaf_no_oid 7 "$OUT/int.pem" "$WORK/int.key" "$OUT/leaf-no-oid.pem"
# Stands in for the certificate Xcode signs local StoreKit test purchases with.
selfsign "$OUT/xcode.key" "/CN=StoreKit Testing in Xcode (Numbite stand-in)" xcode 8 "$OUT/xcode.pem"

echo "Made test-only certificates in $OUT"
