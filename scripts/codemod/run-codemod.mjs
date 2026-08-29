/**
 * CODEMOD HARNESS (Phase 0c) — the reusable runner for the Category-② mechanical
 * migrations (see docs/architecture/audit-2026-08/hardening-plan.md §"Phase 0 · 0c").
 *
 * A codemod lives in scripts/codemod/codemods/<name>.mjs and exports:
 *     export const name = "<name>";
 *     export function apply(sourceFile) { return { changed: boolean, manual: [{line, reason}] }; }
 * The harness owns file selection, exclusions, dry-run/write/check semantics, and
 * reporting; the codemod owns the AST transform for ONE file. Codemods never write
 * to disk and never decide which files to touch — that is centralised here so the
 * FROZEN auth layer (src/features/auth/**) can never be edited by any codemod.
 *
 * Usage:
 *   node scripts/codemod/run-codemod.mjs <codemod-name> [--write] [--check] [globs...]
 *
 * Modes (mutually exclusive):
 *   (default)  dry-run  — report what WOULD change, write nothing, exit 0.
 *   --write             — apply changes to disk. Idempotent (2nd run → 0 changes).
 *   --check             — write nothing; exit 1 if ANYTHING would change, else 0.
 *                         (CI idempotency check AFTER a migration is applied — it is
 *                          NOT the "no raw invokes remain" lint; that is a lint rule.)
 *
 * Fail-closed: unknown codemod, missing tsconfig, or a codemod throwing on any file
 * → exit 2 with a clear message. A per-file transform error is caught, reported as
 * "ERROR <file>: <msg>", and fails the whole run — never silently skipped.
 *
 * Exit codes: 0 = ok · 1 = --check found pending changes · 2 = fail-closed error.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Project, QuoteKind } from "ts-morph";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CODEMODS_DIR = join(ROOT, "scripts/codemod/codemods");
const DEFAULT_GLOBS = ["src/**/*.ts", "src/**/*.tsx"];

/**
 * ts-morph Project options SHARED by the harness and the codemod unit tests, so the test
 * environment can never drift from the harness environment. (A divergence here once let a
 * language-service-dependent transform pass tests while misbehaving in the harness — the
 * fix is: one source of truth for the project config + config-independent transforms.)
 * Tests spread these into an in-memory project; the harness adds `tsConfigFilePath`.
 * NOTE: these are parse/manipulation settings only. A future codemod that depends on
 * parse-affecting compilerOptions (target/jsx/decorators) must share those too — the harness
 * inherits them from tsconfig, the in-memory test project would not.
 */
export const PROJECT_OPTIONS = {
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  manipulationSettings: { quoteKind: QuoteKind.Double },
};

/**
 * Central, hard-coded exclusions. The auth entry is CRITICAL: src/features/auth/** is
 * the frozen layer owned by Phase 2-AUTH; the toolkit must never touch it. Tests and
 * the test tree are excluded so codemods only migrate production code.
 */
export const HARD_EXCLUDES = ["**/*.test.*", "**/*.spec.*", "src/test/**", "src/features/auth/**"];

const fail = (msg) => {
  console.error(`\u2716 run-codemod: ${msg}`);
  process.exit(2);
};

export function globToRegExp(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials (leave * and ?)
    .replace(/\*\*/g, "\u0000") // ** placeholder
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp("^" + re + "$");
}

/** Build an exclusion predicate from a list of globs (central + per-codemod). Exported for tests. */
export function makeIsExcluded(excludeGlobs) {
  const res = excludeGlobs.map(globToRegExp);
  return (rel) => res.some((re) => re.test(rel));
}

