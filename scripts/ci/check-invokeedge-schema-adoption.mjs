#!/usr/bin/env node
// ci-lane: critical
/**
 * ARCH-2 / ARCH-4 ratchet — every `invokeEdge(...)` call site must carry a request/response
 * contract (`bodySchema` and/or `responseSchema`), so a frontend↔edge shape drift fails loudly
 * instead of silently at runtime. This is the enforcement half of ADR 20261110: the helper
 * (src/lib/edge/invokeEdge.ts) already validates when a schema is passed; this guard makes the
 * backlog of schema-less callers a monotonically SHRINKING count that can never silently grow.
 *
 * How it works (a per-COUNT snapshot ratchet, not a per-file allow rule):
 *   - It scans src/ for invokeEdge call sites and counts, per file, the ones with NO schema.
 *   - invokeedge-schema-adoption.snapshot.json pins that per-file count (the known backlog).
 *   - A file whose unschematized count is ABOVE its snapshot (a new caller, or an existing caller
 *     that dropped its schema) FAILS — prevent-by-construction against new silent contracts.
 *   - A file whose count is BELOW its snapshot (a caller gained a schema, or the file no longer
 *     calls invokeEdge) also FAILS as STALE: the ratchet must be tightened with --update, so the
 *     backlog number in the repo is never a lie. (This is the "fail on stale, count not file"
 *     discipline from the RP-J re-audit, applied to the adoption backlog.)
 *
 * Excluded by design: the helper itself, test files, and src/features/auth/** (the auth refactor
 * owns those callers and routes them through sessionPort, a different API — out of scope here).
 *
 * To record progress after adopting schemas on more call sites:
 *   node scripts/ci/check-invokeedge-schema-adoption.mjs --update   (run from the repo root)
 * CI only VERIFIES; it never mutates. Fails CLOSED: a missing snapshot, an unreadable file, or a
 * zero-file scan exits non-zero rather than passing vacuously (decisions.md §6).
 *
 * This guard is a bespoke reader — it does not list rule violations in files, it compares a scanned
 * count against a committed number — so it opts out of the shared content-scan harness on record:
 * ci-guard-integrity: bespoke-dir-reader — snapshot-count ratchet over invokeEdge call sites (not a per-file content rule)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = resolve(ROOT, "src");
const SNAPSHOT_PATH = resolve(ROOT, "scripts/ci/invokeedge-schema-adoption.snapshot.json");

const HELPER_REL = "src/lib/edge/invokeEdge.ts";
const EXTS = new Set([".ts", ".tsx"]);

/** Files the ratchet never counts: the helper, tests, type decls, and the auth refactor's callers. */
function isExcluded(rel) {
  if (rel === HELPER_REL) return true;
  if (rel.startsWith("src/features/auth/")) return true;
  if (/\.d\.ts$/.test(rel)) return true;
  if (/(^|\/)(test|__tests__|__mocks__)\//.test(rel)) return true;
  if (/\.(test|spec)\.tsx?$/.test(rel)) return true;
  return false;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === "coverage") continue;
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, out);
    else if (EXTS.has(full.slice(full.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

// A call site is `invokeEdge` (not `x.invokeEdge`, which is the auth sessionPort) with an optional
// generic, then `(`. The lookbehind rejects a `.`/identifier char immediately before the name.
const CALL_RE = /(?<![.\w])invokeEdge\s*(?:<[^>]*>)?\s*\(/g;
const SCHEMA_RE = /\b(?:body|response)Schema\b/;

/** The text between the opening `(` at `openIdx` and its matching `)` (brace-depth aware). */
function argsOf(text, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  for (; i < text.length && depth > 0; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
  }
  return text.slice(openIdx + 1, i - 1);
}

/**
 * Strip comments so a `invokeEdge(...)` MENTIONED in a docblock (e.g. edge-timeouts.ts explaining
 * the timeout precedence) is never miscounted as a real call site. Removes block comments and
 * full-line `//` comments only — a `//` inside a string literal is left alone (real multi-line
 * invokeEdge calls are never squeezed onto such a line), so no genuine call is dropped.
 */
function stripComments(src) {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split(/\r?\n/)
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
}

/** Count invokeEdge call sites in `text` whose argument object carries NO schema. */
function countUnschematized(text) {
  let count = 0;
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(text))) {
    const openIdx = m.index + m[0].length - 1; // index of the "("
    const args = argsOf(text, openIdx);
    if (!SCHEMA_RE.test(args)) count++;
  }
  return count;
}

// --- Scan ------------------------------------------------------------------------------------
let files;
try {
  statSync(SRC_ROOT);
  files = walk(SRC_ROOT);
} catch (e) {
  console.error(
    `✖ check-invokeedge-schema-adoption: cannot read ${SRC_ROOT}: ${e.message}. Failing closed.`
  );
  process.exit(2);
}
if (files.length === 0) {
  console.error(
    `✖ check-invokeedge-schema-adoption: scanned 0 source files under ${SRC_ROOT} — path moved? Failing closed rather than passing vacuously.`
  );
  process.exit(2);
}

const current = {}; // rel -> count of unschematized call sites (only entries with count > 0)
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (isExcluded(rel)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(
      `✖ check-invokeedge-schema-adoption: cannot read ${rel}: ${e.message}. Failing closed.`
    );
    process.exit(2);
  }
  if (!text.includes("invokeEdge")) continue;
  const n = countUnschematized(stripComments(text));
  if (n > 0) current[rel] = n;
}

const totalCurrent = Object.values(current).reduce((a, b) => a + b, 0);

// --- --update: record the backlog ------------------------------------------------------------
if (process.argv.includes("--update")) {
  const callers = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify(
      {
        _comment:
          "Per-file count of invokeEdge call sites WITHOUT a body/response schema (the ARCH-2 adoption backlog). Monotonically shrinks; regenerate with `node scripts/ci/check-invokeedge-schema-adoption.mjs --update`. Enforced by the same guard (ci-lane: critical).",
        total: totalCurrent,
        callers,
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    `Snapshot refreshed: ${totalCurrent} unschematized invokeEdge call site(s) across ${Object.keys(callers).length} file(s).`
  );
  process.exit(0);
}

// --- Verify against the snapshot -------------------------------------------------------------
let snapshot;
try {
  const parsed = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  snapshot = parsed.callers ?? {};
  if (typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("callers must be an object");
} catch (e) {
  console.error(
    `✖ check-invokeedge-schema-adoption: cannot read snapshot ${SNAPSHOT_PATH}: ${e.message}. Run with --update locally and commit. Failing closed.`
  );
  process.exit(2);
}

const regressions = []; // new/increased unschematized callers — must carry a schema
const stale = []; // snapshot higher than reality — must be tightened with --update

const allFiles = new Set([...Object.keys(current), ...Object.keys(snapshot)]);
for (const rel of [...allFiles].sort()) {
  const now = current[rel] ?? 0;
  const was = snapshot[rel] ?? 0;
  if (now > was) regressions.push(`${rel}: ${was} → ${now} unschematized invokeEdge call(s)`);
  else if (now < was) stale.push(`${rel}: snapshot says ${was}, now ${now}`);
}

if (regressions.length || stale.length) {
  console.error(
    `✖ check-invokeedge-schema-adoption: invokeEdge contract ratchet violated (${totalCurrent} unschematized call sites now):`
  );
  if (regressions.length) {
    console.error("\n  New or increased schema-less invokeEdge call site(s):");
    for (const r of regressions) console.error(`    - ${r}`);
    console.error(
      "  Fix: pass `bodySchema` and/or `responseSchema` (a Zod schema mirroring the edge function) to invokeEdge."
    );
  }
  if (stale.length) {
    console.error("\n  STALE snapshot entr(ies) — the backlog shrank but the number was not tightened:");
    for (const s of stale) console.error(`    - ${s}`);
    console.error(
      "  Fix: run `node scripts/ci/check-invokeedge-schema-adoption.mjs --update` and commit the snapshot."
    );
  }
  process.exit(1);
}

console.log(
  `✓ check-invokeedge-schema-adoption: ${totalCurrent} unschematized invokeEdge call site(s) across ${Object.keys(current).length} file(s) — matches the snapshot, none new, none stale.`
);
