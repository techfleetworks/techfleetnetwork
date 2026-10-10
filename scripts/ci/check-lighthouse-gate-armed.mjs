#!/usr/bin/env node
// ci-lane: critical
/**
 * LH-GATE-001 — the Lighthouse quality gate must stay ARMED (no `|| true`, no continue-on-error).
 *
 * WHY THIS EXISTS
 * ---------------
 * `.github/workflows/lighthouse.yml` runs `lhci collect` + `lhci assert` to enforce the
 * accessibility budget (accessibility=error:0.9). Both commands had a trailing `|| true`, which
 * swallows ANY failure — the step exited 0 even when the a11y assertion failed, so the gate could
 * never go red. That is a false green: a real accessibility regression ships green through a
 * "required" quality gate (enterprise-readiness audit 2026-10, finding H1; decisions.md §6 forbids
 * a gate that passes vacuously).
 *
 * This guard makes the vacuity impossible to reintroduce: it fails CI if the Lighthouse workflow's
 * lhci commands are neutered by `|| true` / `|| :` or by `continue-on-error: true`. Prevention is by
 * construction (the gate can't be silenced); this guard is the fail-closed backstop that proves it.
 *
 * Reads ONE known workflow file (not a directory walk), so it does not use the _guard.mjs harness
 * and needs no bespoke-dir-reader marker. Fails CLOSED (exit 2) if the file is missing or does not
 * look like the lhci workflow (zero-scan). Pinned by
 * src/test/smoke/check-lighthouse-gate-armed.smoke.test.ts.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".github",
  "workflows",
  "lighthouse.yml"
);
const FILE = process.env.LIGHTHOUSE_GATE_FILE
  ? resolve(process.env.LIGHTHOUSE_GATE_FILE)
  : DEFAULT;

const die = (msg) => {
  console.error(`✖ check-lighthouse-gate-armed: ${msg}`);
  process.exit(2);
};

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch (e) {
  die(`cannot read ${FILE}: ${e.message}. Failing closed.`);
}

// Zero-scan guard: the file must actually be the lhci workflow, or we are checking nothing.
if (!/\blhci\b/.test(src)) {
  die(`${FILE} does not reference \`lhci\` — wrong file, or the gate was removed. Failing closed.`);
}

const lines = src.split("\n");
const violations = [];
lines.forEach((line, i) => {
  // Only care about the lines that run lhci or carry a step-level opt-out near it.
  if (/\|\|\s*(true|:)\b/.test(line)) {
    violations.push({ n: i + 1, line: line.trim(), why: "`|| true` swallows the gate's failure" });
  }
  if (/continue-on-error:\s*true/i.test(line)) {
    violations.push({
      n: i + 1,
      line: line.trim(),
      why: "`continue-on-error: true` makes the step non-blocking",
    });
  }
});

if (violations.length) {
  console.error(
    `✖ check-lighthouse-gate-armed: the Lighthouse gate is NEUTERED (${violations.length} issue(s)) — ` +
      `a failing accessibility/budget assertion would pass green:`
  );
  for (const v of violations) console.error(`  ${FILE}:${v.n}  ${v.why}\n      > ${v.line}`);
  console.error(
    `\nRemove the \`|| true\`/\`continue-on-error: true\` so \`lhci assert\` can fail the build. ` +
      `See decisions.md §6 (a gate must fail closed, never pass falsely) and the 2026-10 audit H1.`
  );
  process.exit(1);
}

console.log(
  `✓ check-lighthouse-gate-armed: OK — ${FILE} runs lhci with no \`|| true\`/\`continue-on-error\`; ` +
    `the accessibility gate can fail closed (${lines.length} lines scanned).`
);
