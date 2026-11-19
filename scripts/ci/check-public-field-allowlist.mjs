#!/usr/bin/env node
// ci-lane: critical
/**
 * CI gate (public-access A7): no `public-*` edge function may select a §6-resource
 * column outside the ANON allowlist.
 *
 * The auth-aware gateways select via the shared policy (`fieldsFor(...)` /
 * `projectCardFields(...)` / `clientCardFields(...)`) and are compliant by
 * construction — the guard recognizes those and skips them. The guard exists to
 * catch a HARDCODED literal `.select("...")` on classes/cohorts/projects/clients
 * that leaks a non-allowlisted (or authed-only) column to anon.
 *
 * Fail-closed: a literal resource-select the parser can't understand is a
 * violation, not a silent pass. Exempt a specific file with a `// a7-allow: <why>`
 * comment (the reason is printed, so a waiver is visible and greppable).
 *
 * The allowlist is read from the single source of truth
 * (supabase/functions/_shared/public-visibility.ts → ANON_FIELDS), so there is no
 * second copy to drift. Core logic is exported for the discriminating self-test
 * (src/test/ci/check-public-field-allowlist.test.ts), per verifiable-quality-gates.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const TABLE_TO_RESOURCE = {
  classes: "class",
  cohorts: "cohort",
  projects: "project",
  clients: "client",
  // System A (public-access A8): the free Core-course outline gateway.
  course_catalog: "course",
  lesson_catalog: "lesson",
};
const POLICY_CALLS = ["fieldsFor(", "projectCardFields(", "clientCardFields("];

/** Parse ANON_FIELDS from the policy source into { resource: Set<column> }. */
export function parseAnonAllowlist(policySource) {
  const block = policySource.match(/const\s+ANON_FIELDS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!block) throw new Error("A7: could not locate `const ANON_FIELDS = { ... } as const` in public-visibility.ts");
  const allow = {};
  const re = /(\w+)\s*:\s*\n?\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block[1]))) {
    allow[m[1]] = new Set(m[2].split(",").map((c) => c.trim()).filter(Boolean));
  }
  for (const r of ["class", "cohort", "project", "client", "course", "lesson"]) {
    if (!allow[r]) throw new Error(`A7: ANON_FIELDS is missing resource "${r}"`);
  }
  return allow;
}

/** Split a PostgREST select body on top-level commas (ignoring commas in parens). */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** The bare column name from a token `[alias:]column[::cast]` → `column`. */
function bareColumn(tok) {
  let t = tok.trim();
  t = t.split("::")[0].trim(); // strip ::cast (handles alias:col::type → alias:col)
  if (t.includes(":")) t = t.split(":").pop().trim(); // strip alias: → the real column
  return t;
}

/** The embed table from a nesting token like `alias:table!hint(`, `table(`, or
 *  the spread `...table(` (PostgREST flattens spread embeds into the parent row). */
function embedTable(prefix) {
  let p = prefix.trim();
  p = p.replace(/^\.\.\./, ""); // PostgREST spread embed: ...table(cols)
  if (p.includes(":")) p = p.split(":").pop().trim(); // drop alias
  if (p.includes("!")) p = p.split("!")[0].trim(); // drop !inner/!left/!fk hint
  return p;
}

/**
 * Collect { resource, column } pairs from a select body against the given table.
 * Returns { pairs, unparseable }. Throws nothing — fail-closed via `unparseable`.
 */
export function parseSelect(body, rootTable) {
  const pairs = [];
  let unparseable = false;
  const walk = (b, table) => {
    for (const rawTok of splitTopLevel(b)) {
      const tok = rawTok.trim();
      if (!tok) continue;
      const paren = tok.indexOf("(");
      if (paren >= 0) {
        // nested embed: prefix(inner)
        const close = tok.lastIndexOf(")");
        if (close < paren) { unparseable = true; continue; }
        const table2 = embedTable(tok.slice(0, paren));
        walk(tok.slice(paren + 1, close), table2);
      } else {
        const col = bareColumn(tok);
        if (!col) { unparseable = true; continue; }
        pairs.push({ table, column: col });
      }
    }
  };
  walk(body, rootTable);
  return { pairs, unparseable };
}

/** The matching `)` for a call whose `(` is at openIdx; returns the arg string or null. */
function captureArg(source, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

/** True only when a whole-arg policy call (the `)` closing the policy call is the
 *  LAST char), so `clientCardFields(a) + ", status, kind"` is NOT treated dynamic. */
function isWholePolicyCall(arg) {
  const t = arg.trim();
  const call = POLICY_CALLS.find((c) => t.startsWith(c));
  if (!call) return false;
  let depth = 0;
  for (let i = call.length - 1; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") {
      depth--;
      if (depth === 0) return i === t.length - 1;
    }
  }
  return false;
}

