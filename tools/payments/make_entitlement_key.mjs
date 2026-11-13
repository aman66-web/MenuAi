// Makes the key pair that signs and checks paid-access tokens (docs/PAYMENTS.md, step 5). Run it on YOUR computer, not in a chat:
//   node tools/payments/make_entitlement_key.mjs
// It prints two lines. The PRIVATE one goes only into Vercel as ENTITLEMENT_PRIVATE_JWK (Production and Preview) and is never pasted anywhere else.
// The PUBLIC one goes into Vercel as NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK (it is safe to expose: it can only check a token, never make one).
// Make it once; making a new pair later signs everyone out of paid access on their devices until they restore it.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = await crypto.subtle.exportKey("jwk", publicKey);
const priv = await crypto.subtle.exportKey("jwk", privateKey);
console.log("NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK=" + JSON.stringify(pub));
console.log("ENTITLEMENT_PRIVATE_JWK=" + JSON.stringify(priv));
console.error("\nCopy each line's value into Vercel > Project > Settings > Environment Variables. Keep the private one secret.");
