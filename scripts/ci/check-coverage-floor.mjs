#!/usr/bin/env node
// ci-lane: bespoke
/**
 * COVERAGE-FLOOR-001 — unit/component coverage must not fall below a shrink-only floor.
 *
 * WHY THIS EXISTS
 * ---------------
 * The suite has 465+ test files but NOTHING measured or gated how much code they exercise:
 * vitest.config.ts had no coverage block, no `@vitest/coverage-*` provider, and CI ran
 * `vitest run` with no `--coverage` (enterprise-readiness audit 2026-10, H2). "Tests pass" said
 * nothing about untested code, so coverage could silently rot to zero.
 *
 * Now coverage is measured (vitest v8, sharded → merged in CI) and THIS guard enforces it against
 * `scripts/ci/coverage-floor.json`, a floor that may only RISE (ratchet). Prevention-by-construction:
 * the gate fails CLOSED (exit 2) if the coverage summary is missing or unparseable — so "coverage
 * never ran" can never read as a pass, the exact false-green class decisions.md §6 forbids.
 *
 * Runs as its own CI step (bespoke lane) in the `coverage` merge job, after
 * `vitest run --merge-reports --coverage` writes coverage/coverage-summary.json. Reads two JSON files
 * (not a directory walk). Pinned by src/test/smoke/check-coverage-floor.smoke.test.ts.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SUMMARY = process.env.COVERAGE_SUMMARY
  ? resolve(process.env.COVERAGE_SUMMARY)
  : resolve(ROOT, "coverage", "coverage-summary.json");
const FLOOR = process.env.COVERAGE_FLOOR
  ? resolve(process.env.COVERAGE_FLOOR)
  : resolve(HERE, "coverage-floor.json");

const METRICS = ["lines", "statements", "functions", "branches"];
const die = (msg) => {
  console.error(`✖ check-coverage-floor: ${msg}`);
  process.exit(2);
};

let floor;
try {
  floor = JSON.parse(readFileSync(FLOOR, "utf8").replace(/^﻿/, ""));
} catch (e) {
  die(`cannot read/parse floor ${FLOOR}: ${e.message}. Failing closed.`);
}

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY, "utf8").replace(/^﻿/, ""));
} catch (e) {
  die(
    `cannot read coverage summary ${SUMMARY}: ${e.message}. ` +
      `Did \`vitest run --coverage\` (merged across shards) run first? Failing closed.`
  );
}
if (!summary.total || typeof summary.total !== "object") {
  die(`${SUMMARY} has no \`.total\` block — not a vitest coverage-summary. Failing closed.`);
}

const below = [];
const report = [];
for (const m of METRICS) {
  const pct = summary.total?.[m]?.pct;
  const min = floor[m];
  if (typeof pct !== "number") die(`coverage summary missing total.${m}.pct. Failing closed.`);
  if (typeof min !== "number") die(`floor is missing a number for "${m}". Failing closed.`);
  report.push(`${m} ${pct.toFixed(2)}% (floor ${min}%)`);
  if (pct + 1e-9 < min) below.push({ m, pct, min });
}

if (below.length) {
  console.error(`✖ check-coverage-floor: coverage dropped below the floor:`);
  for (const b of below)
    console.error(`  ${b.m}: ${b.pct.toFixed(2)}% < floor ${b.min}%`);
  console.error(
    `\nAdd tests to restore coverage, or — only if the floor is genuinely too high — lower it in\n` +
      `scripts/ci/coverage-floor.json with justification (the floor is meant to RISE, not fall).`
  );
  process.exit(1);
}

console.log(`✓ check-coverage-floor: OK — ${report.join(", ")}.`);
