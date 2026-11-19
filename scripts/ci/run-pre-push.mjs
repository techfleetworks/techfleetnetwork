/**
 * Node.js pre-push runner.
 *
 * Called by .githooks/pre-push via `exec node scripts/ci/run-pre-push.mjs`.
 * Runs as a native Windows process (no Cygwin fork), so it works even when the
 * MSYS2 DLL fork table is exhausted (STATUS_DLL_INIT_FAILED / 0xC0000142) — the
 * same reason the pre-commit hook is fork-free (see run-pre-commit.mjs).
 *
 * WHY THIS EXISTS: the locally-runnable CI gates were being verified piecemeal
 * (a bare `tsc` instead of the full `npm run typecheck` over app+node+test
 * tsconfigs), so a push went out green locally and came back red in CI on a
 * gate that was never run here. This hook runs the EXACT commands CI's
 * gate-verify / gate-test / arch-gate jobs run, before the push leaves the
 * machine, so that class of round-trip cannot recur.
 *
 * Steps (mirror .github/workflows/ci.yml), highest-value / least-flaky first:
 *   1. npm run typecheck              (gate-verify — tsc over app/node/test configs)
 *   2. npm run check:architecture     (arch-gate — mechanical gate, changed files)
 *   3. eslint <changed tracked files> (gate-verify — scoped, see below)
 *   4. stylelint <changed tracked .css> (gate-verify — scoped)
 *   5. vitest run --changed <base>    (gate-test — ONLY tests the branch touches)
 *
 * WHY SCOPED, NOT WHOLE-REPO: two whole-repo commands reintroduce the very
 * flakiness this hook exists to prevent, so both are scoped to the branch:
 *
 *  - TESTS: CI runs vitest sharded across 4 runners, so each slow
 *    subprocess-spawning test (e.g. the tsc-spawning typecheck-gate smoke test,
 *    ~28s) has headroom. Running all ~3000 tests in ONE local process starves
 *    them — they blow the 15s per-test cap and TIME OUT even though they pass in
 *    isolation and in CI. So vitest is scoped to the changed files, with a raised
 *    per-test timeout; AND when a GLOBAL dependency changed (package.json, a
 *    lockfile, a vite/vitest/ts config, .gitattributes) — which makes --changed
 *    invalidate the whole graph and run everything — the local run is SKIPPED and
 *    left to CI's shard, so a global-file change can never trigger that flake here.
 *  - LINT: `eslint .` on a dev box also lints UNTRACKED local scratch files
 *    (ad-hoc _*.mjs, supabase/.temp, …) that CI's clean checkout never sees, so
 *    it reports hundreds of errors CI does not have and would block every push.
 *    So eslint/stylelint are pointed at the branch's CHANGED, TRACKED files only
 *    — the exact surface CI would newly flag. This also covers commits made with
 *    `git commit --no-verify`, which skip the pre-commit lint-staged pass.
 *
 * The deterministic gates (typecheck, arch) run in full — they never flake and
 * cannot be scoped meaningfully (tsc needs the whole project).
 *
 * HONEST SCOPE: this runs the gates that need only Node + the repo. It does NOT
 * run deno-check (needs Deno), db-test (pgTAP + a Supabase instance), bdd,
 * migration-smoke, or lhci (needs a browser); lint/tests cover the CHANGED-file
 * slice only. The full lint, full suite, coverage floor, and mutation gate still
 * run only in CI. It closes the deterministic TS / arch round-trip and the
 * change's own lint + tests, not every gate.
 *
 * Bypass for a genuine emergency: `git push --no-verify` (use sparingly — CI is
 * still the authoritative gate and will block a bad push at the PR).
 */

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isWin = process.platform === "win32";

