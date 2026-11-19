// Reads one Co-op catalogue page (www.coop.co.uk/products/<slug>, open to robots) from a tab that stays on www.coop.co.uk, in the founder's own Chrome. It loads
// the page with redirects switched off: a product whose catalogue page sends visitors on to Co-op's online shop (shop.coop.co.uk, which is behind a bot check and
// is never read) is recorded as "moved" and the shop is never loaded. A catalogue page that is itself a bot check or an error sets blocked=true: the reader stops.
// Stored in the tab by labels_chrome_next.py coop --install; each call returns one JSON line copied from the transcript by labels_chrome_next.py --harvest.
(async (want) => {
  const clean = (s) => (s || "").replace(/&/g, " and ").replace(/[?=]/g, " ").replace(/\s+/g, " ").trim();
  const base = { want, host: "coop.co.uk", part: "main", v: 4, nut: null, checked_on: new Date().toISOString().slice(0, 10) };
  let res;
  try {
    res = await fetch("/products/" + want, { redirect: "manual", credentials: "same-origin" });
  } catch (e) {
    return JSON.stringify({ ...base, failed: true });
  }
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) return JSON.stringify({ ...base, moved: true });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = clean(doc.title);
  const blocked = res.status === 401 || res.status === 403 || res.status === 429 || /pardon our interruption|verify you are human|access denied|captcha|incapsula|are you a robot/i.test(title + " " + html.slice(0, 3000));
  if (blocked) return JSON.stringify({ ...base, blocked: true, h1: title.slice(0, 90) });
  if (res.status >= 400) return JSON.stringify({ ...base, gone: res.status, h1: title.slice(0, 90) });
  const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((x) => { try { return JSON.parse(x.textContent); } catch (e) { return null; } }).find((x) => x && x["@type"] === "Product");
  const o = (ld && ld.offers) || {};
  doc.querySelectorAll("script, style, noscript").forEach((x) => x.remove());
  const text = clean(doc.body ? doc.body.textContent : "");
  const i = text.search(/£\d/);
  const h1 = clean(doc.querySelector("h1") && doc.querySelector("h1").textContent);
  const coop = { name: clean(ld && ld.name), price: String(o.price || ""), until: String(o.priceValidUntil || "").slice(0, 10), stock: String(o.availability || "").split("/").pop(),
    priceText: i >= 0 ? text.slice(i, i + 160) : "", image: ((doc.querySelector('meta[property="og:image"]') || {}).content || "").replace(/[?=&].*$/, "") };
  return JSON.stringify({ ...base, id: want, h1: h1.slice(0, 90), blocked: false, coop });
})
