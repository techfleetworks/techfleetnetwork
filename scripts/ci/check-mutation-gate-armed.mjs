#!/usr/bin/env node
// ci-lane: critical
/**
 * MUT-GATE-001 — the product-code mutation gate must stay ARMED (a real break floor, a non-empty
 * target, and a workflow that actually fails on a low score).
 *
 * WHAT: Fails if stryker.conf.json has `thresholds.break` <= 0 (or missing), or an empty `mutate`
 *       target, or if the mutation workflow neuters its Stryker run with `|| true` / `|| :` /
 *       `continue-on-error: true`. Any one of those makes the gate pass vacuously.
 *
 * HOW:  Reads two known files — stryker.conf.json and .github/workflows/mutation.yml. It checks the
 *       parsed config for a positive numeric break and a non-empty mutate array, and scans the
 *       workflow for a Stryker run (`npm run test:mutation` / `stryker`) that is not silenced. It
 *       reads ONE known config and ONE known workflow (not a directory scan), so it needs no
 *       bespoke-dir-reader marker. Fails CLOSED (exit 2) if a file is missing or unrecognizable.
 *
 * WHY:  The Oct-2026 audit found the mutation gate shipped with `break: 0`, which can never fail:
 *       Stryker ran, produced a real score (43.84% on security.ts), and the job still passed. That
 *       is a false green — the exact vacuous-gate class decisions.md §6 forbids. The measured floor
 *       was ratcheted to 40; this guard makes re-disarming it (back to 0, an empty target, or a
 *       silenced run) impossible to merge. Prevention by construction; this is the fail-closed backstop.
 *
 * FIX:  Keep `thresholds.break` > 0 in stryker.conf.json (raise it as the real score climbs; never
 *       lower it), keep `mutate` non-empty, and do not add `|| true` / `continue-on-error: true` to
 *       the Stryker step in .github/workflows/mutation.yml. To intentionally retire the gate, remove
 *       it deliberately with an ADR — do not silently disarm it.
 *
 * Exit codes: 0 = armed; 1 = disarmed (vacuous config or silenced run); 2 = fail-closed.
 * Pinned by src/test/smoke/check-mutation-gate-armed.smoke.test.ts.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONF_FILE = process.env.MUTATION_STRYKER_FILE
  ? resolve(process.env.MUTATION_STRYKER_FILE)
  : resolve(ROOT, "stryker.conf.json");
const WORKFLOW_FILE = process.env.MUTATION_WORKFLOW_FILE
  ? resolve(process.env.MUTATION_WORKFLOW_FILE)
  : resolve(ROOT, ".github", "workflows", "mutation.yml");

const fail = (msg) => {
  console.error(`✖ check-mutation-gate-armed: ${msg}`);
  process.exit(1);
};
const failClosed = (msg) => {
  console.error(`✖ check-mutation-gate-armed (fail-closed): ${msg}`);
  process.exit(2);
};

// --- 1. The Stryker config must have a real break floor and a non-empty target. ---
let confRaw;
try {
  confRaw = readFileSync(CONF_FILE, "utf8");
} catch (e) {
  failClosed(`cannot read ${CONF_FILE}: ${e.message}. Failing closed.`);
}
let conf;
try {
  conf = JSON.parse(confRaw);
} catch (e) {
  failClosed(`${CONF_FILE} is not valid JSON (${e.message}). Failing closed.`);
}
// Zero-scan: the file must actually look like a Stryker config, or we are checking nothing.
if (!conf || typeof conf !== "object" || !("mutate" in conf) || !("thresholds" in conf)) {
  failClosed(`${CONF_FILE} is not a Stryker config (no mutate/thresholds). Failing closed.`);
}

const brk = conf.thresholds?.break;
if (typeof brk !== "number" || !Number.isFinite(brk) || brk <= 0) {
  fail(
    `thresholds.break is ${JSON.stringify(brk)} — the gate can never fail. ` +
      `Set a positive break floor (the current measured score, minus a small margin).`,
  );
}

const mutate = conf.mutate;
if (!Array.isArray(mutate) || mutate.length === 0) {
  fail(`mutate is empty — the gate tests nothing. List at least one target file.`);
}

// --- 2. The workflow must run Stryker and must not silence it. ---
let wf;
try {
  wf = readFileSync(WORKFLOW_FILE, "utf8");
} catch (e) {
  failClosed(`cannot read ${WORKFLOW_FILE}: ${e.message}. Failing closed.`);
}
// Zero-scan: the file must actually run the mutation suite, or the gate is not wired.
if (!/\btest:mutation\b|\bstryker\b/.test(wf)) {
  failClosed(
    `${WORKFLOW_FILE} does not run \`npm run test:mutation\` / stryker — wrong file or gate removed. Failing closed.`,
  );
}

const violations = [];
wf.split("\n").forEach((line, i) => {
  // Flag a Stryker run line silenced with `|| true` or `|| :`. Use `(?!\w)` not `\b`: after a `:`
  // (a non-word char) there is no word boundary, so `\b` would miss the `|| :` no-op idiom entirely.
  if (/(test:mutation|stryker)/.test(line) && /\|\|\s*(?:true|:)(?!\w)/.test(line)) {
    violations.push(`line ${i + 1}: Stryker run is silenced with \`|| true\`/\`|| :\` — remove it.`);
  }
});
// A step-level opt-out anywhere in the workflow neuters the gate.
if (/continue-on-error:\s*true/.test(wf)) {
  violations.push(`\`continue-on-error: true\` is present — it lets the Stryker step pass on failure. Remove it.`);
}

if (violations.length) {
  fail(`the mutation workflow is neutered:\n   ${violations.join("\n   ")}`);
}

console.log(
  `✓ check-mutation-gate-armed: break=${brk} (> 0), mutate has ${mutate.length} target(s), workflow runs Stryker un-silenced.`,
);
