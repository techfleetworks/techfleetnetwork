#!/usr/bin/env node
/**
 * DB-SCHEMA-PRESENT-001 (ADR-0036) — the comprehensive schema-reconciliation gate.
 *
 * Supersedes check-db-objects-present (ADR-0035), which verified only tables + functions. This
 * verifies EVERY schema object a committed migration DECLARES actually EXISTS in prod, across many
 * categories (tables, columns, indexes, policies, triggers, functions, types, constraints,
 * rls-enabled, cron jobs, views, extensions — more added over time), because prod has NO
 * supabase_migrations ledger: we verify REALITY, not a claim.
 *
 * DESIGN (from the 26-agent reconciliation-design workflow; see ADR-0036):
 *  - One shared, sound SQL tokenizer (_sql-scan.mjs) gives a "code only" view so comments, string
 *    literals, and dollar-quoted PROSE (Gherkin/BDD bodies) can never mint phantom objects nor mask
 *    real DDL. DO-block bodies are kept (they declare real objects).
 *  - Each CATEGORY derives its declared set (created − dropped − renamed-away, in statement order)
 *    and provides the read-only prod introspection SELECT returning (kind, identifier) normalized to
 *    match extraction EXACTLY. One Management-API query UNION-ALLs them.
 *  - DYNAMIC DDL (`EXECUTE format('... %I ...')` fan-outs) can't be read statically, so any file
 *    with a `%`-placeholder create is a TRIPWIRE: its concrete names must be listed in a reviewed
 *    sidecar (db-dynamic-objects.json) or the gate FAILS CLOSED — an unbounded silent miss becomes
 *    an explicit reviewed obligation.
 *  - FAIL CLOSED always: no token / unreachable / bad response / unreadable or zero migrations /
 *    zero derived (per category floor) / unterminated dollar-quote / unregistered dynamic file /
 *    any declared object absent from prod. A gate that cannot verify must never pass.
 *  - The honest boundary: effects with no structural signature (data backfills, DROP-only,
 *    in-place ALTERs, privilege state) are NOT faked — a later phase surfaces them in a
 *    manual-review bucket. This gate owns object PRESENCE.
 *
 * Run (HTTPS only): SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=pzvqxdgoztbfikfuifix node scripts/ci/check-db-schema-present.mjs
 * Extraction self-check (no prod): DB_SCHEMA_EXTRACT_ONLY=1 node scripts/ci/check-db-schema-present.mjs
 * Test seams (never set in CI/prod): DB_SCHEMA_ROOT, DB_SCHEMA_PROD_FIXTURE.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeView, unterminatedDollarTag } from "./_sql-scan.mjs";
import { readJson } from "./_json.mjs";

const ROOT = process.env.DB_SCHEMA_ROOT
  ? resolve(process.env.DB_SCHEMA_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const ALLOWLIST_PATH = join(ROOT, "scripts/ci/db-schema-allowlist.json");
const DYNAMIC_PATH = join(ROOT, "scripts/ci/db-dynamic-objects.json");
const CODE = "DB-SCHEMA-PRESENT-001";
const EXTRACT_ONLY = /^(1|true|yes)$/i.test(process.env.DB_SCHEMA_EXTRACT_ONLY ?? "");

const EXIT = Symbol("exit");
const fail = (msg, code = 2) => {
  console.error(`✖ ${CODE}: ${msg}`);
  process.exitCode = code;
  throw EXIT;
};

// ---------------------------------------------------------------------------
// Load every migration once: raw text, code view, and DO-body-preserving code view.
// Fail closed on an unterminated dollar-quote (masking to EOF could hide real DDL).
// ---------------------------------------------------------------------------
function loadMigrations() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // filename prefix = timestamp = apply order
  } catch (e) {
    fail(`cannot read ${MIGRATIONS_DIR}: ${e.message}. Failing closed.`);
  }
  if (!files.length) fail("no migration files found — path moved? Failing closed.");
  for (const f of files) {
    if (!/^\d{14}_/.test(f))
      fail(
        `migration ${f} is not timestamp-prefixed (^\\d{14}_) — cannot guarantee apply order. Failing closed.`
      );
  }
  return files.map((name) => {
    const raw = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    const un = unterminatedDollarTag(raw);
    if (un)
      fail(`${name}: unterminated dollar-quote (${un}) — cannot safely scan. Failing closed.`);
    return { name, raw, code: codeView(raw), codeDo: codeView(raw, { keepDoBodies: true }) };
  });
}

// Files that declare objects dynamically via `EXECUTE format('... %I ...')`: "kind::filename".
const dynamicHits = new Set();
// Reviewed sidecar of the concrete names those fan-outs create (loaded in main()).
let SIDECAR = { objects: {} };

// ---------------------------------------------------------------------------
// Generic net-state derivation: created − dropped − renamed-away, honoring statement order
// within each file and file order across the corpus (last op wins). Scans the DO-body-preserving
// code view so real statements inside DO guards are seen while comments/strings/function bodies
// are masked. Returns a lowercased Set of identifiers.
//   spec = { create:{re,key}, drop:{re,key}, rename:{re,from,to}, dynamicRe, filter }
// key(match) → identifier string (or null to skip). rename.from/to(match) → identifier.
// dynamicRe (tested on RAW) marks the file as needing a sidecar entry for this category.
// ---------------------------------------------------------------------------
function deriveNet(migs, kind, spec) {
  const live = new Set();
  for (const m of migs) {
    const code = m.codeDo;
    const events = [];
    let x;
    // Inject reviewed sidecar names from %I fan-outs in THIS file as adds at file start, so later
    // renames/drops apply to them via the same stream (per the tables verifier's fix).
    for (const nm of SIDECAR.objects?.[`${kind}::${m.name}`] ?? [])
      events.push({ i: -1, op: "add", id: String(nm).toLowerCase() });
    if (spec.create) {
      spec.create.re.lastIndex = 0;
      while ((x = spec.create.re.exec(code))) {
        const id = spec.create.key(x);
        if (id != null) events.push({ i: x.index, op: "add", id });
      }
    }
    if (spec.drop) {
      spec.drop.re.lastIndex = 0;
      while ((x = spec.drop.re.exec(code))) {
        const id = spec.drop.key(x);
        if (id != null) events.push({ i: x.index, op: "del", id });
      }
    }
    if (spec.rename) {
      spec.rename.re.lastIndex = 0;
      while ((x = spec.rename.re.exec(code))) {
        const from = spec.rename.from(x);
        const to = spec.rename.to(x);
        if (from != null && to != null) events.push({ i: x.index, op: "ren", from, to });
      }
    }
    events.sort((a, b) => a.i - b.i);
    for (const e of events) {
      if (e.op === "add") live.add(e.id);
      else if (e.op === "del") live.delete(e.id);
      else if (e.op === "ren") {
        live.delete(e.from);
        live.add(e.to);
      }
    }
    if (spec.dynamicRe) {
      spec.dynamicRe.lastIndex = 0;
      if (spec.dynamicRe.test(m.raw)) dynamicHits.add(`${kind}::${m.name}`);
    }
  }
  if (spec.filter) for (const id of [...live]) if (!spec.filter(id)) live.delete(id);
  return live;
}

const RESERVED = new Set([
  "public",
  "table",
  "if",
  "not",
  "exists",
  "only",
  "index",
  "on",
  "using",
  "constraint",
  "primary",
  "foreign",
  "unique",
  "check",
  "exclude",
]);
const clean = (s) => (s == null ? null : s.replace(/^"|"$/g, "").toLowerCase());

// ===========================================================================
// CATEGORY REGISTRY. Each: { kind, floor, derive(migs)->Set, prodSelect }
// prodSelect returns rows (kind, identifier); identifier normalized to match derive() output.
// Categories are added incrementally; each is extraction-tested against all 711 real migrations.
// ===========================================================================
const CATEGORIES = [];

// --- tables ---------------------------------------------------------------
CATEGORIES.push({
  kind: "table",
  floor: 150,
  derive: (migs) =>
    deriveNet(migs, "table", {
      create: {
        re: /create\s+(?:global\s+|local\s+|temp(?:orary)?\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\s*\.\s*)?("?)([A-Za-z_][A-Za-z0-9_$]*)\1/gi,
        key: (x) => {
          const n = clean(x[2]);
          return n && !RESERVED.has(n) && !n.includes("%") ? n : null;
        },
      },
      drop: {
        // anchored to statement start so `ALTER PUBLICATION ... DROP TABLE x` is NOT a table drop
        // (the exact bug in the shipped ADR-0035 gate that silently subtracted live tables).
        re: /(?:^|;)\s*drop\s+table\s+(?:if\s+exists\s+)?(?:"?public"?\s*\.\s*)?("?)([A-Za-z_][A-Za-z0-9_$]*)\1/gi,
        key: (x) => clean(x[2]),
      },
      rename: {
        re: /alter\s+table\s+(?:if\s+exists\s+)?(?:"?public"?\s*\.\s*)?"?([a-z0-9_]+)"?\s+rename\s+to\s+"?([a-z0-9_]+)"?/gi,
        from: (x) => clean(x[1]),
        to: (x) => clean(x[2]),
      },
      // A `CREATE TABLE ... %` (placeholder) anywhere in RAW text = dynamic fan-out → needs sidecar.
      dynamicRe: /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\s*\.\s*)?%[A-Za-z]/i,
    }),
  prodSelect:
    "select 'table' as kind, c.relname as identifier from pg_catalog.pg_class c " +
    "join pg_catalog.pg_namespace n on n.oid = c.relnamespace " +
    "where n.nspname = 'public' and c.relkind in ('r','p')",
});

// --- extensions (verifier: solid) -----------------------------------------
CATEGORIES.push({
  kind: "extension",
  floor: 5,
  derive: (migs) =>
    deriveNet(migs, "extension", {
      create: {
        re: /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi,
        key: (x) => (x[1] || x[2] || "").toLowerCase() || null,
      },
      drop: {
        re: /\bdrop\s+extension\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi,
        key: (x) => (x[1] || x[2] || "").toLowerCase() || null,
      },
    }),
  // NOT schema-filtered: extensions are DB-global (pg_net/vector live outside public).
  prodSelect:
    "select 'extension' as kind, lower(e.extname) as identifier from pg_catalog.pg_extension e",
});

// --- types (enum / range / standalone composite) --------------------------
CATEGORIES.push({
  kind: "type",
  floor: 20,
  derive: (migs) =>
    deriveNet(migs, "type", {
      create: {
        re: /create\s+type\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
        key: (x) => {
          const n = clean(x[1]);
          return n && n !== "public" ? n : null;
        },
      },
      drop: {
        re: /drop\s+type\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
        key: (x) => clean(x[1]),
      },
      rename: {
        re: /alter\s+type\s+(?:public\.)?"?([a-z0-9_]+)"?\s+rename\s+to\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
        from: (x) => clean(x[1]),
        to: (x) => clean(x[2]),
      },
      filter: (id) => !id.endsWith("_old"), // *_old are the transient swap types (renamed then dropped)
    }),
  prodSelect:
    "select 'type' as kind, t.typname as identifier from pg_type t " +
    "join pg_namespace n on n.oid = t.typnamespace where n.nspname='public' " +
    "and t.typname not like '\\_%' and (t.typtype in ('e','r') or " +
    "(t.typtype='c' and exists (select 1 from pg_class c where c.oid=t.typrelid and c.relkind='c')))",
});

// --- views + materialized views -------------------------------------------
CATEGORIES.push({
  kind: "view",
  floor: 12,
  derive: (migs) =>
    deriveNet(migs, "view", {
      create: {
        re: /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:recursive\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:("(?:[^"]|"")+"|[a-z_][\w$]*)\s*\.\s*)?("(?:[^"]|"")+"|[a-z_][\w$]*)/gi,
        key: (x) => {
          const sch = clean(x[1]) || "public";
          const nm = clean(x[2]);
          return nm && nm !== "public" ? `${sch}.${nm}` : null;
        },
      },
      drop: {
        re: /\bdrop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?(?:("(?:[^"]|"")+"|[a-z_][\w$]*)\s*\.\s*)?("(?:[^"]|"")+"|[a-z_][\w$]*)/gi,
        key: (x) => `${clean(x[1]) || "public"}.${clean(x[2])}`,
      },
    }),
  prodSelect:
    "select 'view' as kind, 'public.'||v.viewname as identifier from pg_catalog.pg_views v where v.schemaname='public' " +
    "union all select 'view' as kind, 'public.'||m.matviewname as identifier from pg_catalog.pg_matviews m where m.schemaname='public'",
});

// --- cron jobs (pg_cron; identifiers are string literals — VERBATIM, case-sensitive) ------
// Custom derive: cron names live inside string literals (which the tokenizer masks), so scan a
// keep-strings view; a count-parity tripwire makes a non-literal/auto-named job impossible to miss.
function deriveCron(migs) {
  const isCronExpr = (s) => /^[\d*/,\-\s]+$/.test(s) || /^\d+\s+seconds?$/i.test(s);
  const live = new Set();
  for (const m of migs) {
    const view = codeView(m.raw, { keepStrings: true, keepDoBodies: true });
    const events = [];
    let x,
      named = 0;
    const RE_SCHED = /cron\.schedule\s*\(\s*'([^']+)'/gi;
    while ((x = RE_SCHED.exec(view))) {
      if (isCronExpr(x[1])) continue; // 2-arg cron.schedule(schedule, command): 1st arg is not a name
      events.push({ i: x.index, op: "add", id: x[1] });
      named++;
    }
    const calls = (view.match(/cron\.schedule\s*\(/gi) || []).length;
    if (calls !== named)
      fail(
        `${m.name}: ${calls} cron.schedule( call(s) but ${named} literal job name(s) extracted — ` +
          `a non-literal/auto-named job would be silently missed. Failing closed.`
      );
    const RE_UN = /cron\.unschedule\s*\(\s*'([^']+)'/gi;
    while ((x = RE_UN.exec(view))) events.push({ i: x.index, op: "del", id: x[1] });
    events.sort((a, b) => a.i - b.i);
    for (const e of events) e.op === "add" ? live.add(e.id) : live.delete(e.id);
  }
  return live;
}
CATEGORIES.push({
  kind: "cron_job",
  floor: 20,
  derive: deriveCron,
  // FAIL CLOSED if pg_cron isn't installed: `cron.job` won't exist → the query errors → non-2xx →
  // the fetch path fails closed (never "0 jobs, all good"). That absence was the original outage.
  prodSelect:
    "select 'cron_job' as kind, jobname as identifier from cron.job where jobname is not null",
});

