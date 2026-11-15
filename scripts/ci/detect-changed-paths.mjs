#!/usr/bin/env node
// detect-changed-paths — decide which change-gated CI jobs must run, FAILING OPEN.
//
// RC1 (re-audit 2026-10-30): the old inline step re-fetched the PR base with
// `git fetch --depth=1` and then ran `git diff base...HEAD`. A shallow base has no
// common ancestor, so the three-dot diff returned an EMPTY set and every filter went
// `false` — e2e, migrations, functions and db_schema all silently skipped on PRs that
// really changed those paths. A skipped job reads as "not applicable", so nothing
// surfaced the miss.
//
// Prevent-by-construction (ADR 20261106): compute the diff against the real merge-base,
// and if the changed-file set CANNOT be computed reliably (fetch error, merge-base
// unresolved, git error, or an empty set), FAIL OPEN — every filter returns `true` so a
// broken detection can never again silently skip a change-gated job. Running a job that
// was not strictly needed only costs CI minutes; skipping one that was needed is how a
// required test layer comes to gate nothing.
//
// The classification core (`classify`) is a pure function with no git or env access, so
// its discrimination test (detect-changed-paths.test.mjs) runs under plain `node`.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Each change-gated job and the path pattern that makes it run. Keep in lockstep with the
// `needs.detect-changes.outputs.*` consumers in .github/workflows/ci.yml.
export const FILTERS = {
  migrations: /^supabase\/migrations\//m,
  e2e: /^(src\/|supabase\/functions\/)/m,
  functions: /^supabase\/functions\//m,
  // Run the pgTAP suite (db-test) when a migration changes OR when the suite itself changes —
  // editing a pgTAP test should actually run it (it did not before).
  db_tests: /^supabase\/tests\//m,
  // Mirrors the original grep: `^supabase/migrations/` is a PREFIX (no `$`), while the
  // scripts/ci inputs are exact filenames (`$`). The `$` must bind only the second branch.
  db_schema:
    /^supabase\/migrations\/|^scripts\/ci\/(check-db-schema-present\.mjs|db-schema-allowlist\.json|db-dynamic-objects\.json|_sql-scan\.mjs)$/m,
};

// Pure + unit-testable. `failOpen` true forces every job to run, regardless of the diff.
// This is the load-bearing invariant: when detection is unreliable, everything runs.
export function classify(changedFiles, failOpen) {
  const text = Array.isArray(changedFiles)
    ? changedFiles.join("\n")
    : String(changedFiles ?? "");
  const out = {};
  for (const [name, re] of Object.entries(FILTERS)) {
    out[name] = failOpen ? true : re.test(text);
  }
  return out;
}

// Run git with an ARGUMENT ARRAY (never a shell string): no shell is spawned, so values
// derived from env (base ref, before-sha) can never be interpreted as a command. Defence in
// depth — base_ref is repo-controlled and before is a SHA, but this removes the smell entirely.
function git(args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}

// Returns { changed: string[]|null, failOpen: boolean, reason: string }.
export function computeChanged(env = process.env) {
  try {
    if (env.GITHUB_EVENT_NAME === "pull_request") {
      const base = env.GITHUB_BASE_REF;
      if (!base) return { changed: null, failOpen: true, reason: "no base ref" };
      try {
        // FULL fetch (no --depth=1): a shallow base has no merge-base (the RC1 bug).
        git(["fetch", "--no-tags", "origin", base]);
      } catch {
        return { changed: null, failOpen: true, reason: "base fetch failed" };
      }
      let mb = "";
      try {
        mb = git(["merge-base", `origin/${base}`, "HEAD"]);
      } catch {
        return { changed: null, failOpen: true, reason: "merge-base unresolved" };
      }
      if (!mb) return { changed: null, failOpen: true, reason: "merge-base empty" };
      let diff = "";
      try {
        diff = git(["diff", "--name-only", mb, "HEAD"]);
      } catch {
        return { changed: null, failOpen: true, reason: "diff failed" };
      }
      const files = diff.split("\n").filter(Boolean);
      if (files.length === 0)
        return { changed: [], failOpen: true, reason: "empty diff (treated as unreliable)" };
      return { changed: files, failOpen: false, reason: "ok" };
    }

    // push / other events
    const before = env.GITHUB_EVENT_BEFORE || "";
    if (!before || /^0+$/.test(before))
      return { changed: null, failOpen: true, reason: "no before sha" };
    let diff = "";
    try {
      diff = git(["diff", "--name-only", before, "HEAD"]);
    } catch {
      try {
        diff = git(["diff", "--name-only", "HEAD~1", "HEAD"]);
      } catch {
        return { changed: null, failOpen: true, reason: "push diff failed" };
      }
    }
    const files = diff.split("\n").filter(Boolean);
    if (files.length === 0)
      return { changed: [], failOpen: true, reason: "empty diff (treated as unreliable)" };
    return { changed: files, failOpen: false, reason: "ok" };
  } catch (e) {
    return { changed: null, failOpen: true, reason: "unexpected: " + (e?.message ?? e) };
  }
}

function main() {
  const { changed, failOpen, reason } = computeChanged();
  if (failOpen) {
    console.log(
      `::warning::detect-changes failing OPEN (${reason}) — running every change-gated job.`,
    );
  }
  console.log("Changed files:");
  console.log((changed || []).join("\n"));
  const result = classify(changed || [], failOpen);
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  for (const l of lines) console.log(l);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
