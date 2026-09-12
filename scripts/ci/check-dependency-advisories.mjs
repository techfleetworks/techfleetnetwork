#!/usr/bin/env node
/**
 * check-dependency-advisories.mjs — the BLOCKING dependency-advisory gate.
 *
 * Runs `npm audit --json` and FAILS (exit 1) on any advisory that is not
 * covered by an unexpired entry in security-advisories.waivers.json. This is the
 * mechanical half of the "no known-vulnerable dependency ships" rule; the waiver
 * file is the ONLY bypass (auditable, dated, expiring — same model as
 * arch-gate.waivers.json).
 *
 * Why a waiver file at all: some advisories have no upstream fix yet (e.g.
 * quill's HTML-export XSS). Without an expiring allow-list a hard gate either
 * blocks every PR forever or gets switched off — both worse than a dated waiver
 * that CI keeps honest and that fails loudly the day it lapses.
 *
 *   node scripts/ci/check-dependency-advisories.mjs            # fail on unwaived advisories
 *   node scripts/ci/check-dependency-advisories.mjs --report   # print, never fail (nightly)
 *
 * Zero dependencies. Node 18+.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT_ONLY = process.argv.includes("--report");
// The waivers path and audit source are overridable ONLY so the committed smoke
// test (src/test/smoke/check-dependency-advisories.smoke.test.ts) can drive the
// real guard against throwaway fixtures. Unset in CI/prod, so shipped behavior
// always reads the repo waivers file and runs the real `npm audit`.
const WAIVERS_PATH = path.resolve(
  ROOT,
  process.env.DEP_ADVISORIES_WAIVERS || "security-advisories.waivers.json"
);
const AUDIT_JSON_FIXTURE = process.env.DEP_ADVISORIES_AUDIT_JSON || "";

function readWaivers() {
  try {
    const raw = fs.readFileSync(WAIVERS_PATH, "utf8");
    const json = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    return Array.isArray(json.waivers) ? json.waivers : [];
  } catch {
    return [];
  }
}

function runAudit() {
  if (AUDIT_JSON_FIXTURE) {
    // Test-only: read a fixture audit report instead of shelling out.
    return fs.readFileSync(path.resolve(ROOT, AUDIT_JSON_FIXTURE), "utf8");
  }
  // npm audit exits non-zero when advisories exist; capture stdout regardless.
  try {
    return execSync("npm audit --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.stdout) return e.stdout;
    throw e;
  }
}

/** Flatten `npm audit --json` (v7+ shape) into one row per (package, GHSA). */
function extractAdvisories(auditJson) {
  const rows = [];
  const seen = new Set();
  const vulns = auditJson.vulnerabilities || {};
  for (const pkg of Object.keys(vulns)) {
    const via = Array.isArray(vulns[pkg].via) ? vulns[pkg].via : [];
    for (const v of via) {
      if (typeof v !== "object" || !v.url) continue; // string `via` = transitive pointer
      const ghsa = (v.url.match(/GHSA-[0-9a-z-]+/i) || [])[0] || v.source || v.url;
      const key = `${v.name || pkg}::${ghsa}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        package: v.name || pkg,
        ghsa,
        severity: v.severity || vulns[pkg].severity || "unknown",
        title: v.title || "",
      });
    }
  }
  return rows;
}

const now = new Date();
const waivers = readWaivers();
const waiverByGhsa = new Map(waivers.map((w) => [String(w.ghsa).toUpperCase(), w]));

// Expired waivers are themselves a failure — they must be renewed or removed.
const expired = waivers.filter((w) => w.expires && new Date(w.expires) < now);

// Fail CLOSED: if the audit output cannot be obtained or parsed, exit non-zero
// rather than treating "no advisories found" as a green (decisions.md §6).
let audit;
try {
  audit = JSON.parse(runAudit());
} catch (e) {
  console.error(
    `✖ check-dependency-advisories: cannot obtain/parse npm audit output: ${e.message}. Failing closed.`
  );
  process.exit(2);
}
const advisories = extractAdvisories(audit);
const packageCount = Object.keys(audit.vulnerabilities || {}).length;

const unwaived = [];
const waived = [];
for (const a of advisories) {
  const w = waiverByGhsa.get(String(a.ghsa).toUpperCase());
  if (w && (!w.expires || new Date(w.expires) >= now)) waived.push({ ...a, waiver: w });
  else unwaived.push(a);
}

const line = (a) => `  ${a.severity.padEnd(8)} ${a.package.padEnd(24)} ${a.ghsa}  ${a.title}`;

if (waived.length) {
  console.log(`\nWaived advisories (expiring allow-list):`);
  for (const a of waived)
    console.log(`${line(a)}\n           ↳ expires ${a.waiver.expires} — ${a.waiver.reason}`);
}

let fail = false;
if (unwaived.length) {
  console.error(`\n✖ ${unwaived.length} dependency advisory(ies) with no waiver:`);
  for (const a of unwaived) console.error(line(a));
  console.error(
    `\nFix: upgrade the dependency, or add an expiring entry to security-advisories.waivers.json\n` +
      `with a real mitigation + expiry (see the file's _comment).`
  );
  fail = true;
}
if (expired.length) {
  console.error(`\n✖ ${expired.length} EXPIRED waiver(s) — renew or remove:`);
  for (const w of expired) console.error(`  ${w.package} ${w.ghsa} — expired ${w.expires}`);
  fail = true;
}

if (!unwaived.length && !expired.length) {
  console.log(
    `\n✓ check-dependency-advisories: OK — ${advisories.length} advisory(ies) examined across ` +
      `${packageCount} vulnerable package path(s); ${waived.length} waived, 0 unwaived, 0 expired waivers.`
  );
}

if (fail && !REPORT_ONLY) process.exit(1);