// --- constraints (named ADD CONSTRAINT; identifier = table.constraint) ------
// Custom derive: ADD CONSTRAINT names don't include the table, so pair each with the governing
// ALTER TABLE (nearest preceding, no ';' between). Statement terminators come from the code view
// (';' inside strings/comments is masked), so orphan/prose constraints can't attach a table.
function deriveConstraints(migs) {
  const live = new Set();
  for (const m of migs) {
    const code = m.codeDo;
    const alters = [];
    let x;
    const RE_ALTER =
      /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?[a-z_][a-z0-9_$]*"?\s*\.\s*)?"?([a-z_][a-z0-9_$]*)"?/gi;
    while ((x = RE_ALTER.exec(code))) alters.push({ i: x.index, table: clean(x[1]) });
    const govTable = (idx) => {
      let best = null;
      for (const a of alters)
        if (a.i < idx && code.slice(a.i, idx).indexOf(";") === -1 && (!best || a.i > best.i))
          best = a;
      return best ? best.table : null;
    };
    const events = [];
    const RE_ADD = /\badd\s+constraint\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_$]*)"?/gi;
    while ((x = RE_ADD.exec(code))) {
      const t = govTable(x.index),
        n = clean(x[1]);
      if (t && n && t !== "public") events.push({ i: x.index, op: "add", id: `${t}.${n}` });
    }
    const RE_DROP = /\bdrop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_$]*)"?/gi;
    while ((x = RE_DROP.exec(code))) {
      const t = govTable(x.index),
        n = clean(x[1]);
      if (t && n) events.push({ i: x.index, op: "del", id: `${t}.${n}` });
    }
    events.sort((a, b) => a.i - b.i);
    for (const e of events) e.op === "add" ? live.add(e.id) : live.delete(e.id);
  }
  return live;
}
CATEGORIES.push({
  kind: "constraint",
  floor: 15,
  derive: deriveConstraints,
  // Prod returns ALL table constraints (inline + ADD); declared (ADD-only) ⊆ prod, so extras are harmless.
  prodSelect:
    "select 'constraint' as kind, lower(rel.relname||'.'||con.conname) as identifier from pg_constraint con " +
    "join pg_class rel on rel.oid = con.conrelid join pg_namespace nsp on nsp.oid = rel.relnamespace " +
    "where nsp.nspname='public' and con.conrelid <> 0 and con.contype in ('c','f','u','p','x')",
});

