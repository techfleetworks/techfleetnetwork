// Guard smoke test for the A7 public-field allowlist guard: runs the guard BINARY
// end-to-end against throwaway fixtures and asserts its exit codes. This is the
// file check-guard-has-test credits (it execFileSyncs scripts/ci/check-public-field-allowlist.mjs)
// and the one verify-guard-test-discrimination mutation-tests (it lives in
// src/test/smoke and references the guard path, so the gate maps it to the guard;
// the DISCRIMINATING case below fails when the guard is replaced with a no-op).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Vitest (and CI) run from the repo root, so resolve the guard from cwd.
const GUARD = resolve(process.cwd(), "scripts/ci/check-public-field-allowlist.mjs");

// Minimal policy the guard's parser accepts (all six §6 resources present).
const FIXTURE_POLICY = `const ANON_FIELDS = {
  class: "id, slug, title, summary, published_at",
  cohort: "id, label, start_date, end_date, registration_url",
  project: "id, client_id, friendly_name",
  client: "id, name, logo_url",
  course: "course_key, display_label, display_order, phase, tier",
  lesson: "lesson_id, course_key, display_order, required",
} as const;
`;

/** Build a throwaway repo (policy + one public-* fn) and return its root. */
function makeFixtureRepo(fnSelect: string): string {
  const dir = mkdtempSync(join(tmpdir(), "a7-guard-"));
  mkdirSync(join(dir, "supabase/functions/_shared"), { recursive: true });
  mkdirSync(join(dir, "supabase/functions/public-sample"), { recursive: true });
  writeFileSync(join(dir, "supabase/functions/_shared/public-visibility.ts"), FIXTURE_POLICY);
  writeFileSync(
    join(dir, "supabase/functions/public-sample/index.ts"),
    `export const run = () => supabase.from("clients").select(${fnSelect});\n`,
  );
  return dir;
}

describe("A7 guard CLI (end-to-end)", () => {
  const made: string[] = [];
  const build = (sel: string) => {
    const d = makeFixtureRepo(sel);
    made.push(d);
    return d;
  };
  afterAll(() => {
    for (const d of made) rmSync(d, { recursive: true, force: true });
  });

  it("exits 0 when every public-* select is within the anon allowlist", () => {
    const repo = build('"id, name, logo_url"');
    const out = execFileSync("node", [GUARD], { cwd: repo, encoding: "utf8" });
    expect(out).toContain("public-field allowlist clean");
  });

  // DISCRIMINATING: if the guard is a no-op (the mutation gate's stub), it exits 0
  // with no output, so this assertion fails — which is exactly what proves the test
  // actually exercises the guard's detection.
  it("DISCRIMINATING: exits 1 on an authed-only column leaked to anon", () => {
    const repo = build('"id, name, logo_url, status"');
    let status = 0;
    let stderr = "";
    try {
      execFileSync("node", [GUARD], { cwd: repo, encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
      stderr = String((e as { stderr?: Buffer }).stderr ?? "");
    }
    expect(status).toBe(1);
    expect(stderr).toContain("status");
  });
});
