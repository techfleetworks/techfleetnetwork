#!/usr/bin/env node
/**
 * GUARD-MATRIX (ADR-0047) — derive the ci.yml lint-arch matrices from each guard's self-declared
 * `// ci-lane` marker, so adding a guard NEVER edits a central matrix list in ci.yml (the per-merge
 * conflict magnet ADR-0046 began removing). Prints the `critical` / `standard` guard arrays for the
 * two matrix jobs to consume via `fromJSON`.
 *
 * Usage:
 *   node scripts/ci/emit-guard-matrix.mjs                 # human-readable summary (local debugging)
 *   node scripts/ci/emit-guard-matrix.mjs --github-output # `critical=[...]` / `standard=[...]` for $GITHUB_OUTPUT
 *   node scripts/ci/emit-guard-matrix.mjs --lane critical # compact JSON array for one lane
 *
 * FAIL-CLOSED (this is a gate input, not a convenience): exits non-zero if scripts/ci is missing or
 * empty, if ANY guard lacks a valid lane (so a new guard cannot slip in unclassified), or if either
 * MATRIX lane is empty — an empty matrix would run ZERO guards and pass vacuously, the exact
 * false-green the whole guard fleet exists to prevent.
 *
 * Not a `check-*` guard (it produces the matrix rather than asserting a rule), so it is not scanned
 * by check-ci-guard-integrity / required by check-guard-has-test — but it is pinned by
 * src/test/smoke/emit-guard-matrix.smoke.test.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { laneOf, LANES } from "./_guard-lane.mjs";

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)));

const die = (msg) => {
  console.error(`✖ emit-guard-matrix: ${msg}`);
  process.exit(2);
};

let guards;
try {
  guards = readdirSync(CI_DIR)
    .filter((f) => /^check-.*\.mjs$/.test(f))
    .sort();
} catch (e) {
  die(`cannot read ${CI_DIR}: ${e.message} (failing closed)`);
}
if (guards.length === 0) die(`no check-*.mjs guards in ${CI_DIR} (zero-scan). Failing closed.`);

const byLane = Object.fromEntries(LANES.map((l) => [l, []]));
const errors = [];
for (const g of guards) {
  const { lane, error } = laneOf(readFileSync(join(CI_DIR, g), "utf8"));
  if (error) errors.push(`${g}: ${error}`);
  else byLane[lane].push(g);
}

if (errors.length) {
  console.error(`✖ emit-guard-matrix: every guard must self-declare a CI lane in its own file:`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    `\nAdd one comment line to the guard, e.g. \`// ci-lane: standard\` ` +
      `(critical = blocking auth/security; standard = informational; bespoke = has its own workflow step).`
  );
  process.exit(2);
}

// A matrix lane going empty would run zero guards and pass vacuously — fail closed.
for (const lane of ["critical", "standard"]) {
  if (byLane[lane].length === 0) {
    die(
      `the '${lane}' matrix lane is empty — it would run zero guards and pass vacuously. Failing closed.`
    );
  }
}

const arg = process.argv[2];
if (arg === "--github-output") {
  process.stdout.write(`critical=${JSON.stringify(byLane.critical)}\n`);
  process.stdout.write(`standard=${JSON.stringify(byLane.standard)}\n`);
} else if (arg === "--lane") {
  const lane = process.argv[3];
  if (!LANES.includes(lane)) die(`--lane must be one of ${LANES.join("|")}`);
  process.stdout.write(JSON.stringify(byLane[lane]));
} else {
  console.log(
    `✓ emit-guard-matrix: ${guards.length} guards — ` +
      LANES.map((l) => `${l}=${byLane[l].length}`).join(", ")
  );
  for (const l of LANES) console.log(`  [${l}] ${byLane[l].join(", ") || "(none)"}`);
}
