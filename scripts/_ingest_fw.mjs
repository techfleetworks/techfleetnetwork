import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i+1] === '"') { field+='"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\n') { row.push(field); rows.push(row); row=[]; field=""; }
      else if (ch === '\r') {}
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ""));
}
const slugify = s => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,200);
const pickCol = (h, cands) => { const lc = h.map(x=>x.trim().toLowerCase().replace(/^\ufeff/,"")); for (const c of cands) { const i = lc.indexOf(c.toLowerCase()); if (i>=0) return i; } return -1; };

const datasets = [
  { file: "skills.csv", table: "reference_skills",
    descCands: ["Skill Description","Description"],
    catCands: ["Tech Job Category","Skill Type","Category"] },
  { file: "practices.csv", table: "reference_practices",
    descCands: ["Practice Description","Description"],
    catCands: ["Data Type","Category"] },
  { file: "activities.csv", table: "reference_activities",
    descCands: ["Activity Description","Description"],
    catCands: ["Category","Data Type"] },
  { file: "duties.csv", table: "reference_duties",
    descCands: ["Commitment Description","Description"],
    catCands: ["Tech Career Category","Category"] },
];

for (const ds of datasets) {
  const text = readFileSync(`/dev-server/public/data/${ds.file}`, "utf8");
  const rows = parseCsv(text);
  const headers = rows[0].map(h => h.replace(/^\ufeff/, "").trim());
  const nameIdx = 0;
  const descIdx = pickCol(headers, ds.descCands);
  const catIdx = pickCol(headers, ds.catCands);
  const upserts = []; const seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (row[nameIdx]||"").trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const desc = descIdx>=0 ? (row[descIdx]||"").trim() : "";
    const cat = catIdx>=0 ? (row[catIdx]||"").trim() : "";
    const data = {};
    for (let c = 0; c < headers.length && c < row.length; c++) {
      if (c===nameIdx||c===descIdx||c===catIdx) continue;
      const k = headers[c]; if (!k || k.endsWith(" copy")) continue;
      const v = (row[c]||"").trim(); if (!v) continue;
      data[k] = v.length > 8000 ? v.slice(0,8000) : v;
    }
    upserts.push({
      slug, name: name.slice(0,500),
      description: desc.slice(0,8000),
      category: cat.slice(0,200),
      data, source: "csv",
      source_row_id: `${ds.file}#${r}`, is_active: true,
    });
  }
  let total = 0;
  for (let i = 0; i < upserts.length; i += 50) {
    const chunk = upserts.slice(i, i+50);
    const { error } = await sb.from(ds.table).upsert(chunk, { onConflict: "slug" });
    if (error) { console.error(`${ds.table} batch ${i}:`, error.message); process.exit(1); }
    total += chunk.length;
  }
  console.log(`${ds.table}: upserted ${total}`);
}