// --- rls_enabled (tables with RLS turned ON; identifier = schema.table) -----
// Verifier "broken" fix applied: NO drop-table subtraction (that miscounted ALTER PUBLICATION DROP
// TABLE and dropped live tables like profiles). Only real ENABLE (add) / DISABLE (del) are events.
CATEGORIES.push({
  kind: "rls_enabled",
  floor: 150,
  derive: (migs) =>
    deriveNet(migs, "rls_enabled", {
      create: {
        re: /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_%]*)"?\s+enable\s+row\s+level\s+security/gi,
        key: (x) => {
          const t = clean(x[2]);
          return t && !t.includes("%") && t !== "public" ? `${clean(x[1]) || "public"}.${t}` : null;
        },
      },
      drop: {
        re: /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_%]*)"?\s+disable\s+row\s+level\s+security/gi,
        key: (x) => {
          const t = clean(x[2]);
          return t && !t.includes("%") ? `${clean(x[1]) || "public"}.${t}` : null;
        },
      },
      // the reference_* loop does `ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY` → needs sidecar
      dynamicRe: /\.\s*%i\s+enable\s+row\s+level\s+security/i,
    }),
  prodSelect:
    "select 'rls_enabled' as kind, lower(n.nspname)||'.'||lower(c.relname) as identifier from pg_class c " +
    "join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p') and c.relrowsecurity = true " +
    "and n.nspname not in ('pg_catalog','information_schema','pg_toast')",
});

