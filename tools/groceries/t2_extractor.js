// Tier 2 extractor v2 for a Sainsbury's product page (docs/GROCERIES_PLAN.md "Every product"). Run it with javascript_tool on a loaded product page
// (about 3 s after navigation). It prints ONE short line, copied by the agent exactly as printed, into tools/groceries/t2_sainsburys.py append:
//   <slug check>|<basis>|kJ|kcal|fat|saturates|carbohydrate|sugars|fibre|protein|salt|<line check>      the numbers as the table prints them, units removed
//   NONE|<slug check>   the page has no nutrition table (alcohol, non-food, removed)      WAIT   the page has not finished loading: wait 3 s and run it again
// basis is g or ml only when the table's own heading says plain "per 100g" / "per 100ml" ("(as sold)" allowed); any other wording (cooked, prepared, drained, per
// serving only...) prints g? or ml? or ?, and the tool keeps those out of the app. Labels like "of which saturates (g)" and an energy row split into kJ and kcal rows
// are read; a value the table does not print stays empty (never filled in). Both checks are the same 4-character base-36 hash (h = h*31 + code unit, mod 1679616,
// from 7): the slug check proves which page was read; the line check catches any typing slip.
(() => {
  const H = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1679616; return h.toString(36).padStart(4, "0"); };
  const slug = location.pathname.split("/").filter(Boolean).pop() || "";
  const tb = [...document.querySelectorAll("table")].find((t) => /Nutritional Information/i.test(t.innerText));
  if (!tb) return document.body.innerText.length < 1500 ? "WAIT" : "NONE|" + H(slug);
  const rows = [...tb.querySelectorAll("tr")].map((r) => [...r.children].map((c) => c.innerText.replace(/\s+/g, " ").trim()));
  const head = (rows[0] || []).join(" ").toLowerCase();
  const unit = /per\s*100\s*ml/.test(head) ? "ml" : /per\s*100\s*g/.test(head) ? "g" : "";
  const plain = /^(\(as sold\)\s*|typical values\s*)*(per\s*100\s*(g|ml))\s*:?\s*(.*\bserving\b.*)?$/.test(head.replace(/^[^a-z(]+/, "")) && !/(cooked|prepared|drained|made up|reconstituted|when|grilled|fried|roast|baked)/.test(head);
  const basis = unit ? (plain ? unit : unit + "?") : "?";
  const lab = (r) => (r[0] || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/^[\s\-–:]*of which\s*/, "").replace(/[:\s]+$/, "").trim();
  const num = (r) => { const t = (r[1] || ""); if (/mg|µg|μg/i.test(t)) return "?"; const m = t.match(/<?\s*\d+(?:[.,]\d+)?/); return m ? m[0].replace(/\s+/g, "").replace(",", ".") : ""; };
  const pick = (names) => { const r = rows.find((x) => names.includes(lab(x))); return r ? num(r) : ""; };
  let kj = "", kcal = "";
  for (const r of rows.slice(0, 6)) { const t = r.join(" "); if (!kj) { const m = t.match(/(\d[\d,.]*)\s*kJ/i); if (m) kj = m[1].replace(/,/g, ""); } if (!kcal) { const m = t.match(/(\d[\d,.]*)\s*kcal/i); if (m) kcal = m[1].replace(/,/g, ""); } }
  const f = [basis, kj, kcal, pick(["fat", "total fat"]), pick(["saturates", "saturated fat", "saturated fats", "saturated"]), pick(["carbohydrate", "carbohydrates", "total carbohydrate", "total carbohydrates", "available carbohydrate"]),
    pick(["sugars", "sugar", "total sugars"]), pick(["fibre", "dietary fibre", "fiber"]), pick(["protein", "proteins"]), pick(["salt", "salt equivalent"])];
  const body = f.join("|");
  return H(slug) + "|" + body + "|" + H(body);
})()
