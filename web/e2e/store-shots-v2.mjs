// The raw screens for the App Store screenshots (founder 2026-11-21: "make 10 screenshots ... annotate them"): the iPhone app's copy of the web app, 6.9-inch
// iPhone (440 x 956 points, 1320 x 2868 pixels), light, English. The chains' and shops' official logo files show as they do in the app (founder 2026-11-21:
// "if they have logo things, they should also show the logo"; accepted risk under App Review 2.3.9, see CLAUDE.md rule 2); NO food or product photos (every
// photo request is refused, and a screenshot with one drawn is not saved). NO_LOGOS=1 makes the fallback set without logos (every logo taken down through the
// taken-down list, as e2e/store-shots.mjs does). Premium is on through a THROWAWAY key (e2e/paykey.mjs), so the build must be a test copy built with that key
// (never the App Store build):
//   cd web && KEY=$(node e2e/paykey.mjs) && NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_PHOTO_RECIPES=1 NEXT_PUBLIC_REMOTE_BASE=https://numbite.com \
//     NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$KEY" NEXT_PUBLIC_SIGN_IN_REQUIRED=0 npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &)
//   BASE=http://localhost:3103 node e2e/store-shots-v2.mjs [names...]   → e2e/shots/store-v2/raw/<name>.png ; then e2e/store-frames.mjs frames them
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3103";
const LIVE = process.env.LIVE ?? "https://numbite.com";
const OUT = new URL(process.env.NO_LOGOS === "1" ? "./shots/store-v2/no-logos/raw/" : "./shots/store-v2/raw/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const manifest = JSON.parse(readFileSync(new URL("../public/menus/menus-manifest.json", import.meta.url), "utf8"));
const shops = ["sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons", "waitrose", "iceland", "marks-and-spencer", "coop", "ocado"];
const LOGOS = process.env.NO_LOGOS !== "1";
const hidden = LOGOS ? [] : [...manifest.chains.map((c) => c.id), ...shops.map((s) => `shop:${s}`)];
const { privateJwk } = JSON.parse(readFileSync(new URL("./.paykey.json", import.meta.url), "utf8"));
const DAY = 86_400_000;
const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJhbm51YWwifQ.c2lnbmF0dXJl";
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
async function token(plan, expMs) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ v: 1, plan, src: "apple", iat: Math.floor(Date.now() / 1000), exp: Math.floor(expMs / 1000) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`v1.${payload}`)));
  return `v1.${payload}.${b64url(sig)}`;
}
const until = Date.now() + 30 * DAY;
const paid = JSON.stringify({ v: 1, data: { token: await token("annual", until), plan: "annual", until, unlockUntil: null } });
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, dailyProtein: 130, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true, shops: ["sainsburys"] } });

// today's food diary for Home: a believable day so far (our own recipes and typed numbers; no chain photos)
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const log = JSON.stringify({ v: 1, data: [
  { id: "s1", loggedAt: at(8, 5), chainId: "", chainName: "Sainsbury's", name: "Peanut butter and banana porridge", nutrients: { calories: 412, protein: 16, carbs: 58, fat: 13 }, source: "recipe", meal: "breakfast", recipeId: "peanut-banana-porridge" },
  { id: "s2", loggedAt: at(12, 40), chainId: "", chainName: "Sainsbury's", name: "Chicken and rice bowl", nutrients: { calories: 548, protein: 46, carbs: 58, fat: 13 }, source: "recipe", meal: "lunch", recipeId: "chicken-rice-bowl" },
  { id: "s3", loggedAt: at(15, 30), chainId: "", chainName: "", name: "Greek yogurt and berries", nutrients: { calories: 190, protein: 17, carbs: 18, fat: 5 }, source: "manual", meal: "snack" },
] });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, colorScheme: "light", isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.addInitScript(([s, h, p, l]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", s);
    localStorage.setItem("mm.v1.hiddenLogos", JSON.stringify({ v: 1, data: h }));
    localStorage.setItem("mm.v1.paid", p);
    localStorage.setItem("mm.v1.log", l);
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes", "homeLater"] } }));
    localStorage.setItem("mm.v1.trialOffer", JSON.stringify({ v: 1, data: true }));
    localStorage.setItem("mm.v1.homePages", JSON.stringify({ v: 1, data: { seen: true, slid: true, hintDays: 5, lastHintDay: "2026-01-01" } }));
    localStorage.setItem("mm.v1.rating", JSON.stringify({ v: 1, data: { firstDay: "2026-11-01", lastDay: "2026-11-21", daysUsed: 3, lastAsked: "2026-11-20", reviewAsked: true } }));
  }, [settings, hidden, paid, log]);
  // the pretend iPhone: Apple lists the subscription, so the app keeps Premium on
  await ctx.addInitScript((jws) => {
    window.webkit = { messageHandlers: { menumath: { postMessage(m) {
      const products = [
        { id: "com.amanmarwaha.numbite.pro.annual", name: "Annual", price: "£49.99", period: "year" },
        { id: "com.amanmarwaha.numbite.pro.monthly", name: "Monthly", price: "£4.99", period: "month" },
      ];
      const reply = m.action === "iap.products" ? { products } : m.action === "iap.entitlements" || m.action === "iap.restore" ? { transactions: [jws] } : { done: true };
      setTimeout(() => window.__menumathReply(m.id, reply), 30);
    } } } };
  }, JWS);
  const p = await ctx.newPage();
  await p.route(`${LIVE}/logos/hidden.json`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, hidden }) }));
  await p.route(`${LIVE}/api/v1/entitlement/apple`, async (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ token: await token("annual", until), plan: "annual", expiresAt: until }) }));
  await p.route(`${LIVE}/**`, (r) => r.abort());
  await p.route(/\/(menu-images|grocery-images)\//, (r) => r.abort());
  await p.route((url) => url.protocol === "https:" && url.origin !== new URL(LIVE).origin, (r) => r.abort());
  return { ctx, p };
}