// --- indexes (bare index name) — DEFERRED to next session ------------------
// The dynamic-index tripwire (correctly) found FOUR %I fan-out sources with differing table subsets
// and suffixes: the two reference creators (…_search_idx/_name_trgm_idx/_data_idx/_category_idx),
// 20260503223414 (<t>_is_placeholder_idx), and 20260511104727 (19 tables incl reference_relationships,
// <t>_description_source…). Enumerating all exactly (unvalidatable vs prod this session) risks false
// positives, so `indexes` is deferred — the extraction regex + prodSelect below are ready; finishing
// needs the four sidecars enumerated. See adr-0036-RESUME-2.md.
//   create: /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_$]*)"?\s+on\b/gi  (filter RESERVED)
//   drop:   /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:"?public"?\s*\.\s*)?"?([a-z_][a-z0-9_$]*)"?/gi
//   dynamicRe: /create\s+(?:unique\s+)?index[^;]{0,60}%[a-z]/i
//   prodSelect: select 'index', c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('i','I')

// ---------------------------------------------------------------------------
// Dynamic sidecar: names for files that declare objects via `%I` fan-outs. Every file flagged by
// a category's dynamicRe MUST appear here (keyed by "kind::filename"), else fail closed.
// Shape: { "table::20260502180318_x.sql": ["reference_practices", ...], ... }
// ---------------------------------------------------------------------------
function loadSidecar() {
  if (!existsSync(DYNAMIC_PATH)) return { objects: {} };
  try {
    const s = readJson(DYNAMIC_PATH);
    return { objects: s.objects ?? {} };
  } catch (e) {
    fail(`dynamic sidecar ${DYNAMIC_PATH} is not valid JSON (${e.message}). Failing closed.`);
  }
}

