// Guards the TYPE-CHECK GATE itself against silently going vacuous again (ADR 20261009).
//
// Background: the root tsconfig.json is a SOLUTION file — `"files": []` + `references`. A bare
// `tsc --noEmit` ignores project references and type-checks ZERO files, always exiting 0. For most
// of this repo's life the CI "Type-check" step ran exactly that: a green no-op that let real type
// errors ship on main. These assertions make every link of the fix impossible to quietly revert:
//   1. the root really is a references-only solution file (so a bare tsc WOULD be vacuous),
//   2. the gate runner checks every real project with a stateless `tsc --noEmit -p`,
//   3. package.json `typecheck` and the CI step both go through that runner (not a bare tsc),
//   4. each real project still resolves a non-trivial set of input files (the vacuity we killed).
// Any regression — re-pointing CI at `tsc --noEmit`, emptying a project's `include`, dropping a
// project from the runner — reddens this test. It complements the runner's own fail-closed
// zero-file check (scripts/ci/typecheck.mjs) with a committed, discriminating assertion.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.cwd();
const TSC = resolve(REPO, "node_modules", "typescript", "bin", "tsc");
const PROJECTS = ["tsconfig.app.json", "tsconfig.node.json", "tsconfig.test.json"];

function read(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

function inputFilesOf(project: string): string[] {
  const out = execFileSync(process.execPath, [TSC, "-p", project, "--listFilesOnly"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.includes("node_modules") && !l.endsWith(".d.ts"));
}

describe("type-check gate is non-vacuous (ADR 20261009)", () => {
  it("root tsconfig is a references-only solution file — a bare `tsc` here checks nothing", () => {
    const root = JSON.parse(read("tsconfig.json")) as {
      files?: unknown[];
      references?: { path: string }[];
    };
    expect(root.files).toEqual([]); // the trap: zero root files
    expect(Array.isArray(root.references)).toBe(true);
    const paths = (root.references ?? []).map((r) => r.path).sort();
    // Every real project must be referenced so the solution documents the full graph.
    expect(paths).toEqual(["./tsconfig.app.json", "./tsconfig.node.json", "./tsconfig.test.json"]);
  });

  it("the gate runner type-checks every real project with a stateless per-project `tsc --noEmit -p`", () => {
    const runner = read("scripts/ci/typecheck.mjs");
    for (const project of PROJECTS) expect(runner).toContain(project);
    // The actual tsc invocation (as an args array), not just a word in a comment.
    expect(runner).toContain('"--noEmit", "-p"');
    // Must NOT invoke build mode: a `"-b"` arg is incremental/stateful and can skip errors.
    // (We check the quoted argument form so the comment that *explains* `tsc -b` doesn't trip this.)
    expect(runner).not.toContain('"-b"');
  });

  it("package.json `typecheck` and the CI step both run the gate runner, never a bare `tsc`", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.typecheck).toBe("node scripts/ci/typecheck.mjs");

    const ci = read(".github/workflows/ci.yml");
    // The Type-check step runs the npm script…
    expect(ci).toMatch(/name:\s*Type-check[\s\S]{0,400}?run:\s*npm run typecheck/);
    // …and nowhere does CI fall back to the vacuous bare form.
    expect(ci).not.toMatch(/run:\s*npx tsc --noEmit\s*$/m);
  });

  it.each(PROJECTS)("project %s resolves a real, non-empty set of input files", (project) => {
    const files = inputFilesOf(project);
    expect(files.length).toBeGreaterThan(0);
  });

  it("the app project actually includes app source (not an emptied include)", () => {
    const files = inputFilesOf("tsconfig.app.json");
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.replace(/\\/g, "/").endsWith("src/main.tsx"))).toBe(true);
  });

  it("the test project includes the test suite AND has Node types (setup/support files need them)", () => {
    // tsconfig.test.json is JSONC (has comments), so assert on the raw text rather than JSON.parse.
    expect(read("tsconfig.test.json")).toMatch(/"types"\s*:\s*\[[^\]]*"node"/);
    const files = inputFilesOf("tsconfig.test.json");
    expect(files.some((f) => f.replace(/\\/g, "/").includes("src/test/setup.ts"))).toBe(true);
  });
});
