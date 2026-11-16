// Makes the key pair that signs and checks paid-access tokens (docs/PAYMENTS.md). Run it ONCE, on YOUR Mac, in Terminal, from the repo folder:
//   node tools/payments/make_entitlement_key.mjs
// - The PUBLIC key is written into web/lib/payments/entitlement-public-key.json (safe to share: it can only check a token, never make one). Commit that file;
//   the website and the iPhone app's build read it from there.
// - The PRIVATE key is put on the clipboard and printed nowhere. Paste it straight into Vercel > Project menumacros > Settings > Environment Variables as
//   ENTITLEMENT_PRIVATE_JWK (Sensitive, Production and Preview), then copy something else so it leaves the clipboard. Never paste it anywhere else, chats included.
// Making a new pair later signs everyone out of paid access until their devices restore it, so the tool refuses to replace a key unless you add --replace.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../../web/lib/payments/entitlement-public-key.json", import.meta.url));
const existing = JSON.parse(readFileSync(file, "utf8"));
if (existing.kty && !process.argv.includes("--replace")) {
  console.error("A key already exists (web/lib/payments/entitlement-public-key.json). Making a new one signs everyone out of paid access; add --replace if you really mean it.");
  process.exit(1);
}
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = await crypto.subtle.exportKey("jwk", publicKey);
const priv = await crypto.subtle.exportKey("jwk", privateKey);
execFileSync("pbcopy", { input: JSON.stringify(priv) });
writeFileSync(file, JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2) + "\n");
console.log("Public key saved in web/lib/payments/entitlement-public-key.json.");
console.log("The private key is on your clipboard: paste it into Vercel as ENTITLEMENT_PRIVATE_JWK (Sensitive), then copy something else.");
