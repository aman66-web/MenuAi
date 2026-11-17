// Reads a supermarket product page's nutrition table in the founder's own Chrome (Claude in Chrome), for shops whose pages refuse scripted requests
// (Asda: Cloudflare; Aldi: Akamai). It only reads what the open page shows: no clicks, no requests, no cookies. Run with javascript_tool on the product page
// after it has loaded; it returns one JSON line for tools/groceries/labels_chrome_ingest.py. Nothing here works round a block: a bot check or "access denied"
// page sets blocked=true and the reader must stop.
(() => {
  // "&", "?" and "=" are written as words or spaces: the Chrome extension hides any result that looks like web-address data ("Broccoli, Carrots & Sugar Snap Peas")
  const clean = (s) => (s || "").replace(/&/g, " and ").replace(/[?=]/g, " ").replace(/\s+/g, " ").trim();
  const head = clean(document.body ? document.body.innerText.slice(0, 4000) : "");
  // a bot check names itself in the page's title or heading ("Pardon Our Interruption", "Sorry, you have been blocked", "Access Denied"); a product page
  // that only mentions "captcha" in its small print is not one
  const h1text = clean(document.querySelector("h1") && document.querySelector("h1").innerText);
  const blocked = /verify you are human|you have been blocked|pardon our interruption|are you a robot|checking your browser|unusual traffic|access denied|just a moment/i.test(h1text + " " + document.title) || (!h1text && /captcha|access denied|verify you are human/i.test(head));
  const id = location.pathname.split("/").filter(Boolean).pop() || "";
  const h1 = clean(document.querySelector("h1") && document.querySelector("h1").innerText);
  // textContent, not innerText: some shops keep the table in a folded "Nutritional Information" section (Aldi), where innerText is empty
  const tables = [...document.querySelectorAll("table")].map((tb) => [...tb.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => clean(c.textContent))));
  const nut = tables.find((t) => t.some((r) => /energy/i.test(r.join(" ")))) || null;
  // the words just above the table (e.g. "Nutritional Values", "Typical values per 100g as sold")
  let above = "";
  const tb = [...document.querySelectorAll("table")].find((x) => /energy/i.test(x.textContent));
  if (tb) {
    let el = tb.previousElementSibling;
    for (let i = 0; i < 3 && el; i++, el = el.previousElementSibling) above = clean(el.innerText).slice(0, 200) + " " + above;
  }
  return JSON.stringify({ id, h1, blocked, above: above.trim(), nut, checked_on: new Date().toISOString().slice(0, 10) });
})()