function toPosixRel(absPath) {
  return relative(ROOT, absPath).split("\\").join("/");
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const codemodName = positional[0];
  const globArgs = positional.slice(1);

  if (!codemodName)
    fail("missing <codemod-name>. Usage: run-codemod.mjs <name> [--write] [--check] [globs...]");
  if (flags.has("--write") && flags.has("--check"))
    fail("--write and --check are mutually exclusive.");
  const mode = flags.has("--write") ? "write" : flags.has("--check") ? "check" : "dry-run";

  // --- Load the codemod module (fail closed on unknown name) --------------------------
  const modPath = join(CODEMODS_DIR, `${codemodName}.mjs`);
  if (!existsSync(modPath))
    fail(
      `unknown codemod "${codemodName}" — no file at scripts/codemod/codemods/${codemodName}.mjs`
    );

  return import(pathToFileURL(modPath).href).then((codemod) => {
    if (typeof codemod.apply !== "function")
      fail(`codemod "${codemodName}" does not export an apply(sourceFile) function.`);
    if (codemod.name && codemod.name !== codemodName)
      fail(`codemod name mismatch: file "${codemodName}" exports name "${codemod.name}".`);

    // --- Build the ts-morph project ----------------------------------------------------
    const tsConfigFilePath = join(ROOT, "tsconfig.json");
    if (!existsSync(tsConfigFilePath))
      fail(`missing tsconfig.json at ${tsConfigFilePath}. Failing closed.`);

    const project = new Project({ tsConfigFilePath, ...PROJECT_OPTIONS });
    // fast-glob (ts-morph) requires POSIX separators even on Windows.
    const globs = (globArgs.length ? globArgs : DEFAULT_GLOBS).map((g) =>
      resolve(ROOT, g).split("\\").join("/")
    );
    project.addSourceFilesAtPaths(globs);

    // --- Assemble exclusion matchers (central + per-codemod) ---------------------------
    const isExcluded = makeIsExcluded([
      ...HARD_EXCLUDES,
      ...(Array.isArray(codemod.exclude) ? codemod.exclude : []),
    ]);

    const matched = project.getSourceFiles();
    // Fail closed on a zero-scan (decisions.md §6): an empty glob match means the
    // tsconfig/ROOT/globs drifted (e.g. src/ moved), NOT a clean codebase — never let
    // --check pass vacuously.
    if (matched.length === 0)
      fail(
        `scanned 0 files for globs [${globs.join(", ")}] — glob/tsconfig drift? Failing closed.`
      );

    const sourceFiles = matched.filter((sf) => !isExcluded(toPosixRel(sf.getFilePath())));
    if (sourceFiles.length === 0)
      fail(
        `0 files left after exclusions (matched ${matched.length}) — nothing to scan. Failing closed.`
      );

    // --- Apply the codemod to each file ------------------------------------------------
    let changedCount = 0;
    let manualCount = 0;
    let errorCount = 0;
    let unchangedCount = 0;
    const lines = [];

    for (const sf of sourceFiles) {
      const rel = toPosixRel(sf.getFilePath());
      let result;
      try {
        result = codemod.apply(sf);
      } catch (err) {
        errorCount++;
        lines.push(`ERROR ${rel}: ${err && err.message ? err.message : String(err)}`);
        continue;
      }
      const manual = Array.isArray(result?.manual) ? result.manual : [];
      if (result?.changed) {
        changedCount++;
        lines.push(`CHANGED ${rel}`);
      } else if (manual.length === 0) {
        unchangedCount++;
      }
      for (const m of manual) {
        manualCount++;
        lines.push(`MANUAL-REVIEW ${rel}:${m.line} ${m.reason}`);
      }
    }

    // --- Persist (write mode only). Dry-run/check never touch disk. ---------------------
    if (mode === "write" && errorCount === 0) project.saveSync();

    // --- Report ------------------------------------------------------------------------
    for (const l of lines) console.log(l);
    const modeLabel = mode === "write" ? "written" : mode === "check" ? "check" : "dry-run";
    console.log(
      `\n${codemodName}: ${sourceFiles.length} scanned, ${changedCount} changed, ` +
        `${manualCount} need manual review, ${errorCount} errors (${unchangedCount} unchanged) [${modeLabel}]`
    );
    if (mode === "write" && manualCount > 0)
      console.log(
        "note: MANUAL-REVIEW line numbers are pre-transform (they refer to the original file)."
      );

    if (errorCount > 0) {
      console.error(
        `\u2716 run-codemod: ${errorCount} file(s) errored — failing closed (no partial write).`
      );
      process.exit(2);
    }
    if (mode === "check" && changedCount > 0) {
      console.error(
        `\u2716 run-codemod --check: ${changedCount} file(s) would change — run the codemod with --write and commit.`
      );
      process.exit(1);
    }
    console.log(`\u2713 run-codemod: ${codemodName} ${modeLabel} OK.`);
    process.exit(0);
  });
}

// Run only when executed directly, so tests can import the exclusion helpers above.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
}
