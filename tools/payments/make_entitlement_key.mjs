// Makes the key pair that signs and checks paid-access tokens (docs/PAYMENTS.md). Run it ONCE, on YOUR Mac, in Terminal, from the repo folder:
//   node tools/payments/make_entitlement_key.mjs
// - The PUBLIC key is written into web/lib/payments/entitlement-public-key.json (safe to share: it can only check a token, never make one). Commit that file;
//   the website and the iPhone app's build read it from there.
// - The PRIVATE key is put on the clipboard and printed nowhere. Paste it straight into Vercel > Project menumacros > Settings > Environment Variables as
//   ENTITLEMENT_PRIVATE_JWK (Sensitive, Production and Preview), then copy something else so it leaves the clipboard. Never paste it anywhere else, chats included.
// Making a new pair later signs everyone out of paid access until their devices restore it, so the tool refuses to replace a key unless you add --replace.
// With --to-vercel (founder 2026-11-18: "is there anyway to do all of this using terminal commands"), the private key goes straight from this Mac into Vercel's
// Production ENTITLEMENT_PRIVATE_JWK (Sensitive) through the Vercel command-line tool you are signed in to, replacing the old value: it never touches the
// clipboard, the screen or a file. Then commit the public key file and redeploy (Vercel uses the new value from the next deployment).
//   node tools/payments/make_entitlement_key.mjs --replace --to-vercel
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
if (process.argv.includes("--to-vercel")) {
  const project = ["--project", "menumacros", "--scope", "aman-moneysave"];
  const web = fileURLToPath(new URL("../../web/", import.meta.url));
  // the old (wrong) value goes first; "not found" is fine. Output is kept off the screen in case the tool ever echoes a value.
  try { execFileSync("vercel", ["env", "rm", "ENTITLEMENT_PRIVATE_JWK", "production", "--yes", ...project], { cwd: web, stdio: ["ignore", "ignore", "ignore"] }); } catch { /* there was none */ }
  try {
    execFileSync("vercel", ["env", "add", "ENTITLEMENT_PRIVATE_JWK", "production", "--sensitive", ...project], { cwd: web, input: JSON.stringify(priv), stdio: ["pipe", "ignore", "ignore"] });
  } catch {
    console.error("Vercel didn't take the key (is the Vercel tool signed in? run: vercel whoami). Nothing was changed on this Mac; run this again.");
    process.exit(1);
  }
  writeFileSync(file, JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2) + "\n");
  console.log("Done: the new private key is in Vercel (Production, Sensitive) and the public key is saved in web/lib/payments/entitlement-public-key.json.");
  console.log("Tell Claude \"key done\": it commits the public key and redeploys when you say so.");
} else {
  execFileSync("pbcopy", { input: JSON.stringify(priv) });
  writeFileSync(file, JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2) + "\n");
  console.log("Public key saved in web/lib/payments/entitlement-public-key.json.");
  console.log("The private key is on your clipboard: paste it into Vercel as ENTITLEMENT_PRIVATE_JWK (Sensitive), then copy something else.");
}
