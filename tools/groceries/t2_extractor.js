// Tier 2 extractor for a Sainsbury's product page (docs/GROCERIES_PLAN.md "Every product"). Run it with javascript_tool on a loaded product page
// (about 3 s after navigation). It prints ONE short line, copied by the agent exactly as printed, into tools/groceries/t2_sainsburys.py append:
//   <slug check>|<basis g or ml>|kJ|kcal|fat|saturates|carbohydrate|sugars|fibre|protein|salt|<line check>      the numbers as the table prints them, units removed
//   NONE|<slug check>   the page has no nutrition table (alcohol, non-food, removed)      WAIT   the page has not finished loading: wait 3 s and run it again
// Both checks are the same 4-character base-36 hash (h = h*31 + code unit, mod 1679616, starting at 7): the slug check proves which page was read
// (the tool matches it to the slug it handed out); the line check catches any typing slip. Nothing is estimated: a row the table lacks stays empty.
(() => {
  const H = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1679616; return h.toString(36).padStart(4, "0"); };
  const slug = location.pathname.split("/").filter(Boolean).pop() || "";
  const tb = [...document.querySelectorAll("table")].find((t) => /Nutritional Information/i.test(t.innerText));
  if (!tb) return document.body.innerText.length < 1500 ? "WAIT" : "NONE|" + H(slug);
  const rows = [...tb.querySelectorAll("tr")].map((r) => [...r.children].map((c) => c.innerText.trim()));
  const head = (rows[0] || [])[1] || "";
  const basis = /100\s*ml/i.test(head) ? "ml" : /100\s*g/i.test(head) ? "g" : "?";
  const clean = (v) => (v || "").replace(/\s+/g, "").replace(/(kJ|kcal|mg|µg|g|ml)$/i, "");
  const find = (label, unit) => { const r = rows.find((x) => label.test(x[0] || "") && (!unit || unit.test(x[1] || ""))); return r ? clean(r[1]) : ""; };
  const f = [basis, find(/^energy/i, /kJ/i) || find(/^$/, /kJ/i), find(/^energy|^$/i, /kcal/i), find(/^fat$/i), find(/^saturate/i), find(/^(available\s+)?carbohydrate/i), find(/^sugars?/i), find(/^fibre/i), find(/^protein/i), find(/^salt/i)];
  const body = f.join("|");
  return H(slug) + "|" + body + "|" + H(body);
})()