// Every file flagged by a category's dynamicRe (a `%I` fan-out) MUST be registered in the sidecar,
// else we'd silently verify nothing for its objects. Fail closed on any unregistered hit.
function checkDynamicRegistered() {
  const registered = new Set(Object.keys(SIDECAR.objects ?? {}));
  const unregistered = [...dynamicHits].filter((h) => !registered.has(h));
  if (unregistered.length)
    fail(
      `dynamic (%I fan-out) object declaration(s) with no reviewed sidecar entry in ${DYNAMIC_PATH} — ` +
        `cannot verify statically, refusing to skip:\n` +
        unregistered.map((h) => `  - ${h}`).join("\n") +
        `\nList the concrete names each produces under "objects"["${unregistered[0]}"] = [ ... ]. See ADR-0036.`
    );
}

// ---------------------------------------------------------------------------
// Allowlist: objects the derivation legitimately over-declares (superseded/renamed/dropped out of
// band). Shape: { "table": ["tickets", ...], "function": [...], ... }. Shrink-only ethos.
// ---------------------------------------------------------------------------
function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  try {
    return readJson(ALLOWLIST_PATH);
  } catch (e) {
    fail(`allowlist ${ALLOWLIST_PATH} is not valid JSON (${e.message}). Failing closed.`);
  }
}

