#!/usr/bin/env node
// ci-lane: critical
/**
 * ALERT-COVERAGE-001 — the main-failure alert must cover every production-critical workflow and must
 * never be able to go dark.
 *
 * WHY THIS EXISTS
 * ---------------
 * A failure of a production-critical workflow on `main` is a USER-FACING SYMPTOM (prod may be stale or
 * broken). The 2026-10-30 re-audit (RH4 / SRE-1..3 / REL-1) found the alert could go dark: it watched
 * only a subset of the critical workflows, and when `DISCORD_ALERT_WEBHOOK` was unset it degraded to a
 * red annotation on a run nobody watches — effectively silent. The fix (ADR 20261110-alerting-cannot-go-dark)
 * widened the watch list and added a secret-free GitHub-issue fallback. This guard keeps those two
 * properties from silently regressing:
 *   1. COVERAGE — every workflow in the critical set is in the alert's `workflow_run.workflows` list.
 *   2. NO DANGLING — every watched name resolves to a real workflow `name:` in .github/workflows
 *      (a typo'd entry silently never fires — the exact dark-alert failure mode).
 *   3. FALLBACK — the alert declares `issues: write` and opens a GitHub issue (`gh issue create`), so a
 *      missing/broken Discord webhook cannot silence it.
 *
 * The critical set lives here (policy) and in the alert workflow (mechanism); this guard binds them.
 * Add a new production-critical workflow -> add it to BOTH DEFAULT_CRITICAL and the alert's list.
 *
 * ci-guard-integrity: bespoke-dir-reader — reads .github/workflows/*.yml (the alert file + each
 * workflow's `name:`), a targeted file set, not a recursive src content scan, so it does not use
 * _guard.mjs. Fails CLOSED (exit 2) on a missing dir / missing alert file / zero workflows.
 * Pinned by src/test/smoke/check-alert-coverage.smoke.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = process.env.ALERT_WORKFLOWS_DIR
  ? resolve(process.env.ALERT_WORKFLOWS_DIR)
  : resolve(HERE, "..", "..", ".github", "workflows");
const ALERT_FILE = "main-failure-alert.yml";

// The production-critical workflows whose failure on main means prod may be stale or broken. Override
// via ALERT_CRITICAL (comma-separated) for tests. Names must match each workflow's `name:` field.
const DEFAULT_CRITICAL = [
  "CI",
  "Deploy edge functions",
  "Deploy frontend (Cloudflare)",
  "Deploy migrations",
  "Config preflight",
  "Verify deploy",
];
const CRITICAL = (process.env.ALERT_CRITICAL
  ? process.env.ALERT_CRITICAL.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_CRITICAL);

const die = (msg) => {
  console.error(`✖ check-alert-coverage: ${msg}`);
  process.exit(2);
};

let files;
try {
  files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));
} catch (e) {
  die(`cannot read workflows dir ${WORKFLOWS_DIR}: ${e.message}. Failing closed.`);
}
if (files.length === 0) die(`no workflow files under ${WORKFLOWS_DIR} — wrong dir? Failing closed.`);

let alertSrc;
try {
  alertSrc = readFileSync(resolve(WORKFLOWS_DIR, ALERT_FILE), "utf8");
} catch (e) {
  die(`cannot read the alert workflow ${ALERT_FILE}: ${e.message}. Failing closed.`);
}

// Map every workflow's declared `name:` -> filename, so we can resolve the watched names.
const nameToFile = new Map();
for (const f of files) {
  let src;
  try { src = readFileSync(resolve(WORKFLOWS_DIR, f), "utf8"); } catch { continue; }
  const m = src.match(/^name:[ \t]*(.+?)[ \t]*$/m);
  if (m) nameToFile.set(stripQuotes(m[1]), f);
}

/** Extract the items of the first `workflows:` list (the workflow_run watch list) in the alert file. */
function watchedWorkflows(src) {
  const lines = src.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*workflows:\s*$/.test(l));
  if (idx === -1) return null; // no block list form
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) continue; // tolerate blank lines inside the list
    const m = line.match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break; // first non-list line ends the block
    out.push(stripQuotes(m[1]));
  }
  return out;
}
function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "").trim();
}

const watched = watchedWorkflows(alertSrc);
const violations = [];

if (!watched || watched.length === 0) {
  violations.push(`the alert workflow has no \`workflow_run.workflows:\` block-list to watch.`);
} else {
  // 1. COVERAGE — every critical workflow is watched.
  for (const c of CRITICAL) {
    if (!watched.includes(c)) violations.push(`critical workflow is NOT watched by the alert: "${c}".`);
  }
  // 2. NO DANGLING — every watched name resolves to a real workflow (unless tests override the dir).
  for (const w of watched) {
    if (!nameToFile.has(w)) {
      violations.push(`watched workflow "${w}" matches no workflow \`name:\` in ${WORKFLOWS_DIR} — a typo'd entry never fires (dark alert).`);
    }
  }
}

// 3. FALLBACK — the alert can reach a human with no secret.
if (!/^\s*issues:\s*write\b/m.test(alertSrc)) {
  violations.push(`the alert workflow is missing \`issues: write\` permission — the GitHub-issue fallback cannot open an issue.`);
}
// Match `gh issue create` only in LIVE script, not in a comment — a string left behind in a comment
// while the real call is deleted must NOT keep this guard green (verifiable-quality-gates).
const hasLiveFallback = alertSrc.split(/\r?\n/).some((line) => {
  const code = line.split("#")[0]; // drop any trailing/leading YAML or shell comment on the line
  return /gh\s+issue\s+create\b/.test(code);
});
if (!hasLiveFallback) {
  violations.push(`the alert workflow has no live \`gh issue create\` fallback (a commented-out one does not count) — a missing/broken Discord webhook would make it go dark.`);
}

// 4. CONCLUSIONS — the alert must fire on a hung run, not just an outright failure. A watched workflow
// that times out reports conclusion 'timed_out' (a hang in Deploy/Verify is exactly "prod stale/broken");
// if the job gate narrows back to failure-only, a timeout goes dark. Require 'timed_out' in the alert.
if (!/\btimed_out\b/.test(alertSrc)) {
  violations.push(`the alert does not fire on \`timed_out\` — a watched run that hangs/times out would go dark. Include timed_out (and startup_failure) in the job's \`if:\` conclusion set.`);
}

if (violations.length) {
  console.error(`✖ check-alert-coverage: ${violations.length} alert-coverage problem(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    `\nThe main-failure alert must watch every production-critical workflow and must never go dark ` +
      `(ADR 20261110-alerting-cannot-go-dark). Fix .github/workflows/${ALERT_FILE} (and keep DEFAULT_CRITICAL ` +
      `in this guard in lockstep with the critical set).`
  );
  process.exit(1);
}

console.log(
  `✓ check-alert-coverage: OK — ${CRITICAL.length} critical workflows watched, ` +
    `${watched.length} watch entries all resolve, fires on failure+timed_out, live GitHub-issue fallback present.`
);
