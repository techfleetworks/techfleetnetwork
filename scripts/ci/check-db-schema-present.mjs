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
    for (const nm of allow[cat.kind] ?? [])
      declaredByKind.get(cat.kind).delete(String(nm).toLowerCase());
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

  // 4. Query prod reality (Management API, HTTPS) — one composed query. (Wired next increment.)
  fail(
    "prod-query path not yet wired in this increment — use DB_SCHEMA_EXTRACT_ONLY=1 to self-check extraction.",
    2
  );
}

main().catch((e) => {
  if (e !== EXIT) {
    console.error(`✖ ${CODE}: unexpected error — ${e?.stack || e}`);
    process.exitCode = 2;
  }
});
