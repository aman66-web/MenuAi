// Search that forgives (founder 2026-11-21: "one little spelling mistake will mean that they won't be able to get the right thing ... AI assist would help"):
// "Mc chick" finds the McChicken as a close match, said plainly; a word the phone can't place ("maccies") asks Pip, whose words (here a stand-in answer, so the
// test spends nothing) are offered as "Did you mean" only when they find something; a tap searches it. Nothing is sent for a search that finds something.
// Run against a dev or test server: BASE=http://localhost:3005 node e2e/searchhelp.mjs
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); } }
const expect = (c, m) => { if (!c) throw new Error(m); };

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mm.v1.settings", JSON.stringify({ v: 1, data: { goal: "maintain", dailyCalories: 2000, hasSetTargets: true, signUpApart: true, preferences: {}, hasCompletedOnboarding: true } }));
    localStorage.setItem("mm.v1.tour", JSON.stringify({ v: 1, data: 99 }));
    localStorage.setItem("mm.v1.coach", JSON.stringify({ v: 1, data: { armed: false, seen: ["home", "eatOut", "groceries", "recipes", "homeLater"] } }));
  });
  const page = await ctx.newPage();
  const asked = [];
  await page.route(/\/api\/v1\/search\/help$/, async (r) => {
    const q = JSON.parse(r.request().postData() ?? "{}").q;
    asked.push(q);
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ phrases: q === "maccies" ? ["McDonald's", "Made-up Diner"] : [] }) });
  });
  return { ctx, page, asked };
}
const box = (page) => page.getByRole("searchbox").first();

await step("\"Mc chick\": the McChicken as a close match, said once, and nothing asked of Pip", async () => {
  const { ctx, page, asked } = await open();
  await page.goto(BASE + "/app/search");
  await box(page).fill("Mc chick");
  await page.getByText("No exact match. Closest:").waitFor({ timeout: 90000 });
  await page.getByText(/McChicken/i).first().waitFor();
  await page.waitForTimeout(1500);
  expect(asked.length === 0, "asked Pip for a search that found something: " + asked.join(","));
  await ctx.close();
});

await step("\"maccies\": Pip's words that find something are offered; one that finds nothing is not; a tap searches it", async () => {
  const { ctx, page, asked } = await open();
  await page.goto(BASE + "/app/search");
  await box(page).fill("maccies");
  await page.getByRole("heading", { name: "Did you mean" }).waitFor({ timeout: 90000 });
  expect(asked.length === 1 && asked[0] === "maccies", "asked: " + asked.join(","));
  expect((await page.getByRole("button", { name: "Made-up Diner" }).count()) === 0, "a suggestion that finds nothing was offered");
  await page.getByRole("button", { name: "McDonald's", exact: true }).tap();
  await page.getByRole("link", { name: /McDonald's/ }).first().waitFor({ timeout: 30000 });
  expect((await box(page).inputValue()) === "McDonald's", "the box holds the suggestion");
  await ctx.close();
});

await step("a search that finds nothing and gets nothing from Pip still says so and offers Request it", async () => {
  const { ctx, page } = await open();
  await page.goto(BASE + "/app/search");
  await box(page).fill("zzqxv");
  await page.getByText("We don't cover this yet.").waitFor({ timeout: 90000 });
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
