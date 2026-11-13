// Makes a THROWAWAY key pair for the browser tests of paid access (never the real one): writes e2e/.paykey.json (git-ignored) and prints the public key as one line,
// to be passed to the build as NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK (see e2e/README.md "pay.mjs"). The real keys are made by tools/payments/make_entitlement_key.mjs on the founder's computer.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
const file = new URL("./.paykey.json", import.meta.url);
let pair;
if (existsSync(file)) pair = JSON.parse(readFileSync(file, "utf8"));
else {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  pair = { publicJwk: await crypto.subtle.exportKey("jwk", publicKey), privateJwk: await crypto.subtle.exportKey("jwk", privateKey) };
  writeFileSync(file, JSON.stringify(pair));
}
console.log(JSON.stringify(pair.publicJwk));
