#!/usr/bin/env node
// ci-lane: bespoke
/**
 * CHECK-BDD-RUNNER (ADR 20261110 — re-audit RP-G / BDD-1·BDD-2) — the fail-closed gate that keeps the
 * executable Gherkin runner honest. The 106 `.feature` scenarios used to be documentation with no
 * runner; now a strict cucumber-js job executes the implemented subset. This guard proves the index
 * that tracks that subset cannot silently drift, that no scenario is silently dropped, and that auth
 * features never leak into the executed set.
 *
 * It asserts, FAIL-CLOSED:
 *   1. The committed datastore `features/bdd-index.json` is byte-identical to a fresh derivation from
 *      the `.feature` files (feature files are the source of truth — a stale index fails the build).
 *   2. Every feature declares >=1 audience, all in the controlled vocabulary (audience enumeration).
 *   3. Every @auth feature has status `excluded-auth` and contributes ZERO executable scenarios — the
 *      auth refactor owns auth features; they must never run in this gate.
 *   4. The executable set is NON-EMPTY — an all-pending index would make the strict runner pass
 *      vacuously (zero scenarios), the exact false-green this gate exists to prevent.
 *   5. Every feature path appears in the human-readable `features/INDEX.md` (the shared view can't omit one).
 *
 * Runs as its own step in the blocking `bdd` job (ci-lane: bespoke). The dir walk + zero-scan
 * fail-closed live in emit-bdd-index.mjs's buildIndex(), imported here — this guard reads only two
 * committed files (readFileSync), so it is not a hand-rolled directory walk.
 *
 * Pinned by src/test/smoke/check-bdd-runner.smoke.test.ts (discrimination: neutralize the index →
 * the guard reds).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, AUDIENCE_VOCAB } from "./emit-bdd-index.mjs";

// BDD_INDEX_ROOT overrides the repo root ONLY for this guard's own smoke test (throwaway fixtures);
// never set in CI/production, so the shipped guard always reads the real repo. Must match the same
// override in emit-bdd-index.mjs so buildIndex() and the committed files resolve to one root.
const ROOT = process.env.BDD_INDEX_ROOT
  ? resolve(process.env.BDD_INDEX_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX_JSON = join(ROOT, "features/bdd-index.json");
const INDEX_MD = join(ROOT, "features/INDEX.md");

const die = (msg) => {
  console.error(`✖ check-bdd-runner: ${msg}`);
  process.exit(2);
};

function readText(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    die(`cannot read ${label} at ${path}: ${e.message}. Failing closed.`);
  }
}

// 1. Derive from the feature files (buildIndex fails closed on zero features).
let derived;
try {
  derived = buildIndex();
} catch (e) {
  die(`could not derive the index from the feature files: ${e.message}. Failing closed.`);
}

// Canonical serialization — the exact shape emit-bdd-index.mjs --json writes.
const derivedJson = JSON.stringify(derived, null, 2) + "\n";
const committedJson = readText(INDEX_JSON, "features/bdd-index.json");

const violations = [];

if (committedJson !== derivedJson) {
  violations.push(
    "features/bdd-index.json is STALE — it does not match the .feature files. " +
      "Regenerate: `node scripts/ci/emit-bdd-index.mjs --json > features/bdd-index.json`."
  );
}

// Parse the committed copy defensively — a malformed datastore is itself a failure. (The result is
// not otherwise used; the byte-equality check above is the drift gate. Parsing here is the
// malformed-JSON trap.)
try {
  JSON.parse(committedJson);
} catch (e) {
  die(`features/bdd-index.json is not valid JSON: ${e.message}. Failing closed.`);
}

const features = Array.isArray(derived.features) ? derived.features : [];
if (features.length === 0) die("derived zero features. Failing closed.");

// 2. Audience enumeration — every feature maps to >=1 in-vocab audience.
for (const f of features) {
  if (!Array.isArray(f.audiences) || f.audiences.length === 0) {
    violations.push(`${f.path}: no declared audience (add it to FEATURE_AUDIENCES in emit-bdd-index.mjs).`);
    continue;
  }
  const bad = f.audiences.filter((a) => !AUDIENCE_VOCAB.includes(a));
  if (bad.length) violations.push(`${f.path}: audience(s) not in vocabulary: ${bad.join(", ")}.`);
}

// 3. Auth features never execute here.
for (const f of features) {
  const isAuth = f.featureTags?.includes("@auth");
  if (isAuth && f.status !== "excluded-auth") {
    violations.push(`${f.path}: @auth feature must have status "excluded-auth", got "${f.status}".`);
  }
  if (isAuth && f.scenarios.executable !== 0) {
    violations.push(`${f.path}: @auth feature must contribute 0 executable scenarios, got ${f.scenarios.executable}.`);
  }
}

// 4. Non-vacuous executable set.
const totalExecutable = features.reduce((n, f) => n + (f.scenarios.executable || 0), 0);
if (totalExecutable === 0) {
  violations.push(
    "the executable set is EMPTY — the strict runner would execute zero scenarios and pass vacuously."
  );
}

// 5. Human-readable view lists every feature AND its status + counts match the datastore — so the
// prose view cannot silently drift from the JSON (a smaller version of the "docs that read like
// truth" defect this gate exists to kill). The table row that names a feature's path must also
// carry its status and its `<exec> / <total>` count.
const md = readText(INDEX_MD, "features/INDEX.md");
const mdLines = md.split(/\r?\n/);
for (const f of features) {
  const row = mdLines.find((l) => l.includes(f.path));
  if (!row) {
    violations.push(`${f.path}: not listed in features/INDEX.md (the shared view must not omit a feature).`);
    continue;
  }
  const count = `${f.scenarios.executable} / ${f.scenarios.total}`;
  if (!row.includes(f.status)) {
    violations.push(`${f.path}: features/INDEX.md row does not show status "${f.status}" (stale human view).`);
  }
  if (!row.includes(count)) {
    violations.push(`${f.path}: features/INDEX.md row does not show count "${count}" (stale human view).`);
  }
}

if (violations.length) {
  console.error("✖ check-bdd-runner: BDD index / runner integrity violation(s):");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `✓ check-bdd-runner: ${features.length} features reconciled — ` +
    `${totalExecutable} executable scenario-definitions, ${derived.totals.pending} pending, auth excluded. ` +
    `Datastore in sync with the feature files.`
);
