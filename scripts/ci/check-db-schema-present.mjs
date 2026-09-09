#!/usr/bin/env node
/**
 * DB-SCHEMA-PRESENT-001 (ADR-0036) — the schema-reconciliation gate.
 *
 * Supersedes check-db-objects-present (ADR-0035), which verified only tables + functions. Because
 * prod has NO supabase_migrations ledger, this verifies REALITY (not a claim): every schema object a
 * committed migration DECLARES must EXIST in prod. Coverage is INCREMENTAL — each category is added
 * and extraction-tested against the real corpus before it gates. ACTIVE now: tables, extensions,
 * types, views, constraints, rls-enabled. NOT YET verified: columns, indexes, triggers, policies,
 * functions (unimplemented) and cron jobs (DEFERRED — not statically reconcilable here; reconcile by
 * diffing prod `cron.job` manually). A green result reconciles the ACTIVE categories, NOT the whole
 * schema — every run prints exactly what it does and does not cover.
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
 *    zero derived or a per-category count off its pinned BASELINE / an active category with no
 *    BASELINE / unterminated dollar-quote / unregistered or empty dynamic file / a stale allowlist
 *    waiver (allowlisted object actually present in prod) / a test seam set in CI without opt-in /
 *    any declared object absent from prod. A gate that cannot verify must never pass.
 *  - The honest boundary: effects with no structural signature (data backfills, DROP-only,
 *    in-place ALTERs, privilege state) are NOT faked — a later phase surfaces them in a
 *    manual-review bucket. This gate owns object PRESENCE.
 *
 * Run (HTTPS only): SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=pzvqxdgoztbfikfuifix node scripts/ci/check-db-schema-present.mjs
 * Extraction self-check (no prod): DB_SCHEMA_EXTRACT_ONLY=1 node scripts/ci/check-db-schema-present.mjs
 * Test seams (refused in CI unless DB_SCHEMA_ALLOW_SEAMS=1, which only the smoke test sets):
 *   DB_SCHEMA_ROOT, DB_SCHEMA_PROD_FIXTURE, DB_SCHEMA_DUMP, DB_SCHEMA_EXTRACT_ONLY, DB_SCHEMA_PROBE.
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
        // key() may return one id or an array (comma-list DROP a, b): emit one del per id.
        const id = spec.drop.key(x);
        for (const one of Array.isArray(id) ? id : [id])
          if (one != null) events.push({ i: x.index, op: "del", id: one });
      }
    }
    // Second drop source (e.g. a table-scoped object also disappears when its TABLE is dropped).
    if (spec.drop2) {
      spec.drop2.re.lastIndex = 0;
      while ((x = spec.drop2.re.exec(code))) {
        const id = spec.drop2.key(x);
        for (const one of Array.isArray(id) ? id : [id])
          if (one != null) events.push({ i: x.index, op: "del", id: one });
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

// Split a DROP target list ("a, public.b cascade") into {schema, name} parts (schema null if bare).
// A comma-list `DROP TABLE a, b` / `DROP VIEW a, b` must subtract EVERY target, not just the first —
// each category's drop `key` maps these to its identifier form. Takes the first whitespace token of
// each comma segment (dropping CASCADE/RESTRICT and any trailing statement text), then splits schema.
function splitDropTargets(list) {
  return list
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0] || "")
    .map((tok) => {
      const m = /^(?:"?([a-z_][a-z0-9_$]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_$]*)"?$/i.exec(tok);
      return m ? { schema: m[1] ? m[1].toLowerCase() : null, name: m[2].toLowerCase() } : null;
    })
    .filter(Boolean);
}

// ===========================================================================
// CATEGORY REGISTRY. Each: { kind, floor, derive(migs)->Set, prodSelect }
// prodSelect returns rows (kind, identifier); identifier normalized to match derive() output.
// Categories are added incrementally; each is extraction-tested against all 711 real migrations.
// ===========================================================================
const CATEGORIES = [];

// --- tables ---------------------------------------------------------------
CATEGORIES.push({
  kind: "table",
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
        // (the exact bug in the shipped ADR-0035 gate that silently subtracted live tables). Captures
        // the whole target list so a comma-list `DROP TABLE a, b` subtracts both, not just `a`.
        re: /(?:^|;)\s*drop\s+table\s+(?:if\s+exists\s+)?([^;]+)/gi,
        key: (x) => splitDropTargets(x[1]).map((t) => t.name),
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
        re: /drop\s+type\s+(?:if\s+exists\s+)?([^;]+)/gi,
        key: (x) => splitDropTargets(x[1]).map((t) => t.name),
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
        re: /\bdrop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?([^;]+)/gi,
        key: (x) => splitDropTargets(x[1]).map((t) => `${t.schema || "public"}.${t.name}`),
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
    // del: literal unschedule('name') only. (Window-netting of jobid/IN-list unschedules was tried
    // and REVERTED — this repo reschedules via VARIABLES (cron.schedule(r.jobname,…)) in normalize
    // loops, so netting removals we can't see re-added causes false negatives, e.g. it dropped the
    // live refresh-community-events. cron is therefore NOT a reliable static presence gate here and
    // is DEFERRED as a category — see the disabled push below and adr-0036-RESUME-2.md.)
    const RE_UN = /cron\.unschedule\s*\(\s*'([^']+)'/gi;
    while ((x = RE_UN.exec(view))) events.push({ i: x.index, op: "del", id: x[1] });
    events.sort((a, b) => a.i - b.i);
    for (const e of events) e.op === "add" ? live.add(e.id) : live.delete(e.id);
  }
  return live;
}
// cron_job category DEFERRED (not registered): the first prod run proved cron is not statically
// reconcilable in this repo. Jobs are renamed + rescheduled constantly, and the 20260531042114
// "normalize schedules" migration reschedules via VARIABLES (cron.schedule(r.jobname,…)) inside a
// loop — invisible to literal extraction. Literal-only over-declares ~25 superseded jobs (false
// positives); netting removals we can't see re-added causes FALSE NEGATIVES (it dropped the live
// refresh-community-events). A presence gate that can't avoid false negatives must not gate. Cron
// drift is better reconciled by periodically diffing prod `SELECT jobname FROM cron.job` against the
// current intended set. deriveCron is kept (literal-only, the safe over-declaring direction) for
// that advisory use. See adr-0036-RESUME-2.md.
void deriveCron;

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
  derive: (migs) =>
    deriveNet(migs, "rls_enabled", {
      create: {
        re: /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_%]*)"?\s+enable\s+row\s+level\s+security/gi,
        key: (x) => {
          // public-only, matching every other category. A non-public ENABLE (e.g. the unconditional
          // `ALTER TABLE realtime.messages ENABLE RLS` in 20260513020848) targets a Supabase-managed
          // system table the migrations don't own — asserting its RLS state risks a false positive on
          // a state that can reset out of band (realtime upgrade / partition rotation) with no ordinary
          // migration to reconcile it. The constraint category's owner-filter covers the same class.
          const sch = clean(x[1]) || "public";
          const t = clean(x[2]);
          return sch === "public" && t && !t.includes("%") && t !== "public" ? `public.${t}` : null;
        },
      },
      drop: {
        re: /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_%]*)"?\s+disable\s+row\s+level\s+security/gi,
        key: (x) => {
          const sch = clean(x[1]) || "public";
          const t = clean(x[2]);
          return sch === "public" && t && !t.includes("%") ? `public.${t}` : null;
        },
      },
      // A table's RLS-enabled state disappears when the TABLE is dropped (career_plans, passkey_* were
      // created-with-RLS then DROP TABLE'd). Anchored so ALTER PUBLICATION ... DROP TABLE is ignored.
      drop2: {
        re: /(?:^|;)\s*drop\s+table\s+(?:if\s+exists\s+)?([^;]+)/gi,
        key: (x) => splitDropTargets(x[1]).map((t) => `public.${t.name}`),
      },
      // the reference_* loop does `ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY` → needs sidecar
      dynamicRe: /\.\s*%i\s+enable\s+row\s+level\s+security/i,
    }),
  prodSelect:
    "select 'rls_enabled' as kind, 'public.'||lower(c.relname) as identifier from pg_class c " +
    "join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p') and c.relrowsecurity = true " +
    "and n.nspname = 'public'",
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
  const objs = SIDECAR.objects ?? {};
  const registered = new Set(Object.keys(objs));
  const unregistered = [...dynamicHits].filter((h) => !registered.has(h));
  if (unregistered.length)
    fail(
      `dynamic (%I fan-out) object declaration(s) with no reviewed sidecar entry in ${DYNAMIC_PATH} — ` +
        `cannot verify statically, refusing to skip:\n` +
        unregistered.map((h) => `  - ${h}`).join("\n") +
        `\nList the concrete names each produces under "objects"["${unregistered[0]}"] = [ ... ]. See ADR-0036.`
    );
  // A registered %I file must contribute >=1 concrete name. An empty/blank list satisfies the key
  // check above while injecting ZERO objects — the fan-out's objects would be verified against
  // nothing (a silent miss). Fail closed on an empty registration.
  const empty = [...dynamicHits].filter((h) => {
    const v = objs[h];
    return !Array.isArray(v) || v.length === 0 || v.every((s) => String(s).trim() === "");
  });
  if (empty.length)
    fail(
      `dynamic (%I fan-out) file(s) registered in ${DYNAMIC_PATH} with an EMPTY name list — they ` +
        `would inject zero objects and silently verify nothing:\n` +
        empty.map((h) => `  - ${h}`).join("\n")
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

// Committed per-category derived-count baselines (POST-allowlist), pinned to the real corpus. The
// gate fails when a category's count strays more than BASELINE_TOL from its baseline: a DROP is a
// partial-capture regression (silent under-verification — the old loose floors sat ~25% below actual
// and let ~50 objects vanish undetected); an unreviewed RISE means the schema grew and the baseline
// must be bumped in the same PR. Only enforced against the real corpus (skipped for a DB_SCHEMA_ROOT
// test fixture, whose counts are intentionally tiny). Bump these when a migration changes the schema.
const BASELINES = {
  table: 202,
  extension: 7,
  type: 25,
  view: 19,
  constraint: 19,
  rls_enabled: 202,
};
const BASELINE_TOL = 2;

// What a green run does NOT cover — printed on every real-prod run so a pass is never mistaken for
// "the whole schema is reconciled". Keep in sync with the header docstring's coverage list.
const NOT_VERIFIED_NOTE =
  "Coverage note: NOT verified — columns, indexes, triggers, policies, functions (categories not yet " +
  "implemented) and cron jobs (deferred; reconcile manually by diffing prod `SELECT jobname FROM " +
  "cron.job` against the intended set). A green result reconciles the ACTIVE categories only.";

async function main() {
  // Fail closed on a test seam left set in CI. The seams (fixture/dump/extract/root/probe) bypass or
  // short-circuit real prod verification — invaluable locally and in the smoke test, catastrophic if
  // one leaks into the blocking CI job (a green gate that verified nothing). In CI they are refused
  // unless a run EXPLICITLY opts in via DB_SCHEMA_ALLOW_SEAMS (the smoke test sets it; the blocking
  // gate never does). Locally (no CI env) the seams work freely.
  const inCI = /^(1|true|yes)$/i.test(process.env.CI ?? "");
  const allowSeams = /^(1|true|yes)$/i.test(process.env.DB_SCHEMA_ALLOW_SEAMS ?? "");
  if (inCI && !allowSeams) {
    const leaked = [
      "DB_SCHEMA_PROD_FIXTURE",
      "DB_SCHEMA_DUMP",
      "DB_SCHEMA_EXTRACT_ONLY",
      "DB_SCHEMA_ROOT",
      "DB_SCHEMA_PROBE",
    ].filter((k) => (process.env[k] ?? "").trim() !== "");
    if (leaked.length)
      fail(
        `refusing to honor test seam(s) [${leaked.join(", ")}] in CI — they bypass prod verification, ` +
          `so the blocking gate would pass without checking prod. Unset them (or set ` +
          `DB_SCHEMA_ALLOW_SEAMS=1 only in the guard's own smoke test). Failing closed.`
      );
  }

  const migs = loadMigrations();
  SIDECAR = loadSidecar();

  // 1. Derive declared sets per category (sidecar %I names injected into each file's event stream).
  const declaredByKind = new Map();
  for (const cat of CATEGORIES) declaredByKind.set(cat.kind, cat.derive(migs));
  checkDynamicRegistered();

  // 1b. Cross-category integrity — a constraint can only be asserted on a table a migration
  // actually creates. An ADD CONSTRAINT guarded by IF EXISTS on a Lovable-era table the
  // migrations don't own (interview_invites, added conditionally in 20260530194518) is NOT an
  // unconditional declaration: the gate cannot evaluate the guard, so it must not expect the
  // constraint in prod. Filtering on the derived table set also drops constraints on a table
  // later netted away by DROP TABLE. Verified via DB_SCHEMA_DUMP: this removes exactly the one
  // phantom (1 of 20), no real constraint. Identity is `table.constraint` — table is before the dot.
  {
    const tables = declaredByKind.get("table");
    const cons = declaredByKind.get("constraint");
    if (tables && cons)
      for (const id of [...cons]) if (!tables.has(id.slice(0, id.indexOf(".")))) cons.delete(id);
  }

  // 2. Subtract allowlist — first fail closed on a waiver naming an INACTIVE category (a dead key,
  //    e.g. a deferred category's leftover entries, would silently exempt objects if that category
  //    is ever re-activated).
  const allow = loadAllowlist();
  for (const k of Object.keys(allow))
    if (!k.startsWith("_") && !CATEGORIES.some((c) => c.kind === k))
      fail(
        `allowlist key '${k}' names no active category (deferred/removed?). A dead waiver silently ` +
          `exempts objects — remove it from ${ALLOWLIST_PATH}.`
      );
  for (const cat of CATEGORIES)
    for (const nm of allow[cat.kind] ?? []) declaredByKind.get(cat.kind).delete(String(nm));

  // 3. Zero-derived tripwire (always on, incl. test roots): if NOTHING is derived across all active
  //    categories, derivation is broken or everything was allowlisted away — a green "all 0 declared
  //    exist" would be the exact vacuous false-pass this gate exists to replace. Fail closed. (The
  //    real-corpus per-category baseline runs later, after the extract/dump early-exits — step 3b.)
  const totalDeclared = CATEGORIES.reduce((n, c) => n + declaredByKind.get(c.kind).size, 0);
  if (totalDeclared === 0)
    fail(
      `0 objects derived across all ${CATEGORIES.length} categories — derivation regressed or every ` +
        `object was allowlisted. Failing closed.`
    );

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

  // 3b. Baseline tripwire (real corpus only; skipped for a DB_SCHEMA_ROOT test fixture, whose counts
  //     are intentionally tiny). Each active category is pinned to its committed derived count ± a
  //     small tolerance, so a partial-capture regression that silently drops more than a couple of
  //     objects FAILS rather than passing under a loose floor. Legit schema growth/shrink is a
  //     reviewed one-line bump of BASELINES in the same PR.
  if (!process.env.DB_SCHEMA_ROOT) {
    for (const cat of CATEGORIES) {
      const expect = BASELINES[cat.kind];
      if (expect == null)
        fail(
          `active category '${cat.kind}' has no BASELINES entry — a new category must not ship without ` +
            `a pinned count tripwire (that is how a partial-capture regression is caught). Add ` +
            `BASELINES.${cat.kind} = <current derived count from DB_SCHEMA_EXTRACT_ONLY>. Failing closed.`
        );
      const size = declaredByKind.get(cat.kind).size;
      if (Math.abs(size - expect) > BASELINE_TOL)
        fail(
          `derived ${size} '${cat.kind}' objects; committed baseline is ${expect} (±${BASELINE_TOL}). ` +
            (size < expect
              ? `A drop of ${expect - size} is a partial-capture regression — objects would go unverified (silent drift). `
              : `An unreviewed increase of ${size - expect}: confirm the new objects are intended, then bump BASELINES.${cat.kind} to ${size}. `) +
            `Failing closed.`
        );
    }
  }

  // 4. Query prod reality (Management API, HTTPS) — ONE REQUEST PER CATEGORY (not a single UNION-ALL).
  //    A combined union exceeded the Management-API response cap (~960 rows) and silently dropped rows,
  //    making PRESENT objects look MISSING; offset-paging that union then SKIPPED rows at the page
  //    boundary because its (kind,identifier) order had ties (duplicate rows). Per category the result
  //    is small (well under the cap) and needs neither paging nor ordering. fetchProd fails closed if
  //    any single category nears the cap. search_path is set so extension-schema types render predictably.
  const rows = await fetchProd(CATEGORIES);

  const prodByKind = new Map();
  for (const cat of CATEGORIES) prodByKind.set(cat.kind, new Set());
  for (const r of rows) {
    const set = prodByKind.get(r.kind);
    if (set) set.add(String(r.identifier)); // case per category: cron verbatim, others already lowercase
  }

  // 4b. Allowlist integrity (fail-closed): a waiver may ONLY cover an object genuinely ABSENT from
  //     prod. If an allowlisted object is PRESENT, the waiver is stale/over-broad and is silently
  //     removing a REAL object from verification — the one fail-OPEN path in an otherwise fail-closed
  //     gate. Close it: an allowlisted-but-present object fails the gate.
  const staleAllow = [];
  for (const cat of CATEGORIES) {
    const prod = prodByKind.get(cat.kind);
    for (const nm of allow[cat.kind] ?? [])
      if (prod && prod.has(String(nm))) staleAllow.push(`${cat.kind.padEnd(11)} ${nm}`);
  }
  if (staleAllow.length)
    fail(
      `allowlist entr(y/ies) are PRESENT in prod — a waiver must only cover an ABSENT object; these ` +
        `are masking a real object from verification. Remove from ${ALLOWLIST_PATH}:\n` +
        staleAllow.map((s) => `  - ${s}`).join("\n")
    );

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
      `✓ ${CODE}: OK — all ${total} declared objects across ${CATEGORIES.length} ACTIVE categories ` +
        `(${CATEGORIES.map((c) => c.kind).join(", ")}) exist in prod ` +
        `(${process.env.SUPABASE_PROJECT_REF ?? "fixture"}).`
    );
    console.log(NOT_VERIFIED_NOTE);
    return;
  }
  console.error(
    `✖ ${CODE}: ${missing.length} declared object(s) are MISSING from prod — a migration was committed ` +
      `but never applied (the outage class):`
  );
  for (const line of missing) console.error(`  - ${line}`);
  console.error(
    `\nprod snapshot fetched: ${rows.length} row(s) — ${CATEGORIES.map((c) => `${c.kind}=${prodByKind.get(c.kind).size}`).join(", ")}.`
  );
  console.error(
    `\nApply the missing migration(s) to prod (Supabase Dashboard → SQL Editor), or — if an object was ` +
      `intentionally renamed/dropped out of band — add it to ${ALLOWLIST_PATH} with a reason (the gate ` +
      `fails closed if a waiver names an object that is actually present). See ADR-0036.`
  );
  console.error(NOT_VERIFIED_NOTE);
  process.exitCode = 1;
}

// Read prod objects: from DB_SCHEMA_PROD_FIXTURE (test) or the Supabase Management API (HTTPS).
// The API path PAGES the (ordered) query with LIMIT/OFFSET so a per-response row cap can't silently
// truncate the snapshot — a truncated snapshot makes present objects look MISSING (a false positive)
// AND, worse, could hide a real object; paging removes the whole class. Fail closed on anything that
// isn't a clean array of rows. NEVER call process.exit() after fetch (killing the process with the
// socket still closing triggers a libuv assert on Windows — ADR-0035).
async function fetchProd(categories) {
  const fixture = process.env.DB_SCHEMA_PROD_FIXTURE?.trim();
  if (fixture) {
    const rows = readJson(fixture);
    if (!Array.isArray(rows))
      fail("DB_SCHEMA_PROD_FIXTURE is not a JSON array of rows. Failing closed.");
    return rows; // a fixture is one complete array of all-category rows
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (!token)
    fail(
      "SUPABASE_ACCESS_TOKEN not set — cannot verify prod. Failing closed (a guard that cannot check must fail, " +
        "not skip). Generate a Management-API token at https://supabase.com/dashboard/account/tokens (starts with sbp_)."
    );
  if (!ref) fail("SUPABASE_PROJECT_REF not set — cannot target a project. Failing closed.");
  // One request per category: each result is well under the Management-API response cap, so no single
  // response is truncated and there is no cross-category paging to skip rows over ties. If a category
  // ever approaches the cap, FAIL CLOSED (add keyset paging for it) rather than trust a possibly-cut
  // response — never silently under-verify.
  const CAP_WARN = 800;
  const all = [];
  for (const cat of categories) {
    const rows = await postProdQuery(
      ref,
      token,
      `set search_path = public, extensions; ${cat.prodSelect};`
    );
    if (rows.length >= CAP_WARN)
      fail(
        `prod category '${cat.kind}' returned ${rows.length} rows — near the Management-API response cap; ` +
          `a single response may be truncated. Add keyset paging for '${cat.kind}' before trusting it. Failing closed.`
      );
    for (const r of rows) all.push(r);
  }
  return all;
}

// One Management-API POST returning a clean array of rows, or fail closed. Split out so fetchProd can
// page. NEVER process.exit() here (see ADR-0035 libuv note above).
async function postProdQuery(ref, token, query) {
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