/** All `.from("table").select(arg)` on a §6 resource. dynamic=true for policy calls. */
export function extractResourceSelects(source) {
  const results = [];
  const fromRe = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(source))) {
    const table = m[1];
    if (!TABLE_TO_RESOURCE[table]) continue; // only §6 resources
    const fromEnd = m.index + m[0].length;
    const selIdx = source.indexOf(".select(", fromEnd);
    if (selIdx < 0) { results.push({ table, dynamic: false, literal: null, unparseable: true }); continue; }
    // Associate only within the same fluent chain: a `;` or another `.from(`
    // between the from and the select means they are detached (a split builder) —
    // fail-closed rather than pair the §6 from with a decoy select.
    if (/;|\.from\(/.test(source.slice(fromEnd, selIdx))) {
      results.push({ table, dynamic: false, literal: null, unparseable: true });
      continue;
    }
    const arg = captureArg(source, selIdx + ".select".length);
    if (arg == null) { results.push({ table, dynamic: false, literal: null, unparseable: true }); continue; }
    const trimmed = arg.trim();
    if (isWholePolicyCall(trimmed)) {
      results.push({ table, dynamic: true });
      continue;
    }
    // literal string or template (no interpolation)
    const lit = trimmed.match(/^(["'`])([\s\S]*)\1$/);
    if (lit && !(lit[1] === "`" && lit[2].includes("${"))) {
      results.push({ table, dynamic: false, literal: lit[2] });
    } else {
      results.push({ table, dynamic: false, literal: null, unparseable: true });
    }
  }
  return results;
}

/**
 * Violations for one file. A `// a7-allow:` comment is a FILE-WIDE waiver — it
 * exempts every §6 select in the file, so keep a waived file to a single query
 * (public-classes is one query). The reason is surfaced by the caller.
 */
export function findViolations({ path, source }, allow) {
  const waiver = source.match(/\/\/\s*a7-allow:\s*(.*)/);
  const violations = [];
  for (const sel of extractResourceSelects(source)) {
    if (sel.dynamic) continue; // policy-sourced → compliant
    if (waiver) continue; // exempt (reason surfaced by the caller)
    if (sel.unparseable || sel.literal == null) {
      violations.push({ path, table: sel.table, column: "<unparseable literal select — waive or route through the policy>" });
      continue;
    }
    const { pairs, unparseable } = parseSelect(sel.literal, sel.table);
    if (unparseable) {
      violations.push({ path, table: sel.table, column: "<unparseable column list>" });
    }
    for (const { table, column } of pairs) {
      const resource = TABLE_TO_RESOURCE[table];
      if (!resource) continue; // nested non-§6 table (e.g. profiles) — not checked
      const set = allow[resource];
      if (column === "*" || !set.has(column)) {
        violations.push({ path, table, column });
      }
    }
  }
  return { violations, waiver: waiver ? waiver[1].trim() : null };
}

// --- CLI -------------------------------------------------------------------
function isMain() {
  return process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("check-public-field-allowlist.mjs");
}

if (isMain()) {
  const ROOT = process.cwd();
  const policyPath = join(ROOT, "supabase/functions/_shared/public-visibility.ts");
  if (!existsSync(policyPath)) {
    console.error("❌ A7: public-visibility.ts not found — cannot load the allowlist.");
    process.exit(1);
  }
  const allow = parseAnonAllowlist(readFileSync(policyPath, "utf8"));

  const fnsDir = join(ROOT, "supabase/functions");
  const publicDirs = readdirSync(fnsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("public-"))
    .map((e) => e.name);

  let failed = 0;
  const waivers = [];
  for (const dir of publicDirs) {
    const idx = join(fnsDir, dir, "index.ts");
    if (!existsSync(idx)) continue;
    const rel = `supabase/functions/${dir}/index.ts`;
    const { violations, waiver } = findViolations({ path: rel, source: readFileSync(idx, "utf8") }, allow);
    if (waiver) waivers.push(`   ⚠ ${rel} — a7-allow: ${waiver}`);
    for (const v of violations) {
      console.error(`❌ ${v.path}: '${v.table}.${v.column}' is not in the §6 anon allowlist.`);
      failed++;
    }
  }

  if (waivers.length) {
    console.log("A7 waivers in effect (must be retired):");
    for (const w of waivers) console.log(w);
  }
  if (failed > 0) {
    console.error(`\n${failed} public-field allowlist violation(s). Route the select through the shared policy (fieldsFor / *CardFields), or add a '// a7-allow: <reason>' waiver.`);
    process.exit(1);
  }
  console.log("✅ public-field allowlist clean — every public-* resource select is policy-sourced or within the §6 anon allowlist.");
}
