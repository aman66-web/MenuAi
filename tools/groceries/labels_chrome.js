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
  // "Oops" alone is not a block: Morrisons heads a product it no longer sells "Oops"; Tesco's security page says "Oops" and "failed some security checks"
  const blocked = /verify you are human|you have been blocked|pardon our interruption|are you a robot|checking your browser|unusual traffic|access denied|just a moment|something is not right/i.test(h1text + " " + document.title)
    || (/\boops\b/i.test(h1text + " " + document.title) && /security check|failed some security|something is not right/i.test(head))
    || (!h1text && /captcha|access denied|verify you are human/i.test(head));
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
  // every heading or label that is just "Ingredients" (or starts with it, as Morrisons's does), tried in page order until one is followed by a real list: on Tesco
  // the first "Ingredients" heading sits over a box holding the nutrition table too, and a smaller "Ingredients" heading inside it holds the list itself
  const after = (el) => {
    let n = el.nextElementSibling || (el.parentElement && el.parentElement.nextElementSibling);
    if (!n && el.parentElement) n = el.parentElement.querySelector(":scope > *:not(:first-child)");
    return n;
  };
  const labels = [...document.querySelectorAll("h2, h3, h4, dt, summary, button, strong, b, span, p, div")].filter((el) => /^ingredients:?$/i.test((el.textContent || "").trim()))
    .concat([...document.querySelectorAll("h2, h3, h4, dt, summary")].filter((el) => /^ingredients\b/i.test((el.textContent || "").trim()) && (el.textContent || "").length < 200));
  let ingredients = "";
  let label = null;
  for (const el of labels) {
    const n = after(el);
    let t = clean(n ? n.textContent : "").replace(/^ingredients:?\s*/i, "");
    // a box that holds the nutrition table too (Tesco puts the list and the table under one heading, with a smaller "Ingredients" heading inside) is not the list
    if (!t || /typical values|nutrition(al)? information|\bkcal\b|\d\s*kj\b/i.test(t)) continue;
    // the list ends where the page's next section starts ("Allergy Advice", "Lifestyle", "Storage" on Waitrose)
    // (capitalised section headings only, so "Pork (UK origin)" or "pasteurised for storage" inside a list never cut it)
    t = t.replace(/\s*(Allergy Advice|ALLERGY ADVICE|Allergy Information|ALLERGY INFORMATION|Allergen Information|Lifestyle|Storage|Dietary Information|Preparation and Usage)(?=[A-Z:\s]|$).*$/, "");
    ingredients = t.slice(0, 1600);
    label = el;
    break;
  }
  // the allergens as the shop marks them (founder 2026-11-17: "also the allergens"): the words it prints in bold inside the ingredients (UK labels emphasise the 14
  // allergens), and the text of its own "Allergy information" / "Allergens" / "May contain" section, as printed (folded sections included); "" / [] when none
  const bold = label ? (() => {
    const el = after(label);
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
      // only what labels_iceland.py reads (each nutrient's name and values), so the result stays short; the allergen lists come back in a call of their own
      const ni = p && p.nutritionInformation;
      if (p) iceland = JSON.parse(JSON.stringify({ page_id: String(p.id || ""), page_name: p.name || "",
        nutritionInformation: ni ? { headings: ni.headings || [], nutrients: (ni.nutrients || []).map((n) => ({ name: n.name, values: n.values })) } : null,
        drainedWeight: p.drainedWeight || null, contains: p.allergenContains || null, mayContain: p.allergenMayContain || null }).replace(/&/g, " and ").replace(/[?=]/g, " "));
    } catch (e) { iceland = null; }
  }
  // the browser tool cuts a result off at about 1,000 characters: the ingredients come back in two halves of at most 800
  // Co-op's catalogue (coop.co.uk/products, open to robots; its online shop is behind a bot check, so never read): name, price and photo as the page gives them in
  // its own structured data, and the price line as printed (with any deal); it prints no nutrition or ingredients
  let coop = null;
  if (host === "coop.co.uk") {
    try {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((x) => { try { return JSON.parse(x.textContent); } catch (e) { return null; } }).find((x) => x && x["@type"] === "Product");
      const t = document.body ? document.body.innerText : "";
      const i = t.search(/£\d/);
      const o = (ld && ld.offers) || {};
      coop = { name: clean(ld && ld.name), price: String(o.price || ""), until: String(o.priceValidUntil || "").slice(0, 10), stock: String(o.availability || "").split("/").pop(),
        priceText: i >= 0 ? clean(t.slice(i, i + 160)) : "", image: ((document.querySelector('meta[property="og:image"]') || {}).content || "").replace(/[?=&].*$/, "") };
    } catch (e) { coop = null; }
  }
  if (mode === "ing") return JSON.stringify({ want, host, part: "ing", ingredients: ingredients.slice(0, 800) });
  if (mode === "ing2") return JSON.stringify({ want, host, part: "ing2", ingredients: ingredients.slice(800, 1600) });
  // Iceland's record comes back in a third call ("ice"), so the main result stays short enough never to be cut off
  if (mode === "ice") return JSON.stringify({ want, host, part: "ice", iceland: iceland && { ...iceland, contains: undefined, mayContain: undefined } });
  if (mode === "ice2") return JSON.stringify({ want, host, part: "ice2", contains: iceland && iceland.contains, mayContain: iceland && iceland.mayContain });
  return JSON.stringify({ want, host, part: "main", v: 4, id, h1: h1.slice(0, 90), blocked, nut, above: above.trim().slice(0, 120), bold: bold.slice(0, 10).map((w) => w.slice(0, 25)), allergy, mayContain: mayContain.map((m) => m.slice(0, 110)), ingLen: ingredients.length, coop, checked_on: new Date().toISOString().slice(0, 10) });
})
