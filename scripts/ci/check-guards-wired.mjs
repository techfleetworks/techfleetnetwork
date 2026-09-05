#!/usr/bin/env node
/**
 * GUARDS-WIRED-001 — every guard must actually RUN in CI (no unwired guards).
 *
 * WHY THIS EXISTS
 * ---------------
 * A guard that is committed but referenced by no CI workflow verifies NOTHING — it is a
 * comment that looks like protection (exactly the check-no-opaque-script-error failure that
 * ADR-0024 removed and named as an un-mechanized gap). This meta-check closes that gap by
 * construction: every `scripts/ci/check-*.mjs` must be referenced by name in a
 * `.github/workflows/*.yml` job. Combined with `check-guard-has-test` (every guard has a test),
 * `verify-guard-test-discrimination` (that test is non-vacuous), and the guard living in the
 * required `gate`, this makes "a guard silently stops protecting" impossible: it cannot be
 * added untested, be vacuous, run nowhere, or (once wired into the blocking gate) be red and
 * still merge.
 *
 * A guard may legitimately be deferred (informational, or pending wiring) — record it in the
 * shrink-only allowlist `guards-wired-allowlist.json`, which may only shrink.
 *
 * Fail-closed: missing scripts/ci, missing workflows dir, or unreadable allowlist → exit 2.
 * This is a meta-check (it reads workflow YAML, not a scan over src) so it does not use the
 * _guard.mjs scan harness; it owns its own fail-closed + evidence.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./_json.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CI_DIR = join(ROOT, "scripts/ci");
const WF_DIR = join(ROOT, ".github/workflows");
const ALLOWLIST = join(CI_DIR, "guards-wired-allowlist.json");

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

// The guards: every scripts/ci/check-*.mjs (the scan/meta guards).
const guards = readdirSync(CI_DIR).filter((f) => /^check-.*\.mjs$/.test(f));
if (guards.length === 0)
  die(`no check-*.mjs guards found in scripts/ci (zero-scan). Failing closed.`);

// All workflow text, concatenated — a guard is "wired" if its filename appears anywhere in it.
const workflows = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
if (workflows.length === 0)
  die(`no workflow files in .github/workflows (zero-scan). Failing closed.`);
// Strip YAML comments first — a guard named only in a comment (or a commented-out step) does NOT
// count as wired; we assert the guard is REFERENCED IN A LIVE STEP, not merely mentioned.
const wfCode = workflows
  .map((f) => readFileSync(join(WF_DIR, f), "utf8"))
  .join("\n")
  .split("\n")
  .map((l) => l.replace(/#.*$/, ""))
  .join("\n");

// "Wired" = the guard's filename appears as a real TOKEN — preceded by a path sep / quote /
// whitespace and not a prefix of a longer name — so `check-auth.mjs` is not matched by
// `recheck-auth.mjs`, and a comment/substring can't count as a live reference.
const isWired = (g) =>
  new RegExp(`(?:^|[\\s/"'])${g.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?![\\w-])`, "m").test(
    wfCode
  );

const required = guards.filter((g) => !allow.has(g));
const unwired = required.filter((g) => !isWired(g));

if (unwired.length) {
  console.error(
    `✖ check-guards-wired: ${unwired.length} guard(s) are referenced by NO CI workflow — they run nowhere and verify nothing:`
  );
  for (const g of unwired) console.error(`  - ${g}`);
  console.error(
    `\nWire each into a workflow job (blocking, in the required 'gate', unless deliberately informational),\n` +
      `or — only for a deliberately-deferred guard — add it to ${ALLOWLIST} (shrink-only). See ADR-0024.`
  );
  process.exit(1);
}

// Report stale allowlist entries (now wired, or the guard is gone) so the ratchet can shrink.
const stale = [...allow].filter((g) => !guards.includes(g) || isWired(g));
console.log(
  `✓ check-guards-wired: OK — ${guards.length} guards, ${required.length} required all wired into ` +
    `${workflows.length} workflows, ${allow.size} on the shrink-only allowlist.`
);
if (stale.length) {
  console.log(
    `  note: ${stale.length} allowlist entry(ies) can be REMOVED (now wired / gone): ${stale.join(", ")}`
  );
}
process.exit(0);
