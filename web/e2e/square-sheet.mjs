// Contact sheet of the chains' square icons as the app shows them (64 px tile, light and dark), to look at before they go live:
// node e2e/square-sheet.mjs [outDir] [--all]   (default: installed icons only; --all adds rejected ones, marked)
// Reads web/public/logos/square/<id>.source.txt and lib/mm/logos.ts is NOT used, so it works before assemble_logos.py has run.
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const pub = new URL("../public/", import.meta.url).pathname;
const dir = `${pub}logos/square/`;
const out = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : new URL("./shots/square/", import.meta.url).pathname;
const all = process.argv.includes("--all");
mkdirSync(out, { recursive: true });

const rec = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => l.includes(": ")).map((l) => [l.slice(0, l.indexOf(": ")), l.slice(l.indexOf(": ") + 2)]));
const items = readdirSync(dir).filter((f) => f.endsWith(".source.txt")).sort().map((f) => ({ id: f.slice(0, -11), ...rec(dir + f) }))
  .filter((r) => r.status === "installed" || (all && r.status === "rejected"));
const hashes = new Map();
for (const r of items) {
  if (!r.file) continue;
  const h = createHash("sha256").update(readFileSync(dir + r.file)).digest("hex");
  hashes.set(h, [...(hashes.get(h) ?? []), r.id]);
  r.hash = h;
}
const wordmark = (id) => readdirSync(pub + "logos").find((f) => f.startsWith(id + ".") && !f.endsWith(".txt"));

const cell = (r, dark) => {
  const dup = (hashes.get(r.hash) ?? []).length > 1;
  const full = r.display ? r.display === "full" : r.opaque === "yes";
  const tile = r.tile === "dark" ? "#111" : "#fff";
  const img = `<img src="file://${dir}${r.file}" style="width:100%;height:100%;object-fit:contain">`;
  const wm = wordmark(r.id);
  return `<div style="display:flex;align-items:center;gap:8px;padding:6px;border-radius:10px;${dup ? "outline:3px solid red;" : ""}${r.status === "rejected" ? "opacity:.4;" : ""}">
    <div style="width:64px;height:64px;border-radius:14px;overflow:hidden;flex:none;${full ? "" : `background:${tile};padding:7px;box-sizing:border-box;`}box-shadow:0 0 0 1px ${dark ? "#333" : "#ddd"}">${img}</div>
    <div style="font:11px/1.25 system-ui;color:${dark ? "#ddd" : "#222"};min-width:0;overflow-wrap:anywhere">${r.id}<br><span style="opacity:.6">${r.kind ?? ""}${full ? " · full" : ""}${dup ? " · DUPLICATE" : ""}</span>
    ${wm ? `<div style="margin-top:3px;height:22px;width:110px;background:#fff;border-radius:4px;padding:2px"><img src="file://${pub}logos/${wm}" style="height:100%;max-width:100%;object-fit:contain"></div>` : ""}</div></div>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
const PER = 40;
for (let i = 0; i * PER < items.length; i++) {
  const chunk = items.slice(i * PER, (i + 1) * PER);
  for (const dark of [false, true]) {
    const html = `${out}/sheet.html`;
    writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px;background:${dark ? "#0b130f" : "#f3f7f4"}"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${chunk.map((r) => cell(r, dark)).join("")}</div></body>`);
    await page.goto(`file://${html}`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const file = `${out}/square-${String(i + 1).padStart(2, "0")}-${dark ? "dark" : "light"}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
}
for (const [, ids] of hashes) if (ids.length > 1) console.log("DUPLICATE:", ids.join(", "));
console.log(`${items.length} icons`);
await browser.close();
