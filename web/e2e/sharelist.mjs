// Sharing a shopping list (founder 2026-10-15: "when the person presses share then sends it to someone they know they get a link saying to download the app to
// view their shopping list ... so that shopping lists can be easily shared"). Share sends the items as words and a link, https://numbite.com/l#<list>, which holds
// the list itself after the "#" (nothing is stored on a server). The link's page says what it is and how to open it; the list opens in the app (here, the web app),
// where it can be added to the reader's own list; someone who has just installed it can paste the link in; a first-time visitor goes through onboarding and lands
// on the list (the "#" survives). Touch is on, like an iPhone. The supermarkets' image servers can't be reached from here, so a stand-in picture is served.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const settings = { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] };
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

function png(w, h, [r, g, b]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); raw[o + 1 + x * 3] = r; raw[o + 2 + x * 3] = g; raw[o + 3 + x * 3] = b; }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PICTURE = png(64, 64, [231, 120, 60]);

const iso = "2026-10-15T10:00:00.000Z";
const pancakes = { gtin: "", shopId: "272407558", retailer: "tesco", name: "Abra Ca Debora Sweet Pancakes 6 Pack, 375 G", brand: "", size: "", qty: 2, addedAt: iso, price: 2.4, checkedOn: "2026-10-09" };
const keema = { gtin: "5030039010492", retailer: "asda", name: "Aaila Chicken Tikka Keema 500g Halal (HMC)", brand: "", size: "", qty: 1, addedAt: iso, price: 5.99, checkedOn: "2026-10-08" };
const loaf = { gtin: "", shopId: "jason-s-sourdough-grains-seeds-ciabatt-bread", retailer: "sainsburys", name: "Jason's Sourdough Grains & Seeds Ciabatt Bread", brand: "", size: "", qty: 1, addedAt: iso, price: 2.25, checkedOn: "2026-10-09" };
const milk = { gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: iso, custom: true };
const ticked = { ...loaf, shopId: "warburtons-800g-seven-seeds-bread", name: "Warburtons 800g Seven Seeds Bread", done: true };

