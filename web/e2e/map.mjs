// Nearby restaurants: location button, typed areas, distance/type/nutrition filters, the list, and the privacy promise that
// the user's coordinates never appear in any request. Branch data and postcodes.io are stubbed so the test is deterministic;
// map tiles are blocked (the page must still work from its list, and says the map couldn't load).
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const HERE = { latitude: 51.5007, longitude: -0.1246 }; // Westminster
const settings = JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, preferences: { vegetarianOnly: false, noPork: false, noBeef: false }, hasCompletedOnboarding: true } });
const FIXTURE = { v: 1, generatedOn: "2026-10-06", source: "test", chains: { kfc: [51.5007, -0.1246, 51.52, -0.1], greggs: [51.5014, -0.1419], "burger-king": [55.95, -3.19] } };

async function newPage(geo) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  if (geo) { await ctx.grantPermissions(["geolocation"]); await ctx.setGeolocation(HERE); }
  await ctx.addInitScript((s) => { if (!localStorage.getItem("mm.v1.settings")) localStorage.setItem("mm.v1.settings", s); }, settings);
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));
  await page.route("**/branches/branches.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(FIXTURE) }));
  await page.route("**/tiles.openfreemap.org/**", (r) => r.abort());
  await page.route("**/api.postcodes.io/**", (r) => {
    const u = r.request().url();
    const body = u.includes("/places") ? (u.includes("Leeds") ? { status: 200, result: [{ name_1: "Leeds", district_borough: "Leeds", latitude: 53.8, longitude: -1.55 }, { name_1: "Leeds", district_borough: "Maidstone", latitude: 51.25, longitude: 0.63 }] } : { status: 404 })
      : u.includes("LS14AP") ? { status: 200, result: { postcode: "LS1 4AP", latitude: 53.7965, longitude: -1.5478 } } : { status: 404 };
    return r.fulfill({ status: body.status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { ctx, page, requests };
}

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
}
const expect = (c, m) => { if (!c) throw new Error(m); };

await step("with location already allowed: nearby chains listed nearest first, within the default 2 miles", async () => {
  const { ctx, page, requests } = await newPage(true);
  await page.goto(BASE + "/app/map");
  await page.getByRole("heading", { name: /^\d+ branches? · \d+ restaurants?$/ }).waitFor();
  const names = await page.locator("main ul > li p.font-bold").allTextContents();
  expect(names.join(",") === "KFC,Greggs", `rows: ${names.join(",")}`);
  await page.getByText(/^0 mi away|<0.1 mi away/).first().waitFor();
  await page.getByText("The map couldn't load").waitFor(); // tiles blocked: the list still works
  // privacy: the pretend position never leaves the browser
  const leaks = requests.filter((r) => /51\.50\d*|-0\.12\d*/.test(decodeURIComponent(r.url) + r.body) && !r.url.includes("/_next/") && !r.url.includes("/branches/"));
  expect(leaks.length === 0, `coordinates in a request: ${leaks.map((l) => l.url).join(", ")}`);
  expect(!requests.some((r) => /api\.postcodes\.io/.test(r.url)), "a GPS visit must not call postcodes.io");
  await ctx.close();
});

await step("distance filter narrows the list; the empty state offers a wider search", async () => {
  const { ctx, page } = await newPage(true);
  await page.goto(BASE + "/app/map");
  await page.getByRole("heading", { name: /branches/ }).waitFor();
  await page.getByRole("group", { name: "Distance" }).getByRole("button", { name: "0.5 mi" }).click();
  await page.getByRole("heading", { name: "1 branch · 1 restaurant" }).waitFor();
  await page.getByRole("group", { name: "Distance" }).getByRole("button", { name: "10 mi" }).click();
  await page.getByRole("heading", { name: "3 branches · 2 restaurants" }).waitFor(); // both KFCs and Greggs; the Burger King in Edinburgh is out of range
  await ctx.close();
});

await step("type and nutrition filters", async () => {
  const { ctx, page } = await newPage(true);
  await page.goto(BASE + "/app/map");
  await page.getByRole("heading", { name: /branches/ }).waitFor();
  const filters = page.getByRole("group", { name: "Filters" });
  await filters.getByRole("button", { name: "Chicken" }).click();
  await page.getByRole("heading", { name: /2 branches · 1 restaurant$/ }).waitFor();
  expect((await filters.getByRole("button", { name: "Chicken" }).getAttribute("aria-pressed")) === "true", "Chicken chip not pressed");
  await filters.getByRole("button", { name: "All types" }).click();
  await filters.getByRole("button", { name: "Full nutrition only" }).click();
  expect((await filters.getByRole("button", { name: "Full nutrition only" }).getAttribute("aria-pressed")) === "true", "nutrition chip not pressed");
  await page.getByRole("heading", { name: /branches/ }).waitFor(); // every chain published so far has full nutrition
  await ctx.close();
});

await step("typed postcode: looked up, remembered, nothing nearby gives a helpful empty state", async () => {
  const { ctx, page, requests } = await newPage(false);
  await page.goto(BASE + "/app/map");
  await page.getByText("Where are you eating?").waitFor();
  await page.getByLabel("Postcode or town").fill("ls1 4ap");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByText("LS1 4AP").first().waitFor();
  await page.getByText("Nothing within 2 miles that matches.").waitFor();
  const calls = requests.filter((r) => /api\.postcodes\.io/.test(r.url)).map((r) => new URL(r.url).pathname);
  expect(calls.length === 1 && calls[0] === "/postcodes/LS14AP", `lookup calls: ${calls.join(",")}`);
  await page.getByRole("button", { name: "Look within 10 miles" }).click();
  await page.getByRole("heading", { name: "No restaurants here" }).waitFor(); // still nothing in Leeds, but it looked wider
  await page.reload(); // remembered on this device
  await page.getByText("LS1 4AP").first().waitFor();
  await ctx.close();
});

await step("typed place with several matches asks which one", async () => {
  const { ctx, page } = await newPage(false);
  await page.goto(BASE + "/app/map");
  await page.getByLabel("Postcode or town").fill("Leeds");
  await page.getByRole("button", { name: "Search" }).click();
  const list = page.getByRole("list", { name: "Did you mean" });
  await list.getByRole("button", { name: "Leeds, Maidstone" }).waitFor();
  await list.getByRole("button", { name: "Leeds", exact: true }).click();
  await page.getByText("Leeds", { exact: true }).first().waitFor();
  await ctx.close();
});

await step("bad input and unknown places say so politely", async () => {
  const { ctx, page } = await newPage(false);
  await page.goto(BASE + "/app/map");
  await page.getByLabel("Postcode or town").fill("x");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByText("Type a UK postcode").waitFor();
  await page.getByLabel("Postcode or town").fill("Zzzzville");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByText("We couldn't find that place.").waitFor();
  await ctx.close();
});

await step("location refused: says how to carry on, and typing still works", async () => {
  const { ctx, page } = await newPage(false); // no permission granted: the browser refuses
  await page.goto(BASE + "/app/map");
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.getByRole("alert").filter({ hasText: /turned off|couldn't work out|can't share/i }).waitFor();
  await ctx.close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
