#!/usr/bin/env node
// ci-lane: bespoke
/**
 * GUARDS-WIRED-001 — every guard must actually RUN in CI (no unwired guards).
 *
 * WHY THIS EXISTS
 * ---------------
 * A guard that is committed but runs in no CI job verifies NOTHING — protection theater (the
 * ADR-0024 gap). This meta-check closes that gap by construction, working WITH the self-declared CI
 * lane (ADR-0047): every `scripts/ci/check-*.mjs` must declare exactly one
 * `// ci-lane: critical|standard|bespoke`, and:
 *   - critical / standard → run via the DERIVED lint-arch matrices (emit-guard-matrix.mjs), so they
 *                           are wired by construction — a new guard NEVER edits a matrix list in ci.yml.
 *   - bespoke             → must have its OWN hand-written step: its filename must appear in a live
 *                           `.github/workflows/*.yml` step (special setup — fetch-depth:0, prod creds,
 *                           an own job).
 * We also assert emit-guard-matrix.mjs is itself wired, so the derivation actually runs — otherwise the
 * whole matrix (every critical/standard guard) would run nowhere.
 *
 * Combined with check-guard-has-test (every guard has a test), verify-guard-test-discrimination (that
 * test is non-vacuous), and the guard living in the required `gate`, this makes "a guard silently stops
 * protecting" impossible: it cannot be added unclassified, untested, vacuous, or run nowhere.
 *
 * A guard may be deliberately deferred — record it in the shrink-only allowlist
 * `guards-wired-allowlist.json` (exempts it from the wiring assertion only; it still needs a lane).
 *
 * Fail-closed: missing scripts/ci, missing workflows dir, unreadable allowlist, zero guards, or
 * emit-guard-matrix not wired → exit 2. Meta-check (reads workflow YAML, not a src scan), so it owns
 * its own fail-closed + evidence rather than using the _guard.mjs scan harness.
 *
 * ci-guard-integrity: bespoke-dir-reader — meta-check: enumerates guards + workflow files (not a per-file content scan)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./_json.mjs";
import { laneOf } from "./_guard-lane.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CI_DIR = join(ROOT, "scripts/ci");
const WF_DIR = join(ROOT, ".github/workflows");
const ALLOWLIST = join(CI_DIR, "guards-wired-allowlist.json");
const MATRIX_GENERATOR = "emit-guard-matrix.mjs";

const die = (msg) => {
  console.error(`✖ check-guards-wired: ${msg}`);
  process.exit(2);
};

if (!existsSync(CI_DIR)) die(`scripts/ci not found at ${CI_DIR}. Failing closed.`);
if (!existsSync(WF_DIR)) die(`.github/workflows not found at ${WF_DIR}. Failing closed.`);

let allow;
try {
  allow = new Set(readJson(ALLOWLIST));
} catch (e) {
  die(`allowlist not found or invalid JSON at ${ALLOWLIST} (${e.message}).`);
}

const guards = readdirSync(CI_DIR).filter((f) => /^check-.*\.mjs$/.test(f));
if (guards.length === 0)
  die(`no check-*.mjs guards found in scripts/ci (zero-scan). Failing closed.`);

const workflows = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
if (workflows.length === 0)
  die(`no workflow files in .github/workflows (zero-scan). Failing closed.`);

// Workflow text with YAML comments stripped — a name mentioned only in a comment / commented-out step
// does NOT count as wired; we assert a REFERENCE IN A LIVE STEP.
const wfCode = workflows
  .map((f) => readFileSync(join(WF_DIR, f), "utf8"))
  .join("\n")
  .split("\n")
  .map((l) => l.replace(/#.*$/, ""))
  .join("\n");

// "Wired" = the filename appears as a real token (preceded by sep/quote/space, not a prefix of a
// longer name), so `check-auth.mjs` is not matched by `recheck-auth.mjs`.
const isWired = (name) =>
  new RegExp(`(?:^|[\\s/"'])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "m").test(
    wfCode
  );

// The derivation itself must run, or every critical/standard guard is wired to nothing.
if (!isWired(MATRIX_GENERATOR))
  die(
    `${MATRIX_GENERATOR} is referenced in no workflow — the derived lint-arch matrices (every ` +
      `critical/standard guard) would run nowhere. Failing closed.`
  );

// Read each guard's lane once.
const laneByGuard = new Map(guards.map((g) => [g, laneOf(readFileSync(join(CI_DIR, g), "utf8"))]));

const undeclared = []; // no / invalid / conflicting ci-lane (the allowlist does NOT exempt this)
const unwiredBespoke = []; // bespoke lane but no live step (allowlist DOES exempt this)

for (const g of guards) {
  const { lane, error } = laneByGuard.get(g);
  if (error) {
    undeclared.push(`${g}: ${error}`);
    continue;
  }
  if (lane === "bespoke" && !isWired(g) && !allow.has(g)) unwiredBespoke.push(g);
  // critical / standard ride the derived matrix (generator asserted wired above).
}

if (undeclared.length || unwiredBespoke.length) {
  console.error(`✖ check-guards-wired: guard wiring violation(s):`);
  if (undeclared.length) {
    console.error(`\n  Guards missing a valid CI lane (ADR-0047):`);
    for (const u of undeclared) console.error(`    - ${u}`);
    console.error(
      `  Add one comment line, e.g. \`// ci-lane: standard\` — critical = blocking auth/security, ` +
        `standard = informational, bespoke = its own workflow step.`
    );
  }
  if (unwiredBespoke.length) {
    console.error(`\n  Bespoke guards with no live workflow step (they run nowhere):`);
    for (const g of unwiredBespoke) console.error(`    - ${g}`);
    console.error(
      `  Add a step that runs it, switch it to \`// ci-lane: standard|critical\` to ride the derived ` +
        `matrix, or — deferred only — add it to ${ALLOWLIST} (shrink-only).`
    );
  }
  process.exit(1);
}

// Report stale allowlist entries (gone, or now wired / no longer bespoke) so the ratchet can shrink.
const stale = [...allow].filter((g) => {
  if (!guards.includes(g)) return true;
  const { lane } = laneByGuard.get(g);
  return lane !== "bespoke" || isWired(g);
});

const counts = { critical: 0, standard: 0, bespoke: 0 };
for (const { lane } of laneByGuard.values()) if (lane) counts[lane]++;

console.log(
  `✓ check-guards-wired: OK — ${guards.length} guards all declare a CI lane ` +
    `(critical=${counts.critical}, standard=${counts.standard}, bespoke=${counts.bespoke}); ` +
    `critical/standard ride the derived matrix, every bespoke has a live step; ` +
    `${allow.size} on the shrink-only allowlist.`
);
if (stale.length)
  console.log(
    `  note: ${stale.length} allowlist entry(ies) can be REMOVED (now wired / gone): ${stale.join(", ")}`
  );
process.exit(0);