async function open(list, { extra = {}, st = {}, onboarded = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => undefined);
  await ctx.addInitScript(([s, l, on]) => {
    // the phone's own share sheet: remember what it was handed
    navigator.share = async (data) => { window.__shared = data; };
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    if (on) localStorage.setItem("mm.v1.settings", s);
    if (l) localStorage.setItem("mm.v1.shopping", JSON.stringify({ v: 1, data: l }));
  }, [JSON.stringify({ v: 1, data: { ...settings, ...st } }), list, onboarded]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.route(/digitalcontent\.api\.tesco\.com|assets\.sainsburys-groceries\.co\.uk|asdagroceries\.scene7\.com|images\.openfoodfacts\.org/, (r) => r.fulfill({ contentType: "image/png", body: PICTURE }));
  return { ctx, page, errors };
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []);
const sharedWith = (page) => page.evaluate(() => window.__shared ?? null);
const LINK = /https:\/\/numbite\.com\/l#([A-Za-z0-9_-]+)/;

/** Share a list from the sender's phone and return what was handed to the share sheet. */
async function shareList(list, o) {
  const { ctx, page } = await open(list, o);
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("button", { name: "Share list" }).waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Share list" }).tap();
  await page.waitForFunction(() => window.__shared, null, { timeout: 15000 });
  const data = await sharedWith(page);
  await ctx.close();
  return data;
}

let shared;

await step("Share sends the items as words, then the link: \"Open it in Numbite to see the products and prices\"; ticked items are left out", async () => {
  shared = await shareList([pancakes, keema, loaf, milk, ticked]);
  expect(shared.title === "Shopping list", "title: " + shared.title);
  const lines = shared.text.split("\n");
  expect(lines[0] === "My shopping list on Numbite", "first line: " + lines[0]);
  for (const w of ["Tesco", "2 x Abra Ca Debora Sweet Pancakes", "Asda", "Aaila Chicken Tikka Keema", "Sainsbury's", "Jason's Sourdough", "Any shop", "1 x Milk"]) expect(shared.text.includes(w), `the words lack "${w}": ${shared.text}`);
  expect(!shared.text.includes("Warburtons"), "a ticked item was shared");
  expect(LINK.test(shared.text), "no link: " + shared.text);
  expect(/Open it in Numbite to see the products and prices:\nhttps:\/\/numbite\.com\/l#/.test(shared.text), "the line before the link");
  expect(shared.text.trimEnd().endsWith(shared.text.match(LINK)[0]), "the link is last");
  expect(shared.text.match(LINK)[1].length < 1500, "a short link: " + shared.text.match(LINK)[1].length);
});

await step("Copy copies the same message, and a long list is cut to what fits and says so", async () => {
  const { ctx, page } = await open([pancakes, keema, milk]);
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("button", { name: "Copy", exact: true }).tap();
  await page.getByText("Copied.").waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.startsWith("My shopping list on Numbite") && LINK.test(copied), "copied: " + copied.slice(0, 120));
  await ctx.close();
  const many = Array.from({ length: 130 }, (_, i) => ({ gtin: "", shopId: `a-very-long-product-name-that-sainsburys-might-use-for-product-number-${i}-in-its-address`, retailer: "sainsburys", name: `Long product ${i}`, brand: "", size: "", qty: 1, addedAt: iso }));
  const big = await open(many);
  await big.page.goto(BASE + "/app/groceries/list");
  await big.page.getByRole("button", { name: "Share list" }).tap();
  await big.page.getByText(/^The link holds the first \d+ of your 130 items\. The list in the message has them all\.$/).waitFor({ timeout: 15000 });
  const data = await sharedWith(big.page);
  expect(data.text.includes("Long product 129"), "the words hold every item");
  expect(LINK.test(data.text) && data.text.match(LINK)[1].length <= 6000, "the link fits");
  await big.ctx.close();
});

await step("the link's own page says what it is: how many things and from which shops, how to open it, and that nothing is stored", async () => {
  const { ctx, page, errors } = await open(null, { onboarded: false });
  await page.goto(BASE + "/l#" + shared.text.match(LINK)[1]);
  await page.getByRole("heading", { name: "A friend shared a shopping list" }).waitFor({ timeout: 90000 });
  const body = await page.locator("main").innerText();
  expect(/4 things: 3 from Tesco, Asda and Sainsbury/.test(body), "what is in it: " + body.slice(0, 200));
  expect(/and 1 you can pick up anywhere/.test(body), "typed items: " + body.slice(0, 260));
  expect(!/Warburtons/.test(body), "a product's name on the page (only counts are shown)");
  expect(/never stored on a server/.test(body), "the privacy line");
  // Before the App Store page exists (NEXT_PUBLIC_APP_STORE_URL unset) one button opens the list in the browser; once it is set there are three ways in:
  // the App Store, the app (numbite://l#...) and the browser. Both are checked, whichever this build has.
  const store = page.getByRole("link", { name: "Get Numbite on the App Store" });
  const here = (await page.url()).split("#")[1];
  if ((await store.count()) === 0) {
    const view = page.getByRole("link", { name: "View the list" });
    expect((await view.count()) === 1, "one main button");
    expect((await view.getAttribute("href")) === `/app/groceries/list/shared#${here}`, "it opens the list in the app: " + (await view.getAttribute("href")));
  } else {
    expect((await store.getAttribute("href")).startsWith("https://apps.apple.com/"), "the App Store address");
    expect((await page.getByRole("link", { name: "I have Numbite: open the list" }).getAttribute("href")) === `numbite://l#${here}`, "the app's own address");
    expect((await page.getByRole("link", { name: "Or read the list in your browser" }).getAttribute("href")) === `/app/groceries/list/shared#${here}`, "the browser fallback");
    expect(/After you.ve installed it/.test(body), "what to do after installing");
  }
  expect((await page.locator('meta[name="robots"]').getAttribute("content")).includes("noindex"), "not for search engines");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("the page says plainly when a link is cut short, not a list, or empty", async () => {
  const { ctx, page } = await open(null, { onboarded: false });
  const code = shared.text.match(LINK)[1];
  for (const [hash, words] of [[code.slice(0, code.length - 6), "looks cut short"], ["abc", "doesn’t look like a shopping list link|doesn't look like a shopping list link"], ["", "Open the whole link they sent you"]]) {
    await page.goto(BASE + "/l" + (hash ? "#" + hash : ""));
    await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 60000 });
    const body = await page.locator("main").innerText();
    expect(new RegExp(words).test(body), `${hash.slice(0, 8)}: ${body.slice(0, 200)}`);
  }
  await ctx.close();
});

await step("a first-time visitor opening the link goes through onboarding and then lands on the list (the # survives, and no recipe is asked for first)", async () => {
  const code = shared.text.match(LINK)[1];
  const { ctx, page } = await open(null, { onboarded: false });
  const requested = [];
  page.on("request", (r) => { try { const u = new URL(r.url()); requested.push(u.pathname + u.search); } catch { /* data: and blob: */ } });
  await page.goto(BASE + "/app/groceries/list/shared#" + code);
  await page.waitForURL(/\/app\/welcome\?next=/, { timeout: 60000 });
  const here = new URL(page.url());
  // The list's code is carried after the welcome page's own "#", never in its query (a query reaches the server, a fragment does not).
  expect(here.searchParams.get("next") === "/app/groceries/list/shared", "the way back: " + here.searchParams.get("next"));
  expect(here.hash === "#" + code, "the code should stay in the fragment: " + here.href.slice(-60));
  await page.getByRole("button", { name: "Continue" }).click(); // language
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Show me around" }).click({ timeout: 30000 });
  for (const tab of ["Home", "Eat out", "Groceries", "Recipes", "Settings"]) {
    await page.getByRole("heading", { level: 1, name: tab, exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: tab === "Settings" ? "Let's go!" : "Continue" }).click();
  }
  await page.getByRole("radio", { name: "Maintain weight" }).click().catch(() => page.getByRole("radio").first().click());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Your daily targets" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Anything you avoid?" }).waitFor();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("heading", { name: "Where do you shop?" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Easy to read" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "You're all set!" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/app\/groceries\/list\/shared/, { timeout: 30000 });
  expect(new URL(page.url()).hash === "#" + code, "the list is still in the address: " + page.url().slice(-30));
  await page.getByRole("heading", { level: 1, name: "Shared shopping list" }).waitFor();
  await page.getByText("Abra Ca Debora Sweet Pancakes").waitFor({ timeout: 60000 });
  expect(!requested.some((u) => u.includes(code) || u.includes(encodeURIComponent(code))), "the list code reached a request: " + requested.filter((u) => u.includes(code.slice(0, 12))).slice(0, 2).join(" | "));
  await ctx.close();
});

await step("the shared list shows each product with its picture, price and quantity, grouped by shop; Add all puts them on the reader's own list (merging what is there)", async () => {
  const code = shared.text.match(LINK)[1];
  const mine = [{ ...pancakes, qty: 1, photo: undefined }];
  const { ctx, page, errors } = await open(mine);
  await page.goto(BASE + "/app/groceries/list/shared#" + code);
  await page.getByRole("heading", { level: 1, name: "Shared shopping list" }).waitFor({ timeout: 90000 });
  await page.getByText("Abra Ca Debora Sweet Pancakes").waitFor({ timeout: 60000 });
  for (const group of ["Tesco", "Asda", "Sainsbury's", "Any shop"]) await page.getByRole("region", { name: group }).waitFor();
  const tesco = page.getByRole("region", { name: "Tesco" });
  expect((await tesco.innerText()).includes("£2.40") && (await tesco.getByLabel("Quantity 2").count()) === 1, "price and quantity: " + (await tesco.innerText()));
  await tesco.locator("li img").waitFor(); // the shop's own mark sits in the heading; the product's picture is in its row
  expect((await page.getByRole("region", { name: "Any shop" }).locator("li img").count()) === 0, "a picture for typed milk");
  expect(!(await page.locator("main").innerText()).includes("Warburtons"), "the ticked item travelled");
  await page.getByRole("button", { name: "Add all to my shopping list" }).tap();
  await page.getByText("Added to your shopping list.").waitFor();
  const items = await stored(page);
  expect(items.length === 4, "four things on the list: " + JSON.stringify(items.map((i) => i.name)));
  expect(items.find((i) => i.shopId === "272407558").qty === 3, "the pancakes merged: 1 + 2 = 3");
  expect(items.every((i) => i.custom || i.photo), "each product carries its picture: " + JSON.stringify(items.map((i) => !!i.photo)));
  expect(items.find((i) => i.custom).name === "Milk", "the typed item");
  expect((await page.getByRole("button", { name: "Add all to my shopping list" }).count()) === 0, "it can be pressed twice");
  await page.getByRole("link", { name: "Open my shopping list" }).tap();
  await page.getByRole("heading", { level: 1, name: "Shopping list" }).waitFor();
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("a link whose product is no longer in the shop's list says so, and a link of nothing else says that", async () => {
  const forge = (wire) => {
    const body = Buffer.from(JSON.stringify(wire)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    let h = 0x811c9dc5;
    for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const check = Buffer.from([(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255]).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").padEnd(6, "A");
    return "1" + check + body;
  };
  const { ctx, page } = await open(null);
  await page.goto(BASE + "/app/groceries/list/shared#" + forge([["tesco", ["s272407558", "s000000001"]], ["own", ["nMilk"]]]));
  await page.getByText("Abra Ca Debora Sweet Pancakes").waitFor({ timeout: 90000 });
  await page.getByText("1 product from this list couldn't be found in the shops' lists any more.").waitFor();
  await page.goto(BASE + "/app/groceries/list/shared#" + forge([["tesco", ["s000000001", "s000000002"]]]));
  await page.getByText("None of the products in this list could be found in the shops' lists any more.").waitFor({ timeout: 60000 });
  expect((await page.getByRole("button", { name: "Add all to my shopping list" }).count()) === 0, "an add button for nothing");
  await ctx.close();
});

await step("a typed item with html in it is shown as words, never run", async () => {
  const forge = (wire) => {
    const body = Buffer.from(JSON.stringify(wire)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    let h = 0x811c9dc5;
    for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const check = Buffer.from([(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255]).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").padEnd(6, "A");
    return "1" + check + body;
  };
  const { ctx, page } = await open(null);
  await page.addInitScript(() => { window.__pwned = 0; });
  await page.goto(BASE + "/app/groceries/list/shared#" + forge([["own", ["n<img src=x onerror=window.__pwned=1> milk", "n<script>window.__pwned=2</script>"]]]));
  await page.getByText("<img src=x onerror=window.__pwned=1> milk").waitFor({ timeout: 90000 });
  expect((await page.evaluate(() => window.__pwned)) === 0, "script ran");
  expect((await page.locator("main img").count()) === 0, "an image was made from the words");
  await ctx.close();
});

await step("\"Got a list from a friend? Open it\": paste the whole message, the link or the code and the list opens; a wrong or cut link says why", async () => {
  const code = shared.text.match(LINK)[1];
  const { ctx, page } = await open(null);
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("button", { name: "Got a list from a friend? Open it" }).tap(); // also on an empty list
  const field = page.getByLabel("The link or code");
  await field.waitFor();
  expect(await page.getByRole("button", { name: "Open the list" }).isDisabled(), "Open is on with nothing pasted");
  await field.fill("hello there");
  await page.getByRole("button", { name: "Open the list" }).tap();
  await page.getByText("This doesn't look like a shopping list link. Ask your friend to send it again.").waitFor();
  await field.fill(`https://numbite.com/l#${code.slice(0, -8)}`);
  await page.getByRole("button", { name: "Open the list" }).tap();
  await page.getByText(/looks cut short/).waitFor();
  await field.fill(shared.text); // the whole message, words and link
  await page.getByRole("button", { name: "Open the list" }).tap();
  await page.waitForURL(/\/app\/groceries\/list\/shared#/, { timeout: 30000 });
  await page.getByText("Abra Ca Debora Sweet Pancakes").waitFor({ timeout: 60000 });
  await page.goBack();
  await page.getByRole("button", { name: "Got a list from a friend? Open it" }).tap();
  await page.getByLabel("The link or code").fill(code); // the code alone
  await page.getByRole("button", { name: "Open the list" }).tap();
  await page.getByText("Abra Ca Debora Sweet Pancakes").waitFor({ timeout: 60000 });
  await ctx.close();
});

await step("nothing runs sideways at 360 px, at Extra large text or right to left, on the shared list, the paste sheet or the link's page", async () => {
  const code = shared.text.match(LINK)[1];
  for (const [label, o] of [["360 px", { extra: { viewport: { width: 360, height: 780 } } }], ["Extra large", { st: { textSize: "xlarge" } }], ["Arabic", { extra: { locale: "ar" }, st: { language: "ar" } }]]) {
    const { ctx, page } = await open([pancakes, keema, milk], o);
    for (const url of ["/app/groceries/list/shared#" + code, "/l#" + code]) {
      await page.goto(BASE + url);
      await page.waitForFunction(() => document.querySelector("main, [data-app]") !== null && document.body.innerText.length > 60, null, { timeout: 90000 });
      await page.waitForTimeout(1500);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over <= 0, `${label} ${url.slice(0, 22)}: sideways scroll ${over}`);
    }
    await page.goto(BASE + "/app/groceries/list");
    await page.getByRole("button").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over2 <= 0, `${label}: the list itself scrolls sideways ${over2}`);
    await ctx.close();
  }
});

await step("axe: no violations on the shared list, the paste sheet and the link's page", async () => {
  const code = shared.text.match(LINK)[1];
  const { ctx, page } = await open([pancakes]);
  const check = async (label) => {
    await page.waitForTimeout(900);
    await page.addScriptTag({ path: AXE }).catch(() => {});
    const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
    expect(res.violations.length === 0, label + ": " + res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 90)).join(" | "));
  };
  await page.goto(BASE + "/app/groceries/list/shared#" + code);
  await page.getByText("Abra Ca Debora Sweet Pancakes").waitFor({ timeout: 90000 });
  await check("shared list");
  await page.goto(BASE + "/app/groceries/list/shared#" + code.slice(0, 20));
  await page.getByText(/looks cut short/).waitFor();
  await check("shared list, cut link");
  await page.goto(BASE + "/l#" + code);
  await page.getByRole("heading", { name: "A friend shared a shopping list" }).waitFor();
  await check("the link's page");
  await page.goto(BASE + "/app/groceries/list");
  await page.getByRole("button", { name: "Got a list from a friend? Open it" }).tap();
  await page.getByLabel("The link or code").fill("hello");
  await page.getByRole("button", { name: "Open the list" }).tap();
  await page.getByRole("dialog").getByRole("alert").waitFor(); // (Next also keeps its own route announcer alert on the page)
  await check("the paste sheet with a problem");
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