async function main() {
  const migs = loadMigrations();
  SIDECAR = loadSidecar();

  // 1. Derive declared sets per category (sidecar %I names injected into each file's event stream).
  const declaredByKind = new Map();
  for (const cat of CATEGORIES) declaredByKind.set(cat.kind, cat.derive(migs));
  checkDynamicRegistered();

  // 2. Floors + zero-scan tripwires (a partial-capture regression must fail, not pass small).
  for (const cat of CATEGORIES) {
    const size = declaredByKind.get(cat.kind).size;
    if (size < cat.floor)
      fail(
        `only ${size} '${cat.kind}' objects derived from ${migs.length} migrations (floor ${cat.floor}). ` +
          `Extraction regression? Failing closed rather than under-verifying.`
      );
  }

  // 3. Subtract allowlist.
  const allow = loadAllowlist();
  for (const cat of CATEGORIES) {
    for (const nm of allow[cat.kind] ?? []) declaredByKind.get(cat.kind).delete(String(nm));
  }

  // Test helper: emit all declared objects as prod-fixture rows (JSON) so the diff path is testable.
  if (/^(1|true|yes)$/i.test(process.env.DB_SCHEMA_DUMP ?? "")) {
    const out = [];
    for (const cat of CATEGORIES)
      for (const id of declaredByKind.get(cat.kind)) out.push({ kind: cat.kind, identifier: id });
    console.log(JSON.stringify(out));
    return;
  }

  if (EXTRACT_ONLY) {
    console.log(`✓ ${CODE} extract-only: ${migs.length} migrations scanned.`);
    for (const cat of CATEGORIES)
      console.log(`  ${cat.kind.padEnd(12)} declared=${declaredByKind.get(cat.kind).size}`);
    console.log(
      `  dynamic sidecar hits: ${dynamicHits.size} (${[...dynamicHits].join(", ") || "none"})`
    );
    const probe = (process.env.DB_SCHEMA_PROBE ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of probe) {
      const inKinds = CATEGORIES.filter((c) => declaredByKind.get(c.kind).has(p.toLowerCase())).map(
        (c) => c.kind
      );
      console.log(
        `  probe ${p.padEnd(28)} ${inKinds.length ? "PRESENT in " + inKinds.join(",") : "absent"}`
      );
    }
    return;
  }

  // 4. Query prod reality (Management API, HTTPS) — one composed query, or a test fixture.
  //    search_path is set so extension-schema types render predictably for the functions category.
  const query =
    "set search_path = public, extensions; " +
    CATEGORIES.map((c) => c.prodSelect).join("\nunion all\n") +
    ";";
  const rows = await fetchProd(query);

  const prodByKind = new Map();
  for (const cat of CATEGORIES) prodByKind.set(cat.kind, new Set());
  for (const r of rows) {
    const set = prodByKind.get(r.kind);
    if (set) set.add(String(r.identifier)); // case per category: cron verbatim, others already lowercase
  }

  // 5. Diff: every declared object must exist in prod.
  const missing = [];
  for (const cat of CATEGORIES) {
    const prod = prodByKind.get(cat.kind);
    for (const id of [...declaredByKind.get(cat.kind)].sort())
      if (!prod.has(id)) missing.push(`${cat.kind.padEnd(11)} ${id}`);
  }

  if (missing.length === 0) {
    const total = CATEGORIES.reduce((n, c) => n + declaredByKind.get(c.kind).size, 0);
    console.log(
      `✓ ${CODE}: OK — all ${total} declared objects across ${CATEGORIES.length} categories exist in prod ` +
        `(${process.env.SUPABASE_PROJECT_REF ?? "fixture"}).`
    );
    return;
  }
  console.error(
    `✖ ${CODE}: ${missing.length} declared object(s) are MISSING from prod — a migration was committed ` +
      `but never applied (the outage class):`
  );
  for (const line of missing) console.error(`  - ${line}`);
  console.error(
    `\nApply the missing migration(s) to prod (Supabase Dashboard → SQL Editor), or — if an object was ` +
      `intentionally renamed/dropped out of band — add it to ${ALLOWLIST_PATH} with a reason. See ADR-0036.`
  );
  process.exitCode = 1;
}