// When invoked via `exec node` from an MSYS2/Cygwin sh.exe hook, PATH is
// POSIX-style (/c/Program Files/nodejs) which native Windows node.exe can't
// resolve. Convert those entries back to Windows paths before spawning children.
// (Same conversion as run-pre-commit.mjs.)
function fixedEnv() {
  if (!isWin) return process.env;
  const rawPath = process.env.PATH || process.env.Path || "";
  if (!rawPath.includes(":/")) return process.env;

  const gitExecPath = process.env.GIT_EXEC_PATH || "";
  const gitRoot = gitExecPath
    ? path.resolve(gitExecPath.replace(/\//g, path.sep), "..", "..", "..") + path.sep
    : null;

  const winPATH = rawPath
    .split(":")
    .map((p) => {
      if (p.match(/^\/([a-zA-Z])\//)) {
        return p.replace(/^\/([a-zA-Z])\//, (_, d) => d.toUpperCase() + ":\\").replace(/\//g, "\\");
      }
      if (gitRoot) {
        if (p === "/cmd") return path.join(gitRoot, "cmd");
        if (p === "/mingw64/bin") return path.join(gitRoot, "mingw64", "bin");
        if (p === "/usr/bin") return path.join(gitRoot, "usr", "bin");
        if (p === "/usr/local/bin") return path.join(gitRoot, "usr", "local", "bin");
        if (p === "/bin") return path.join(gitRoot, "usr", "bin");
      }
      return p;
    })
    .join(";");
  return { ...process.env, PATH: winPATH };
}

const env = fixedEnv();

function run(label, cmd, args) {
  console.log(`\n[pre-push] ${label} — ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    // On Windows, npm/npx CLI wrappers are .cmd files → need cmd.exe (shell:true).
    shell: isWin,
    env,
  });
  if (result.error) {
    console.error(`[pre-push] failed to spawn '${cmd}': ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `\n[pre-push] ✗ ${label} failed (exit ${result.status}). Push aborted — this would have failed CI.\n` +
        `[pre-push]   Fix it, or bypass for an emergency with: git push --no-verify`,
    );
    process.exit(result.status ?? 1);
  }
}

// The base to diff against. Prefer the branch's push/upstream ref so a pre-push
// scopes to just the commits ABOUT TO BE PUSHED — on a long-lived feature branch
// that is a handful of files, not everything the branch ever touched vs main
// (which would pull in hundreds of tests and reintroduce the contention this hook
// avoids). Fall back to the trunk for a branch with no upstream yet (never
// pushed). `git rev-parse --verify --quiet` prints nothing and exits non-zero
// when a ref is absent, so this never throws.
function resolveBaseRef() {
  for (const ref of ["@{push}", "@{upstream}", "origin/main", "origin/master", "main", "master"]) {
    const r = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      cwd: repoRoot,
      shell: isWin,
      env,
      encoding: "utf8",
    });
    // Return the resolved SHA, not the symbolic ref: vitest --changed and the
    // diff both want a plain commit, and reflog syntax like @{push} is not
    // guaranteed to survive every consumer.
    if (r.status === 0 && (r.stdout || "").trim()) return r.stdout.trim();
  }
  return null;
}

// Tracked files the branch adds or modifies vs base (merge-base, three-dot),
// filtered to `extRe`. --diff-filter=ACMR drops deletions (can't lint a file
// that's gone). These are git paths = tracked only, so untracked local scratch
// files are never included.
function changedTrackedFiles(base, extRe) {
  const r = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`], {
    cwd: repoRoot,
    shell: isWin,
    env,
    encoding: "utf8",
  });
  if (r.status !== 0) return [];
  return (r.stdout || "")
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter((f) => f && extRe.test(f));
}

run("typecheck", "npm", ["run", "typecheck"]);
run("architecture gate", "npm", ["run", "check:architecture"]);

const base = resolveBaseRef();

if (base) {
  // ESLint on the branch's changed JS/TS files only (see header: `eslint .`
  // would also flag untracked local scratch files CI never sees).
  const jsFiles = changedTrackedFiles(base, /\.(ts|tsx|js|jsx|mjs|cjs)$/);
  if (jsFiles.length) {
    run(`eslint (${jsFiles.length} changed file(s))`, "npx", ["eslint", ...jsFiles]);
  } else {
    console.log("[pre-push] no changed JS/TS files — skipping eslint");
  }

  // Stylelint on the branch's changed CSS files only.
  const cssFiles = changedTrackedFiles(base, /\.css$/);
  if (cssFiles.length) {
    run(`stylelint (${cssFiles.length} changed file(s))`, "npx", ["stylelint", ...cssFiles]);
  } else {
    console.log("[pre-push] no changed CSS files — skipping stylelint");
  }

  // Vitest scoped to the branch's changes: each changed test plus every test
  // whose module graph reaches a changed source file.
  //
  // BUT: when a GLOBAL dependency changed (package.json, a lockfile, a vite/
  // vitest/ts config, .gitattributes), vitest --changed invalidates the whole
  // graph and runs ALL ~3000 tests — single-process, that starves the
  // subprocess-spawning tests past their cap and they time out (a FALSE block).
  // In that case skip the local run and let CI's 4-way shard cover it; otherwise
  // run the scoped slice with generous per-test headroom (the tsc-spawning smoke
  // tests legitimately take ~30s) so a slow-but-correct test can't flake.
  const GLOBAL_RE =
    /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|\.gitattributes|vite\.config\.|vitest\.config\.|vitest\.setup\.|tsconfig.*\.json)/;
  const allChanged = changedTrackedFiles(base, /./);
  const globalHit = allChanged.find((f) => GLOBAL_RE.test(f));
  if (globalHit) {
    console.log(
      `[pre-push] global dependency changed (${globalHit}) — vitest --changed would run the full suite; ` +
        "leaving that to CI's sharded run (it reliably passes there, flakes single-process here).",
    );
  } else {
    run(`vitest (changed vs ${base.slice(0, 9)})`, "npx", [
      "vitest",
      "run",
      "--changed",
      base,
      "--test-timeout=60000",
    ]);
  }
} else {
  // No upstream ref locally (rare: fresh branch, no fetch). The deterministic
  // gates above still ran in full; scope the rest to the working tree.
  console.log("[pre-push] no upstream base ref found — scoping lint/tests to the working tree");
  run("vitest (changed, working tree)", "npx", ["vitest", "run", "--changed", "--test-timeout=60000"]);
}

console.log("\n[pre-push] ✓ local gates passed — pushing. (Full lint / full suite / coverage / mutation run in CI.)");
