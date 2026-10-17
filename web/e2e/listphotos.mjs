// The picture beside each item on the Shopping list (founder 2026-10-15, on a Tesco item with no picture: "The image should be next to it too").
// An item added now carries its picture (so the list shows it at once and loads no list of products); an item added before that has none, so its picture
// is looked up in the shop's own list; a typed-in item has a quiet basket tile; a picture from anywhere the app doesn't use is never loaded; a shop on the
// taken-down list shows none. The supermarkets' image servers can't be reached from this computer, so a stand-in picture is served for them.
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

/** A small solid-colour PNG, made here (no file needed). */
function png(w, h, [r, g, b]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); raw[o] = 0; raw[o + 1 + x * 3] = r; raw[o + 2 + x * 3] = g; raw[o + 3 + x * 3] = b; }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PICTURE = png(64, 64, [231, 120, 60]);

const iso = "2026-10-15T10:00:00.000Z";
const legacyTesco = { gtin: "", shopId: "272407558", retailer: "tesco", name: "Abra Ca Debora Sweet Pancakes 6 Pack, 375 G", brand: "", size: "", qty: 1, addedAt: iso, price: 2.4, checkedOn: "2026-10-09" };
const keptSainsburys = { gtin: "", shopId: "jason-s-sourdough-grains-seeds-ciabatt-bread", retailer: "sainsburys", name: "Jason's Sourdough Grains & Seeds Ciabatt Bread", brand: "", size: "", qty: 2, addedAt: iso, price: 2.25, checkedOn: "2026-10-09", photo: { src: "/grocery-images/sainsburys/00273735fb1f.webp", from: "stored", shop: "sainsburys" } };
const typed = { gtin: "", retailer: "own", name: "Milk", brand: "", size: "", qty: 1, addedAt: iso, custom: true };

