#!/usr/bin/env node
// The project's type-check gate — the ONE command CI and `npm run typecheck` invoke.
//
// Why this script exists instead of a bare `tsc --noEmit`:
//   The root tsconfig.json is a SOLUTION file — `"files": []` + `references` to the real
//   projects (app / node / test). A bare `tsc --noEmit` ignores project references entirely,
//   so it type-checks ZERO files and ALWAYS exits 0. For ~the whole life of this repo the CI
//   "Type-check" step ran exactly that and was a silent no-op: real type errors shipped on a
//   green main (ADR-0068). `tsc -b` (build mode) DOES follow references, but it is INCREMENTAL
//   — it caches results in .tsbuildinfo and on a warm/again run reports "up to date" and exits
//   0 WITHOUT re-reporting errors, which on a slow/OneDrive filesystem produced inconsistent
//   red/green across back-to-back runs. A gate must be deterministic and fail closed
//   (decisions.md §6), so we run a STATELESS `tsc --noEmit -p <project>` for each real project.
//
// This runner:
//   - checks every project (does not stop at the first) so one run surfaces ALL errors;
//   - FAILS CLOSED: any tsc error, any tsc that cannot even start, or a project resolving ZERO
//     input files (the exact vacuity this gate exists to kill) exits non-zero;
//   - prints an evidence line per project (name + files type-checked) so a green run proves
//     what it inspected rather than asserting a bare "ok".
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSC = resolve(REPO, "node_modules", "typescript", "bin", "tsc");

// Every real TS project. A project added here is checked; the browser app, the node/build
// configs, and the test/support scope are all covered. Keep in sync with tsconfig.json's
// references (asserted by src/test/smoke/typecheck-gate.smoke.test.ts).
const PROJECTS = ["tsconfig.app.json", "tsconfig.node.json", "tsconfig.test.json"];

// A project must resolve at least this many input files, or we treat it as vacuous and fail
// closed — a config change that empties an include (the `files: []` trap) can never pass green.
const MIN_FILES_PER_PROJECT = 1;

if (!existsSync(TSC)) {
  console.error(`typecheck: cannot find tsc at ${TSC} — is the dependency installed?`);
  process.exit(2);
}

function run(args) {
  const res = spawnSync(process.execPath, [TSC, ...args], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    console.error(`typecheck: failed to launch tsc (${res.error.message})`);
    process.exit(2);
  }
  return res;
}

let failed = false;
for (const project of PROJECTS) {
  const projectPath = resolve(REPO, project);
  if (!existsSync(projectPath)) {
    console.error(`typecheck: ${project} is missing — failing closed.`);
    failed = true;
    continue;
  }

  // Non-vacuity probe (fast — lists the program's files without type-checking). If a project
  // resolves 0 files its type-check would pass trivially; that is the no-op we are killing.
  const listed = run(["-p", project, "--listFilesOnly"]);
  const files = (listed.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.includes("node_modules") && !l.endsWith(".d.ts"));
  if (listed.status !== 0 || files.length < MIN_FILES_PER_PROJECT) {
    console.error(
      `typecheck: ${project} resolved ${files.length} input file(s) (tsc exit ${listed.status}) — vacuous or broken. Failing closed.`
    );
    failed = true;
    continue;
  }

  // The real, stateless type-check.
  const checked = run(["--noEmit", "-p", project]);
  if (checked.stdout) process.stdout.write(checked.stdout);
  if (checked.stderr) process.stderr.write(checked.stderr);
  if (checked.status !== 0) {
    console.error(`typecheck: ✗ ${project} — type errors (tsc exit ${checked.status}).`);
    failed = true;
    continue;
  }
  console.log(`typecheck: ✓ ${project} — ${files.length} files type-checked, 0 errors.`);
}

if (failed) {
  console.error("typecheck: FAILED — see errors above.");
  process.exit(1);
}
console.log(`typecheck: OK — all ${PROJECTS.length} projects type-checked clean.`);