// Read prod objects: from DB_SCHEMA_PROD_FIXTURE (test) or the Supabase Management API (HTTPS).
// Fail closed on anything that isn't a clean array of rows. NEVER call process.exit() after fetch
// (killing the process with the socket still closing triggers a libuv assert on Windows — ADR-0035).
async function fetchProd(query) {
  const fixture = process.env.DB_SCHEMA_PROD_FIXTURE?.trim();
  if (fixture) {
    const rows = readJson(fixture);
    if (!Array.isArray(rows))
      fail("DB_SCHEMA_PROD_FIXTURE is not a JSON array of rows. Failing closed.");
    return rows;
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (!token)
    fail(
      "SUPABASE_ACCESS_TOKEN not set — cannot verify prod. Failing closed (a guard that cannot check must fail, " +
        "not skip). Generate a Management-API token at https://supabase.com/dashboard/account/tokens (starts with sbp_)."
    );
  if (!ref) fail("SUPABASE_PROJECT_REF not set — cannot target a project. Failing closed.");
  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    fail(`Management API request failed: ${e.message}. Failing closed.`);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    fail(`Management API returned HTTP ${res.status}${body ? ` — ${body}` : ""}. Failing closed.`);
  }
  const json = await res.json().catch(() => null);
  if (!Array.isArray(json))
    fail("Management API response was not the expected array of rows. Failing closed.");
  return json;
}

main().catch((e) => {
  if (e !== EXIT) {
    console.error(`✖ ${CODE}: unexpected error — ${e?.stack || e}`);
    process.exitCode = 2;
  }
});