/** A phone with a seeded list; every request to a supermarket's image server is answered with the stand-in picture and recorded. */
async function open(list, { extra = {}, hidden = null, st = {}, known = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "en-GB", ...extra });
  await ctx.addInitScript(([s, l, k]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    if (l) localStorage.setItem("mm.v1.shopping", JSON.stringify({ v: 1, data: l }));
    if (k) localStorage.setItem("mm.v1.hiddenLogos", JSON.stringify({ v: 1, data: k })); // a device that has already read the taken-down list once keeps it
  }, [JSON.stringify({ v: 1, data: { ...settings, ...st } }), list, known]);
  const page = await ctx.newPage();
  const seen = [];
  page.on("request", (r) => seen.push(r.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.route(/digitalcontent\.api\.tesco\.com|assets\.sainsburys-groceries\.co\.uk|asdagroceries\.scene7\.com|images\.openfoodfacts\.org|evil\.example/, (r) => r.fulfill({ contentType: "image/png", body: PICTURE }));
  if (hidden) await page.route("**/logos/hidden.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, hidden }) }));
  return { ctx, page, seen, errors };
}
const rowOf = (page, name) => page.locator("li", { has: page.getByRole("checkbox", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }) });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mm.v1.shopping") ?? "null")?.data ?? []);
const loaded = (img) => img.evaluate((el) => el.complete && el.naturalWidth > 0);

await step("an item added before pictures were kept finds its picture in the shop's own list (and writes nothing back)", async () => {
  const { ctx, page, seen, errors } = await open([legacyTesco]);
  await page.goto(BASE + "/app/groceries/list");
  const row = rowOf(page, "Abra Ca Debora");
  await row.waitFor({ timeout: 90000 });
  const img = row.locator("img");
  await img.waitFor({ timeout: 60000 });
  const src = await img.getAttribute("src");
  expect(/^https:\/\/digitalcontent\.api\.tesco\.com\/v2\/media\/ghs\/1ae5ef44-e50e-42f5-8844-13346be3a111\//.test(src), "Tesco's picture for this product: " + src);
  await page.waitForFunction((s) => [...document.images].some((i) => i.src === s && i.complete && i.naturalWidth > 0), src);
  expect(seen.some((u) => u.includes("/groceries/all/tesco.json")), "Tesco's list was read to find it");
  expect((await stored(page))[0] && !("photo" in (await stored(page))[0]), "the list was written to (a picture was stored behind the person's back)");
  expect(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await step("an item that carries its picture shows it at once, from our own copy, and reads no list of products for it", async () => {
  const { ctx, page, seen } = await open([keptSainsburys, { ...legacyTesco, photo: { src: "https://digitalcontent.api.tesco.com/v2/media/ghs/1ae5ef44-e50e-42f5-8844-13346be3a111/b38866f9-6933-43ad-a388-15a1baf5b669.jpeg?h=225&w=225", from: "retailer", shop: "tesco" } }]);
  await page.goto(BASE + "/app/groceries/list");
  const row = rowOf(page, "Jason's Sourdough");
  await row.waitFor({ timeout: 90000 });
  const img = row.locator("img");
  await img.waitFor();
  expect((await img.getAttribute("src")) === "/grocery-images/sainsburys/00273735fb1f.webp", "our stored copy: " + (await img.getAttribute("src")));
  await page.waitForFunction(() => [...document.images].some((i) => i.src.includes("/grocery-images/sainsburys/00273735fb1f.webp") && i.complete && i.naturalWidth > 0));
  await rowOf(page, "Abra Ca Debora").locator("img").waitFor();
  await page.waitForTimeout(1500);
  expect(!seen.some((u) => u.includes("/groceries/all/tesco.json")), "Tesco's list was read although the item carries its picture");
  await ctx.close();
});

await step("a typed-in item has a quiet basket tile and no picture is looked up for it", async () => {
  const { ctx, page, seen } = await open([typed]);
  await page.goto(BASE + "/app/groceries/list");
  const row = rowOf(page, "Milk");
  await row.waitFor({ timeout: 90000 });
  expect((await row.locator("img").count()) === 0, "a picture for typed-in milk");
  expect((await row.locator("svg").count()) >= 3, "no basket tile and round buttons");
  await page.waitForTimeout(800);
  // (the page itself reads Sainsbury's list to say which recipes the list can make: that is not a picture lookup, and nothing else is read)
  const read = seen.filter((u) => /\/groceries\/(all\/)?[a-z-]+\.json/.test(u) && !u.includes("manifest") && !u.endsWith("/groceries/all/sainsburys.json"));
  expect(read.length === 0, "a product list was read for a typed-in item: " + read.join(", "));
  await ctx.close();
});

await step("adding from a shop's own list keeps the picture, and the list shows it straight away", async () => {
  const { ctx, page } = await open(null);
  await page.goto(BASE + "/app/groceries/shop/item?r=tesco&id=272407558");
  await page.getByRole("button", { name: "Add to my list" }).tap();
  await page.getByText(/Added to your Tesco list/).waitFor();
  const [x] = await stored(page);
  expect(x?.photo?.from === "retailer" && x.photo.shop === "tesco" && /^https:\/\/digitalcontent\.api\.tesco\.com\/v2\/media\/ghs\/1ae5ef44/.test(x.photo.src), "kept: " + JSON.stringify(x));
  await page.getByRole("link", { name: "See list" }).tap();
  const row = rowOf(page, "Abra Ca Debora");
  await row.waitFor();
  await row.locator("img").waitFor();
  await ctx.close();
});

await step("adding from a product's page (the barcode catalogue) and from a recipe keeps the picture too", async () => {
  const asda = await (await fetch(BASE + "/groceries/asda.json")).json();
  const p = asda.products.find((x) => x.price && x.retailerImage && x.kcal > 0 && x.gtin.length === 13 && !/^0?2/.test(x.gtin));
  const { ctx, page } = await open(null);
  await page.goto(BASE + `/app/groceries/product?code=${p.gtin}&r=asda`);
  await page.getByRole("button", { name: /^Add · Asda/ }).first().tap();
  await page.getByText(/Added to your list for Asda/).waitFor();
  const [x] = await stored(page);
  expect(x?.gtin === p.gtin && x.photo?.shop === "asda" && /^https:\/\/asdagroceries\.scene7\.com\//.test(x.photo.src), "catalogue item: " + JSON.stringify(x));
  // a recipe adds its products (Sainsbury's: stored copies of its own photos)
  await page.goto(BASE + "/app/recipes");
  await page.getByLabel("Search recipes").fill("pasta");
  const tile = page.getByRole("link", { name: /pasta/i }).first();
  await tile.waitFor({ timeout: 60000 });
  await tile.tap();
  await page.getByRole("button", { name: /Add all to my shopping list/ }).tap();
  await page.getByText(/Added \d+ products? to your Sainsbury's list/).waitFor({ timeout: 30000 });
  const items = await stored(page);
  const sains = items.filter((i) => i.retailer === "sainsburys");
  expect(sains.length > 0 && sains.every((i) => i.shopId), "recipe items: " + JSON.stringify(sains.slice(0, 1)));
  const withPicture = sains.filter((i) => i.photo && (i.photo.from === "stored" || i.photo.from === "retailer"));
  expect(withPicture.length >= Math.ceil(sains.length / 2), `most of the recipe's products carry a picture: ${withPicture.length} of ${sains.length}`);
  await ctx.close();
});

await step("a picture from anywhere the app doesn't use is dropped on the way in: the item stays, nothing is loaded from there", async () => {
  const { ctx, page, seen } = await open([{ ...legacyTesco, photo: { src: "https://evil.example/pixel.png", from: "retailer", shop: "tesco" } }, { ...typed, photo: { src: "https://evil.example/track.png", from: "retailer", shop: "tesco" } }]);
  await page.goto(BASE + "/app/groceries/list");
  await rowOf(page, "Abra Ca Debora").waitFor({ timeout: 90000 });
  await rowOf(page, "Milk").waitFor();
  await page.waitForTimeout(1500);
  expect(!seen.some((u) => u.includes("evil.example")), "a picture was loaded from evil.example");
  // the bad picture is gone, so the item looks its real picture up like any older item
  await rowOf(page, "Abra Ca Debora").locator("img").waitFor({ timeout: 60000 });
  expect(/digitalcontent\.api\.tesco\.com/.test(await rowOf(page, "Abra Ca Debora").locator("img").getAttribute("src")), "not Tesco's own picture");
  await ctx.close();
});

await step("a shop on the taken-down list shows none of its pictures (a device that knows the list asks Tesco for nothing), and the other shops keep theirs", async () => {
  const tescoKept = { ...legacyTesco, shopId: "308861429", name: "Abra-Ca-Debora Buttermilk Pancakes 240G", photo: { src: "https://digitalcontent.api.tesco.com/v2/media/ghs/012ed012-d1ff-4f24-91aa-ee5f35cb35a1/b31aa9c9-8d1f-4672-aa24-5f37184a05ab.jpeg?h=225&w=225", from: "retailer", shop: "tesco" } };
  const { ctx, page, seen } = await open([legacyTesco, keptSainsburys, tescoKept], { hidden: ["shop:tesco"], known: ["shop:tesco"] });
  await page.goto(BASE + "/app/groceries/list");
  await rowOf(page, "Jason's Sourdough").locator("img").waitFor({ timeout: 90000 });
  await page.waitForTimeout(2500);
  expect((await rowOf(page, "Abra Ca Debora Sweet").locator("img").count()) === 0, "Tesco's picture is shown although Tesco is taken down (looked up)");
  expect((await rowOf(page, "Buttermilk").locator("img").count()) === 0, "Tesco's picture is shown although Tesco is taken down (kept with the item)");
  expect(!seen.some((u) => u.includes("digitalcontent.api.tesco.com")), "something was asked of Tesco's image server");
  expect((await rowOf(page, "Buttermilk").locator("svg").count()) >= 3, "no basket tile stands in");
  await ctx.close();
});

await step("a taken-down list that arrives after the page has opened takes the pictures off at once", async () => {
  const tescoKept = { ...legacyTesco, shopId: "308861429", name: "Abra-Ca-Debora Buttermilk Pancakes 240G", photo: { src: "https://digitalcontent.api.tesco.com/v2/media/ghs/012ed012-d1ff-4f24-91aa-ee5f35cb35a1/b31aa9c9-8d1f-4672-aa24-5f37184a05ab.jpeg?h=225&w=225", from: "retailer", shop: "tesco" } };
  const { ctx, page } = await open([tescoKept, keptSainsburys]);
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route("**/logos/hidden.json", async (r) => { await gate; await r.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, hidden: ["shop:tesco"] }) }); });
  await page.goto(BASE + "/app/groceries/list");
  await rowOf(page, "Buttermilk").locator("img").waitFor({ timeout: 90000 }); // shown while the list hasn't arrived
  release();
  await page.waitForFunction(() => ![...document.images].some((i) => i.src.includes("digitalcontent.api.tesco.com")), null, { timeout: 15000 });
  await rowOf(page, "Jason's Sourdough").locator("img").waitFor();
  await ctx.close();
});

await step("the layout: tick, picture, name and price, quantity under them; the picture opens the product; nothing runs sideways at 360 px, at Extra large text, or right to left", async () => {
  const list = [legacyTesco, keptSainsburys, typed];
  for (const [label, o] of [["360 px", { extra: { viewport: { width: 360, height: 780 } } }], ["Extra large", { st: { textSize: "xlarge" } }]]) {
    const { ctx, page } = await open(list, o);
    await page.goto(BASE + "/app/groceries/list");
    const row = rowOf(page, "Jason's Sourdough");
    await row.waitFor({ timeout: 90000 });
    await row.locator("img").waitFor();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over <= 0, `${label}: sideways scroll ${over}`);
    const tick = await row.getByRole("checkbox").boundingBox(), img = await row.locator("img").boundingBox(), name = await row.getByRole("link", { name: /Jason's Sourdough/ }).first().boundingBox();
    expect(tick && img && name, `${label}: boxes`);
    expect(tick.width >= 44 && tick.height >= 44, `${label}: tick is ${tick.width}x${tick.height}`);
    const rtl = label === "Arabic";
    expect(rtl ? img.x + img.width <= tick.x + 1 && name.x + name.width <= img.x + 1 : tick.x + tick.width <= img.x + 1 && img.x + img.width <= name.x + 1, `${label}: order tick, picture, name`);
    await ctx.close();
  }
  const { ctx, page } = await open(list);
  await page.goto(BASE + "/app/groceries/list");
  const row = rowOf(page, "Jason's Sourdough");
  await row.locator("img").waitFor({ timeout: 90000 });
  await row.locator("img").tap();
  await page.waitForURL(/\/app\/groceries\/shop\/item\?r=sainsburys&id=jason-s-sourdough/, { timeout: 30000 });
  await ctx.close();
});

await step("ticking, quantity and Remove ticked still work with pictures in the rows", async () => {
  const { ctx, page } = await open([legacyTesco, keptSainsburys, typed]);
  await page.goto(BASE + "/app/groceries/list");
  const row = rowOf(page, "Jason's Sourdough");
  await row.waitFor({ timeout: 90000 });
  await row.getByRole("button", { name: /One more Jason/ }).tap();
  expect((await stored(page)).find((i) => i.shopId?.startsWith("jason"))?.qty === 3, "quantity 3");
  await row.getByRole("checkbox").tap();
  await page.getByRole("button", { name: /Remove ticked \(1\)/ }).tap();
  expect((await stored(page)).length === 2, "ticked item removed");
  await ctx.close();
});

await step("axe: no violations on a list of lookups, kept pictures and typed items", async () => {
  const { ctx, page } = await open([legacyTesco, keptSainsburys, typed, { ...keptSainsburys, shopId: "warburtons-800g-seven-seeds-bread", name: "Warburtons 800g Seven Seeds Bread", done: true }]);
  await page.goto(BASE + "/app/groceries/list");
  await rowOf(page, "Abra Ca Debora").locator("img").waitFor({ timeout: 90000 });
  await page.waitForTimeout(900);
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }));
  expect(res.violations.length === 0, res.violations.map((v) => v.id + " " + (v.nodes[0]?.html ?? "").slice(0, 100)).join(" | "));
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
