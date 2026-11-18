// Reads a supermarket product page's nutrition table in the founder's own Chrome (Claude in Chrome), for shops whose pages refuse scripted requests
// (Asda: Cloudflare; Aldi: Akamai). It only reads what the open page shows: no clicks, no requests, no cookies. Run with javascript_tool on the product page
// after it has loaded; it returns one JSON line for tools/groceries/labels_chrome_ingest.py. Nothing here works round a block: a bot check or "access denied"
// page sets blocked=true and the reader must stop.
((mode, want) => {
  // "&", "?" and "=" are written as words or spaces: the Chrome extension hides any result that looks like web-address data ("Broccoli, Carrots & Sugar Snap Peas")
  const clean = (s) => (s || "").replace(/&/g, " and ").replace(/[?=]/g, " ").replace(/\s+/g, " ").trim();
  const head = clean(document.body ? document.body.innerText.slice(0, 4000) : "");
  // a bot check names itself in the page's title or heading ("Pardon Our Interruption", "Sorry, you have been blocked", "Access Denied"); a product page
  // that only mentions "captcha" in its small print is not one
  const h1text = clean(document.querySelector("h1") && document.querySelector("h1").innerText);
  const blocked = /verify you are human|you have been blocked|pardon our interruption|are you a robot|checking your browser|unusual traffic|access denied|just a moment|oops|something is not right/i.test(h1text + " " + document.title) || (!h1text && /captcha|access denied|verify you are human/i.test(head));
  const id = location.pathname.split("/").filter(Boolean).pop() || "";
  const h1 = clean(document.querySelector("h1") && document.querySelector("h1").innerText);
  // textContent, not innerText: some shops keep the table in a folded "Nutritional Information" section (Aldi), where innerText is empty
  const tables = [...document.querySelectorAll("table")].map((tb) => [...tb.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => clean(c.textContent))));
  // the table, trimmed to fit one result (the browser tool cuts results at about 1,500 characters): rows that carry a figure or name the columns, the first three
  // columns only (the label, then per 100 g or ml and usually per portion; the % reference intake columns are left out), each cell at most 40 characters
  const full = tables.find((t) => t.some((r) => /energy/i.test(r.join(" ")))) || null;
  const nut = full ? full.filter((r, i) => i === 0 || /\d|typical|per 100/i.test(r.join(" "))).slice(0, 16).map((r) => r.slice(0, 3).map((c) => c.slice(0, 40))) : null;
  // the words just above the table (e.g. "Nutritional Values", "Typical values per 100g as sold")
  let above = "";
  const tb = [...document.querySelectorAll("table")].find((x) => /energy/i.test(x.textContent));
  if (tb) {
    let el = tb.previousElementSibling;
    for (let i = 0; i < 3 && el; i++, el = el.previousElementSibling) above = clean(el.innerText).slice(0, 200) + " " + above;
  }
  // the ingredients list as the page prints it (founder 2026-11-17: "make sure you get all ingredients and nutritional information"): the text after the first heading or
  // label that is just "Ingredients", from the page's own text (folded sections included), at most 2,000 characters; "" when the page shows none
  let ingredients = "";
  // a heading that is just "Ingredients", or one that starts with it (Morrisons: "Ingredients (ingredients and allergens may be subject to change ...)")
  const label = [...document.querySelectorAll("h2, h3, h4, dt, summary, button, strong, b, span, p, div")].find((el) => /^ingredients:?$/i.test((el.textContent || "").trim()))
    || [...document.querySelectorAll("h2, h3, h4, dt, summary")].find((el) => /^ingredients\b/i.test((el.textContent || "").trim()) && (el.textContent || "").length < 200);
  if (label) {
    let el = label.nextElementSibling || (label.parentElement && label.parentElement.nextElementSibling);
    if (!el && label.parentElement) el = label.parentElement.querySelector(":scope > *:not(:first-child)");
    ingredients = clean(el ? el.textContent : "");
    // text that is really the nutrition table (some shops put both under one heading) is not an ingredients list
    if (/energy|kcal|typical values/i.test(ingredients.slice(0, 200))) ingredients = "";
    ingredients = ingredients.slice(0, 1500);
  }
  // the allergens as the shop marks them (founder 2026-11-17: "also the allergens"): the words it prints in bold inside the ingredients (UK labels emphasise the 14
  // allergens), and the text of its own "Allergy information" / "Allergens" / "May contain" section, as printed (folded sections included); "" / [] when none
  const bold = label ? (() => {
    let el = label.nextElementSibling || (label.parentElement && label.parentElement.nextElementSibling);
    return el ? [...new Set([...el.querySelectorAll("strong, b")].map((x) => clean(x.textContent)).filter((w) => w && w.length <= 40))] : [];
  })() : [];
  let allergy = "";
  const alabel = [...document.querySelectorAll("h2, h3, h4, dt, summary, button, strong, b, span, p, div")].find((el) => /^(allergy information|allergen information|allergens|allergy advice|dietary information and allergens)$/i.test((el.textContent || "").trim()));
  if (alabel) {
    let el = alabel.nextElementSibling || (alabel.parentElement && alabel.parentElement.nextElementSibling);
    allergy = clean(el ? el.textContent : "").slice(0, 150);
  }
  const mayContain = (clean(document.body ? document.body.textContent : "").match(/(may contain[^.{]{0,100}\.|not suitable for[^.{]{0,100}\.|made in a (?:factory|site|kitchen)[^.{]{0,100}\.)/gi) || []).slice(0, 1);
  // the ingredients come back in a call of their own ("ing"), so a long list is never cut off with the table; every result names the product asked
  // for ("want") and the site, so it can be copied from the transcript byte for byte
  const host = location.hostname.replace(/^www\./, "");
  // Iceland draws its nutrition panel from data embedded in the page (no table): the product's own record there, as labels_iceland.py reads it from the
  // same page, with "&", "?" and "=" written as words or spaces like everything else
  let iceland = null;
  if (host === "iceland.co.uk") {
    try {
      const d = JSON.parse(document.getElementById("mobify-data").textContent);
      const p = d.__PRELOADED_STATE__.__STATE_MANAGEMENT_LIBRARY.store.productStore.productsById[want];
      if (p) iceland = JSON.parse(JSON.stringify({ page_id: String(p.id || ""), page_name: p.name || "", nutritionInformation: p.nutritionInformation || null,
        drainedWeight: p.drainedWeight || null, contains: p.allergenContains || null, mayContain: p.allergenMayContain || null }).replace(/&/g, " and ").replace(/[?=]/g, " "));
    } catch (e) { iceland = null; }
  }
  if (mode === "ing") return JSON.stringify({ want, host, part: "ing", ingredients });
  // Iceland's record comes back in a third call ("ice"), so the main result stays short enough never to be cut off
  if (mode === "ice") return JSON.stringify({ want, host, part: "ice", iceland });
  return JSON.stringify({ want, host, part: "main", id, h1: h1.slice(0, 90), blocked, nut, above: above.trim().slice(0, 120), bold: bold.slice(0, 14), allergy, mayContain, ingLen: ingredients.length, checked_on: new Date().toISOString().slice(0, 10) });
})
