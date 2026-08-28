#!/usr/bin/env node
/**
 * GATE-INTEGRITY-001 (meta-guard) — the checks that guard the architecture must
 * themselves never pass falsely. This scans every OTHER guard in scripts/ci/ for
 * the worst false-green pattern: a `catch` block that swallows its error and then
 * `process.exit(0)` (or `exit(0)`). Such a guard turns green forever the moment its
 * inputs move or an internal error fires — "verifying" nothing while reporting OK.
 * That exact defect lived in check-auth-engine-swallow.mjs (a SECURITY guard).
 *
 * A guard with a DELIBERATE, documented fail-open (e.g. a secret-gated skip on
 * public-PR runs) may opt out by putting `// ci-guard-integrity-ok: <reason>` on
 * or directly above the exit line — the reason is then on the record.
 *
 * This guard is itself a model of the standard it enforces: it prints the number
 * of scripts scanned, and it FAILS CLOSED — a missing dir or a zero-file scan
 * exits non-zero rather than passing vacuously.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "scripts/ci");
const SELF = "check-ci-guard-integrity.mjs";

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".mjs") && f !== SELF);
} catch (e) {
  console.error(`❌ GATE-INTEGRITY-001: cannot read ${DIR}: ${e.message} (failing closed)`);
  process.exit(2);
}

if (files.length === 0) {
  console.error(
    `❌ GATE-INTEGRITY-001: scanned 0 guard scripts under ${DIR} — path moved? Failing closed rather than passing vacuously.`
  );
  process.exit(2);
}

const offenders = [];

for (const f of files) {
  const src = readFileSync(join(DIR, f), "utf8");
  const lines = src.split(/\r?\n/);
  // Walk each `catch (...) {` and brace-match its body; flag exit(0) inside it.
  const re = /catch\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    const exitMatch = /(?:process\.)?exit\(\s*0\s*\)/.exec(body);
    if (!exitMatch) continue;
    // Opt-out: a documented, deliberate fail-open on the exit line or just above it.
    const exitAbsIdx = start + exitMatch.index;
    const lineNo = src.slice(0, exitAbsIdx).split("\n").length;
    const onLine = lines[lineNo - 1] ?? "";
    const aboveLine = lines[lineNo - 2] ?? "";
    if (/ci-guard-integrity-ok:/.test(onLine) || /ci-guard-integrity-ok:/.test(aboveLine)) continue;
    offenders.push(`${f}:${lineNo}`);
  }
}

if (offenders.length) {
  console.error(
    "❌ GATE-INTEGRITY-001: guard(s) exit(0) inside a catch — a swallowed error becomes a false green:"
  );
  for (const o of offenders) console.error("  - " + o);
  console.error(
    "\nFix: fail closed (exit non-zero) on error, or — if the fail-open is deliberate —" +
      " annotate the exit line with `// ci-guard-integrity-ok: <reason>`."
  );
  process.exit(1);
}

console.log(
  `✓ GATE-INTEGRITY-001: ${files.length} guard scripts scanned, none swallow an error into exit(0).`
);
