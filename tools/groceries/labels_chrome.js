// Reads a supermarket product page's nutrition table in the founder's own Chrome (Claude in Chrome), for shops whose pages refuse scripted requests
// (Asda: Cloudflare; Aldi: Akamai). It only reads what the open page shows: no clicks, no requests, no cookies. Run with javascript_tool on the product page
// after it has loaded; it returns one JSON line for tools/groceries/labels_chrome_ingest.py. Nothing here works round a block: a bot check or "access denied"
// page sets blocked=true and the reader must stop.
(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const head = clean(document.body ? document.body.innerText.slice(0, 4000) : "");
  const blocked = /verify you are human|you have been blocked|access denied|are you a robot|captcha|unusual traffic|checking your browser/i.test(head);
  const id = location.pathname.split("/").filter(Boolean).pop() || "";
  const h1 = clean(document.querySelector("h1") && document.querySelector("h1").innerText);
  const tables = [...document.querySelectorAll("table")].map((tb) => [...tb.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => clean(c.innerText))));
  const nut = tables.find((t) => t.some((r) => /energy/i.test(r[0] || "") || /energy/i.test(r.join(" ")))) || null;
  // the words just above the table (e.g. "Nutritional Values", "Typical values per 100g as sold")
  let above = "";
  const tb = [...document.querySelectorAll("table")].find((x) => /energy/i.test(x.innerText));
  if (tb) {
    let el = tb.previousElementSibling;
    for (let i = 0; i < 3 && el; i++, el = el.previousElementSibling) above = clean(el.innerText).slice(0, 200) + " " + above;
  }
  return JSON.stringify({ id, h1, blocked, above: above.trim(), nut, checked_on: new Date().toISOString().slice(0, 10) });
})()
