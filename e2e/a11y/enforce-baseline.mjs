#!/usr/bin/env node
/**
 * PR-gating enforcement for the WCAG 2.2 audit.
 *
 * Reads a11y-report/a11y-report.json produced by wcag-audit.e2e.ts and
 * compares total axe violations against e2e/a11y/baseline.json.
 * Fails (exit 1) when:
 *   - the report file is missing,
 *   - axe violations exceed the baseline,
 *   - the report scanned ZERO routes (silent-empty guard),
 *   - the report scanned fewer routes than SCANNABLE_ROUTE_COUNT minus
 *     `allowedSkippedRoutes` (catches the case where build/SPA died and
 *     every route silently errored), or
 *   - the checklist roll-up has any kind=axe/dom/static items in `fail`
 *     or `needs_review` (only kind=manual is allowed to remain pending).
 *
 * The weekly cron run skips this step.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Count scannable routes by parsing routes.ts without invoking the TS
// loader from a Node .mjs script. A "scannable" route is any entry that
// does NOT carry a `skipReason` field.
const ROUTES_SRC = readFileSync(resolve("e2e/a11y/routes.ts"), "utf8");
const totalRouteEntries = (ROUTES_SRC.match(/\bpath:\s*["'`]/g) ?? []).length;
const skipReasonEntries = (ROUTES_SRC.match(/\bskipReason\s*:/g) ?? []).length;
const SCANNABLE_ROUTE_COUNT = Math.max(0, totalRouteEntries - skipReasonEntries);

const REPORT = resolve("a11y-report/a11y-report.json");
const BASELINE = resolve("e2e/a11y/baseline.json");

function fail(msg) {
  console.error(`[a11y-gate] FAIL — ${msg}`);
  process.exit(1);
}

if (!existsSync(REPORT)) fail(`Missing report at ${REPORT} — did the audit step run?`);
if (!existsSync(BASELINE)) fail(`Missing baseline at ${BASELINE}.`);

const report = JSON.parse(readFileSync(REPORT, "utf8"));
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const max = Number(baseline.maxTotalViolations ?? 0);
const allowedSkipped = Number(baseline.allowedSkippedRoutes ?? 0);
const minScanned = Math.max(0, SCANNABLE_ROUTE_COUNT - allowedSkipped);

// Empty-scan guard. The previous gate accepted "0 violations across 0
// routes" as a green check — that masked an entire build outage.
const scanned = Number(report?.totals?.scanned ?? 0);
if (scanned === 0) {
  fail(
    "report.totals.scanned === 0. The Playwright job produced an empty scan " +
      "(likely a build/auth bootstrap failure). Check the workflow logs and " +
      "confirm VITE_SUPABASE_* repo variables and TF_ADMIN_* secrets are set.",
  );
}
if (scanned < minScanned) {
  fail(
    `Only ${scanned}/${SCANNABLE_ROUTE_COUNT} scannable routes were scanned ` +
      `(threshold: ${minScanned}). Audit coverage regressed.`,
  );
}

// Sum total axe violations.
let total = 0;
if (typeof report.totalViolations === "number") {
  total = report.totalViolations;
} else if (typeof report?.totals?.violationsTotal === "number") {
  total = report.totals.violationsTotal;
} else if (Array.isArray(report.routes)) {
  for (const r of report.routes) total += (r.violations?.length ?? 0);
}

console.log(`[a11y-gate] scanned=${scanned}/${SCANNABLE_ROUTE_COUNT}  axe-violations=${total}  (baseline: ${max})`);

if (total > max) {
  fail(
    `${total - max} new axe violation(s) over baseline. Fix them or raise ` +
      `the baseline in the same PR with reviewer sign-off + remediation note.`,
  );
}

// Checklist roll-up gate. Only kind=manual may remain `needs_review`.
const checklist = report?.checklist?.criteria ?? [];
const blocking = checklist.filter(
  (c) =>
    c.kind !== "manual" &&
    (c.status === "fail" || c.status === "needs_review"),
);
if (blocking.length > 0) {
  console.error("[a11y-gate] Blocking checklist items:");
  for (const c of blocking) {
    console.error(`  - ${c.sc} (${c.level}) ${c.title} → ${c.status}: ${c.summary}`);
  }
  fail(`${blocking.length} machine-checkable WCAG criteria are not passing.`);
}

console.log("[a11y-gate] OK");
