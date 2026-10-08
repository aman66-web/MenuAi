// Reads Boston Tea Party's own online-ordering menu (https://bostonteaparty.vmos.io, linked from bostonteaparty.co.uk "Order now")
// in a headless browser and saves, per menu category, the JSON the page itself loads
// (https://vmos2.vmos.io/catalog/categories/<uuid>/bundles): dish names and ids. Photos are NOT downloaded here; images_boston_tea_party.py
// does that with robots.txt and pacing. The ordering app only answers inside a browser session (it needs a selected store/menu first).
//
//   node tools/uk_extract/images_boston_tea_party_dump.js <out-dir> <playwright-core-path> [store-index ...]   (default stores 0 and 1)
//
// One page load per category, 3 seconds apart; nothing is clicked except "View Menu" for the chosen cafe.
const { chromium } = require(process.argv[3]);
const fs = require('fs');
const OUT = process.argv[2];
const STORES = process.argv.slice(4).map(Number);
if (!STORES.length) STORES.push(0, 1);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const si of STORES) {
    const ctx = await b.newContext({ userAgent: UA, viewport: { width: 1200, height: 1400 } });
    const p = await ctx.newPage();
    let cur = null;
    p.on('response', async r => {
      const m = r.url().match(/vmos2\.vmos\.io\/catalog\/categories\/([0-9a-f-]{36})\/bundles/);
      if (m && r.status() === 200) { try { fs.writeFileSync(`${OUT}/store${si}_${m[1]}.json`, await r.text()); cur = m[1]; } catch (e) {} }
    });
    await p.goto('https://bostonteaparty.vmos.io/store/store-selection?app=online', { waitUntil: 'networkidle', timeout: 60000 });
    await p.fill('input', 'BA1 1SR'); await p.waitForTimeout(1500);
    await p.click('text=BA1 1SR, Bath'); await p.waitForTimeout(3000);
    await p.click(`text=View Menu >> nth=${si}`);
    await p.waitForSelector('a[href*="/menu/category/"]', { timeout: 40000 }).catch(() => {});
    await p.waitForTimeout(2000);
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[href*="/menu/category/"]')].map(a => a.href));
    const uniq = [...new Set(hrefs)];
    console.log(`store ${si}: ${uniq.length} categories`);
    for (const h of uniq) {
      cur = null;
      await p.goto(h, { waitUntil: 'networkidle', timeout: 60000 });
      await p.waitForTimeout(3000);
      console.log('  ', h.split('/menu/category/')[1].slice(0, 36), cur ? 'saved' : 'NO DATA');
    }
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