async function save(p, name) {
  await p.waitForTimeout(1200);
  const drawn = await p.evaluate((logos) => [...document.images].filter((i) => (logos ? /menu-images|grocery-images/ : /\/logos\/|menu-images|grocery-images/).test(i.currentSrc || i.src) && i.complete && i.naturalWidth > 0).length, LOGOS);
  if (drawn) throw new Error(`${name}: ${drawn} ${LOGOS ? "photo" : "logo or photo"} images on screen`);
  const logos = await p.evaluate(() => [...document.images].filter((i) => /\/logos\//.test(i.currentSrc || i.src) && i.complete && i.naturalWidth > 0).length);
  await p.screenshot({ path: `${OUT}${name}.png` });
  console.log("saved", name, logos ? `(${logos} logos)` : "");
}

const scrollTo = async (p, heading, above = 70) => {
  const h = p.getByRole("heading", { name: heading }).first();
  await h.waitFor({ timeout: 30000 });
  await h.evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), above);
};

const SHOTS = {
  // Eat out: the restaurant chains with their own logos
  "01-eatout": async (p) => {
    await p.goto(BASE + "/app/eat-out");
    await scrollTo(p, "All restaurants", 24);
    await p.waitForTimeout(3000);
  },
  // a restaurant's menu: dish rows with their calories and protein
  "01-menu": async (p) => {
    await p.goto(BASE + "/app/chain?id=" + (process.env.MENU_CHAIN ?? "wagamama"));
    await p.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
    if (process.env.MENU_TOP !== "1") await scrollTo(p, "Full menu", 24);
  },
  // the Truth card of a dish that scores well (Best for you's first lunch pick), never a dish shown in a poor light
  "02-truth": async (p) => {
    await p.goto(BASE + "/app/item?chain=nandos&item=chicken-butterfly");
    await p.getByRole("button", { name: /See the truth/ }).first().tap({ timeout: 30000 });
    await p.locator("dialog[open]").last().waitFor({ timeout: 30000 });
    await p.waitForTimeout(1500);
  },
  "03-best": async (p) => {
    await p.goto(BASE + "/app/chain?id=" + (process.env.BEST_CHAIN ?? "harvester"));
    await p.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
    await scrollTo(p, "Best for you", 24);
  },
  "04-scan": async (p) => {
    await p.goto(BASE + "/app/groceries/product?code=5063089019924&scan=1");
    await p.getByRole("button", { name: /Add to my food diary/ }).first().tap({ timeout: 60000 });
    await p.getByText("How much?").waitFor({ timeout: 30000 });
    await p.locator("dialog[open]").last().getByRole("radio", { name: /^Glass \(250 ml\)$/ }).tap();
    await p.locator("dialog[open]").last().getByText("How much?").scrollIntoViewIfNeeded();
  },
  "05-home": async (p) => {
    await p.goto(BASE + "/app");
    await p.getByRole("progressbar", { name: "Calories used today" }).waitFor({ timeout: 30000 });
  },
  "06-recipes": async (p) => {
    await p.goto(BASE + "/app/recipes");
    await p.locator("a[href*='/app/recipes/view']").first().waitFor({ timeout: 30000 });
  },
  "07-recipe": async (p) => {
    await p.goto(BASE + "/app/recipes/view?id=chicken-tikka-masala-style-curry&r=sainsburys");
    await p.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
  },
  // the week Meal plan makes, with its pictures and the shopping
  "08-plan": async (p) => {
    await p.goto(BASE + "/app/plan");
    await p.getByRole("button", { name: "Make my plan" }).tap({ timeout: 30000 });
    await p.getByRole("heading", { name: "Making your plan" }).waitFor({ timeout: 30000 });
    await p.getByRole("heading", { name: "Making your plan" }).waitFor({ state: "detached", timeout: 90000 });
    await p.waitForTimeout(2500);
  },
  // Cook with what you have: three things at home, and the recipes that use them
  "09-fridge": async (p) => {
    await p.goto(BASE + "/app/recipes/fridge");
    for (const w of ["chicken", "rice", "spinach"]) await p.getByRole("button", { name: new RegExp(`^\\+?\\s*${w}$`) }).first().tap({ timeout: 30000 });
    await p.getByRole("button", { name: "Show me recipes" }).tap();
    await p.locator("#fridge-results ~ ul li").first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(2500);
    await scrollTo(p, "Recipes that use what you have", Number(process.env.FRIDGE_OFF ?? 300));
  },
  // the nutrition leaderboards: the most protein per pound across the shops (shop names as words, no logos or photos)
  "10-groceries": async (p) => {
    await p.goto(BASE + "/app/groceries/leaderboards");
    await p.waitForTimeout(6000);
  },
};

for (const [name, go] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  const { ctx, p } = await page();
  try { await go(p); await save(p, name); } catch (e) { console.log("FAILED", name, String(e.message).split("\n")[0]); }
  await ctx.close();
}
await browser.close();
