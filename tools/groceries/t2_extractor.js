// Tier 2 extractor v4 for a Sainsbury's product page (docs/GROCERIES_PLAN.md "Every product"). Run it with javascript_tool on a loaded product page
// (about 3 s after navigation; call it as `await (0, eval)(sessionStorage.getItem('t2x'))`). It first opens the page's collapsed "Nutrition" accordion
// (a display toggle, nothing is sent or changed) because the table is not in the page until it is open. It prints ONE short line, copied by the agent exactly as printed, into tools/groceries/t2_sainsburys.py append:
//   <slug check>|<basis>|kJ|kcal|fat|saturates|carbohydrate|sugars|fibre|protein|salt|<line check>      the numbers as the table prints them, units removed
//   NONE|<slug check>   the page has no nutrition table (alcohol, non-food, removed)      WAIT   the page has not finished loading: wait 3 s and run it again
// basis is g or ml for a plain "per 100g" / "per 100ml" column ("(as sold)" is plain), or g:grilled / ml:prepared / g:cooked bacon ... when that column's own
// heading adds a word (the numbers are then for the grilled, cooked or prepared food, and the app labels them so); ? when there is no per-100 column.
// The "per 100" column is the one read, never a per-serving column. Labels like "of which saturates (g)", an energy row split into kJ and kcal rows and
// "Energy (kj)" rows without units are read; a value the table does not print stays empty (never filled in). Both checks are the same 4-character base-36
// hash (h = h*31 + code unit, mod 1679616, from 7): the slug check proves which page was read; the line check catches any typing slip.
(async () => {
  const H = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1679616; return h.toString(36).padStart(4, "0"); };
  const slug = location.pathname.split("/").filter(Boolean).pop() || "";
  const sum = [...document.querySelectorAll("summary")].find((e) => /^Nutrition$/i.test((e.innerText || "").trim()));
  if (sum && sum.parentElement && !sum.parentElement.open) sum.click();
  let tb = null;
  for (let i = 0; i < 5 && !tb; i++) { await new Promise((r) => setTimeout(r, i ? 600 : 900)); tb = [...document.querySelectorAll("table")].find((t) => /Nutritional Information/i.test(t.innerText)); }
  if (!tb) return document.body.innerText.length < 1500 ? "WAIT" : "NONE|" + H(slug);
  const rows = [...tb.querySelectorAll("tr")].map((r) => [...r.children].map((c) => c.innerText.replace(/\s+/g, " ").trim()));
  const head = rows[0] || [];
  const qual = (cell) => cell.toLowerCase().replace(/typical values|per\s*100\s*(g|ml)(\/ml)?|\(as sold\)|as sold|this pack contains[^a-z]*\d*\s*servings?|[:()\d,.]/g, " ").replace(/\s+/g, " ").trim();
  const cands = head.map((c, i) => [c, i]).filter(([c]) => /per\s*100\s*(g|ml)/i.test(c));
  const pickC = cands.find(([c]) => !qual(c)) || cands[0];
  const col = pickC ? pickC[1] : 1;
  const unit = pickC ? (/per\s*100\s*ml/i.test(pickC[0]) ? "ml" : "g") : "";
  const q = pickC ? qual(pickC[0]).replace(/[^a-z ]/g, "").slice(0, 24).trim() : "";
  const basis = unit ? unit + (q ? ":" + q : "") : "?";
  const lab = (r) => (r[0] || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/^[\s\-–:]*of which\s*/, "").replace(/[:\s]+$/, "").trim();
  const num = (r) => { const t = r[col] || ""; if (/mg|µg|μg/i.test(t)) return "?"; const m = t.match(/<?\s*\d+(?:[.,]\d+)?/); return m ? m[0].replace(/\s+/g, "").replace(",", ".") : ""; };
  const pick = (names) => { const r = rows.find((x) => names.includes(lab(x))); return r ? num(r) : ""; };
  let kj = "", kcal = "";
  for (const r of rows.slice(1, 7)) {
    const l = (r[0] || "").toLowerCase(), v = r[col] || "";
    if (!kj && (/kj/.test(l) || /kj/i.test(v))) { const m = v.match(/(\d[\d,.]*)\s*(kJ)?/i); if (m && (/kj/.test(l) || m[2])) kj = m[1].replace(/,/g, ""); }
    if (!kcal && (/kcal/.test(l) || /kcal/i.test(v))) { const m = v.match(/(\d[\d,.]*)\s*(kcal)?/i); if (m && (/kcal/.test(l) || m[2])) kcal = m[1].replace(/,/g, ""); }
  }
  const f = [basis, kj, kcal, pick(["fat", "total fat"]), pick(["saturates", "saturated fat", "saturated fats", "saturated"]), pick(["carbohydrate", "carbohydrates", "total carbohydrate", "total carbohydrates", "available carbohydrate"]),
    pick(["sugars", "sugar", "total sugars"]), pick(["fibre", "dietary fibre", "fiber"]), pick(["protein", "proteins"]), pick(["salt", "salt equivalent"])];
  const body = f.join("|");
  return H(slug) + "|" + body + "|" + H(body);
})()
