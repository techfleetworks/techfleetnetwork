#!/usr/bin/env node
// ci-lane: bespoke
/**
 * check-dependency-advisories.mjs — the BLOCKING dependency-advisory gate.
 *
 * Runs `npm audit --json` and FAILS on advisories not covered by an unexpired
 * entry in security-advisories.waivers.json. This is the mechanical half of the
 * "no known-vulnerable dependency ships" rule; the waiver file is the ONLY
 * blanket bypass (auditable, dated, expiring — same model as arch-gate.waivers.json).
 *
 * TWO MODES (ADR-0068) — so a steadily-growing npm-audit database cannot block
 * every unrelated PR as new advisories are published against UNCHANGED deps:
 *
 *  - FULL  (push to main/master, schedule, local, or `--full`): fail on ANY
 *    unwaived advisory AND any expired waiver. This keeps the main-branch
 *    baseline honest and is where drift is burned down.
 *  - DELTA (pull_request — GITHUB_BASE_REF is set): fail ONLY on advisories this
 *    PR INTRODUCES relative to the base branch, identified by (package, GHSA) so
 *    a NEW vulnerable package/path counts as introduced even for a known GHSA.
 *    Advisories already present on the base are reported, not blocking — they
 *    belong to the base branch (caught by its FULL run), not to every
 *    contributor. Coverage is NOT reduced: the whole tree is still audited and
 *    newly-introduced vulnerabilities still block.
 *
 *   node scripts/ci/check-dependency-advisories.mjs          # auto: delta on PRs, full otherwise
 *   node scripts/ci/check-dependency-advisories.mjs --full   # force the full gate
 *   node scripts/ci/check-dependency-advisories.mjs --report # print, never fail (nightly)
 *
 * Zero dependencies. Node 18+.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, execFileSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT_ONLY = process.argv.includes("--report");
const FORCE_FULL = process.argv.includes("--full");

// Delta mode runs on pull requests, where GITHUB_BASE_REF names the base branch.
// DEP_ADVISORIES_BASE_REF overrides it (used by the committed smoke test).
const BASE_REF = process.env.DEP_ADVISORIES_BASE_REF || process.env.GITHUB_BASE_REF || "";

// The waivers path and audit sources are overridable ONLY so the committed smoke
// test (src/test/smoke/check-dependency-advisories.smoke.test.ts) can drive the
// real guard against throwaway fixtures. Unset in CI/prod, so shipped behavior
// always reads the repo waivers file and runs the real `npm audit`.
const WAIVERS_PATH = path.resolve(
  ROOT,
  process.env.DEP_ADVISORIES_WAIVERS || "security-advisories.waivers.json"
);
const AUDIT_JSON_FIXTURE = process.env.DEP_ADVISORIES_AUDIT_JSON || "";
const BASE_AUDIT_JSON_FIXTURE = process.env.DEP_ADVISORIES_BASE_AUDIT_JSON || "";

// Identity of an advisory for delta comparison: (package, GHSA). Keying on the
// package — not the GHSA alone — means a PR that adds a NEW vulnerable package
// for an already-known GHSA is correctly treated as introduced, not pre-existing.
const advKey = (a) => `${a.package}::${String(a.ghsa).toUpperCase()}`;

function readWaivers() {
  try {
    const raw = fs.readFileSync(WAIVERS_PATH, "utf8");
    const json = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    return Array.isArray(json.waivers) ? json.waivers : [];
  } catch {
    return [];
  }
}

function auditHead() {
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

/**
 * The set of (package, GHSA) keys already present on the base branch (delta
 * mode). `npm audit` reads the lockfile, so we audit the base's package.json +
 * package-lock.json in a temp dir — no install needed. We fetch the base tip
 * shallowly and read its manifests from FETCH_HEAD (robust to a shallow CI
 * checkout that never created a remote-tracking ref). Git is invoked argv-form
 * (execFileSync, NO shell) so a hostile base-ref name cannot inject a command —
 * this is the security gate itself. Throws if the base cannot be resolved; the
 * caller then fails CLOSED to the full gate rather than letting a PR through.
 */
