#!/usr/bin/env node
/**
 * PR-gating enforcement for the WCAG 2.2 audit.
 *
 * Reads a11y-report/a11y-report.json produced by wcag-audit.e2e.ts and
 * compares total axe violations against e2e/a11y/baseline.json.
 * Fails (exit 1) when total exceeds the baseline so PRs can't introduce
 * regressions silently. The weekly cron run skips this step.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPORT = resolve("a11y-report/a11y-report.json");
const BASELINE = resolve("e2e/a11y/baseline.json");

if (!existsSync(REPORT)) {
  console.error(`[a11y-gate] Missing report at ${REPORT} — did the audit step run?`);
  process.exit(1);
}
if (!existsSync(BASELINE)) {
  console.error(`[a11y-gate] Missing baseline at ${BASELINE}.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, "utf8"));
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const max = Number(baseline.maxTotalViolations ?? 0);

// The spec emits either { totalViolations } or { routes: [{ violations: [...] }] }.
let total = 0;
if (typeof report.totalViolations === "number") {
  total = report.totalViolations;
} else if (Array.isArray(report.routes)) {
  for (const r of report.routes) total += (r.violations?.length ?? 0);
}

console.log(`[a11y-gate] total axe violations: ${total}  (baseline: ${max})`);
if (total > max) {
  console.error(`[a11y-gate] FAIL — ${total - max} new violation(s) over baseline. Fix them or raise the baseline with reviewer approval.`);
  process.exit(1);
}
console.log("[a11y-gate] OK");