function baseKeySet() {
  let raw;
  if (BASE_AUDIT_JSON_FIXTURE) {
    raw = fs.readFileSync(path.resolve(ROOT, BASE_AUDIT_JSON_FIXTURE), "utf8");
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dep-adv-base-"));
    try {
      // `--end-of-options` so a base-ref that happens to start with "-" is treated
      // as a ref, never a git option (argv form already rules out shell injection).
      execFileSync(
        "git",
        ["fetch", "--quiet", "--depth=1", "origin", "--end-of-options", BASE_REF],
        {
          stdio: "ignore",
        }
      );
      for (const f of ["package.json", "package-lock.json"]) {
        fs.writeFileSync(
          path.join(tmp, f),
          execFileSync("git", ["show", `FETCH_HEAD:${f}`], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
          })
        );
      }
      try {
        raw = execSync("npm audit --json", {
          cwd: tmp,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (e) {
        if (!e.stdout) throw e; // a real failure (no audit JSON at all)
        raw = e.stdout; // non-zero exit just means advisories exist
      }
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
  return new Set(extractAdvisories(JSON.parse(raw)).map(advKey));
}

const now = new Date();
const waivers = readWaivers();
const waiverByGhsa = new Map(waivers.map((w) => [String(w.ghsa).toUpperCase(), w]));

// Expired waivers are a maintenance failure — they must be renewed or removed.
const expired = waivers.filter((w) => w.expires && new Date(w.expires) < now);

// Fail CLOSED: if the audit output cannot be obtained or parsed, exit non-zero
// rather than treating "no advisories found" as a green (decisions.md §6).
let audit;
try {
  audit = JSON.parse(auditHead());
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

// Delta mode (pull requests): split unwaived advisories into those this PR
// INTRODUCES vs those already PRE-EXISTING on the base branch. Only introduced
// ones block. If the base cannot be resolved, fall back to the full gate
// (fail-closed) so a PR is never silently let through.
let delta = Boolean(BASE_REF) && !FORCE_FULL;
let baseSet = null;
if (delta) {
  try {
    baseSet = baseKeySet();
  } catch (e) {
    console.error(
      `⚠ check-dependency-advisories: delta mode could not resolve base '${BASE_REF}' (${e.message}); ` +
        `falling back to the FULL gate (fail-closed).`
    );
    delta = false;
  }
}

const introduced = [];
const preexisting = [];
for (const a of unwaived) {
  if (delta && baseSet.has(advKey(a))) preexisting.push(a);
  else introduced.push(a);
}

const line = (a) => `  ${a.severity.padEnd(8)} ${a.package.padEnd(24)} ${a.ghsa}  ${a.title}`;

if (waived.length) {
  console.log(`\nWaived advisories (expiring allow-list):`);
  for (const a of waived)
    console.log(`${line(a)}\n           ↳ expires ${a.waiver.expires} — ${a.waiver.reason}`);
}

if (delta && preexisting.length) {
  console.log(
    `\nPre-existing advisories on '${BASE_REF}' — NOT introduced by this PR, so not blocking it ` +
      `(the base branch's push/scheduled run owns these):`
  );
  for (const a of preexisting) console.log(line(a));
}

let fail = false;
if (introduced.length) {
  console.error(
    delta
      ? `\n✖ ${introduced.length} dependency advisory(ies) INTRODUCED by this PR (not on '${BASE_REF}', no waiver):`
      : `\n✖ ${introduced.length} dependency advisory(ies) with no waiver:`
  );
  for (const a of introduced) console.error(line(a));
  console.error(
    `\nFix: upgrade the dependency, or add an expiring entry to security-advisories.waivers.json\n` +
      `with a real mitigation + expiry (see the file's _comment).`
  );
  fail = true;
}

// Expired waivers block the FULL gate (base/main hygiene). On a PR (delta) they
// are reported but do not block it — a stale baseline waiver is not this PR's
// fault; the push/scheduled full run is where it fails.
if (expired.length) {
  if (delta) {
    console.log(
      `\n⚠ ${expired.length} expired waiver(s) on the baseline (reported; the push/scheduled run blocks on these, not this PR):`
    );
    for (const w of expired) console.log(`  ${w.package} ${w.ghsa} — expired ${w.expires}`);
  } else {
    console.error(`\n✖ ${expired.length} EXPIRED waiver(s) — renew or remove:`);
    for (const w of expired) console.error(`  ${w.package} ${w.ghsa} — expired ${w.expires}`);
    fail = true;
  }
}

if (!fail && !introduced.length) {
  const mode = delta ? `delta vs '${BASE_REF}'` : "full";
  const extra =
    delta && preexisting.length ? `, ${preexisting.length} pre-existing (reported)` : "";
  console.log(
    `\n✓ check-dependency-advisories: OK (${mode}) — ${advisories.length} advisory(ies) examined across ` +
      `${packageCount} vulnerable package path(s); ${waived.length} waived, 0 introduced${extra}.`
  );
}

if (fail && !REPORT_ONLY) process.exit(1);
