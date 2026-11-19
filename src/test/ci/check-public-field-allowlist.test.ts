// Discriminating self-test for the A7 public-field allowlist guard
// (verifiable-quality-gates): if the guard stopped detecting leaks, the
// "DISCRIMINATING" cases below go green→red, so the gate can't rot into a no-op.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  findViolations,
  parseAnonAllowlist,
  parseSelect,
} from "../../../scripts/ci/check-public-field-allowlist.mjs";

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

const POLICY = `
const ANON_FIELDS = {
  class: "id, slug, title, summary, published_at",
  cohort: "id, label, start_date, end_date, registration_url",
  project: "id, client_id, friendly_name",
  client: "id, name, logo_url",
  course: "course_key, display_label, display_order, phase, tier",
  lesson: "lesson_id, course_key, display_order, required",
} as const;
`;
const allow = parseAnonAllowlist(POLICY);

describe("A7 public-field allowlist guard", () => {
  it("parses the anon allowlist from the policy source", () => {
    expect(allow.cohort.has("registration_url")).toBe(true);
    expect(allow.client.has("status")).toBe(false); // authed-only
    expect(allow.cohort.has("timezone")).toBe(false); // authed-only
  });

  it("passes a literal select fully within the allowlist", () => {
    const source = `supabase.from("clients").select("id, name, logo_url")`;
    expect(findViolations({ path: "f", source }, allow).violations).toHaveLength(0);
  });

  it("DISCRIMINATING: flags authed-only columns in an anon literal select", () => {
    const source = `supabase.from("clients").select("id, name, logo_url, status, kind")`;
    const cols = findViolations({ path: "f", source }, allow).violations.map((v) => v.column);
    expect(cols).toEqual(expect.arrayContaining(["status", "kind"]));
  });

  it("DISCRIMINATING: flags a nested-embed leak (anon cohort status/timezone)", () => {
    const source =
      'supabase.from("classes").select(`id, slug, title, cohorts:cohorts!inner(id, label, status, timezone)`)';
    const { violations } = findViolations({ path: "f", source }, allow);
    expect(violations.some((v) => v.table === "cohorts" && v.column === "status")).toBe(true);
    expect(violations.some((v) => v.table === "cohorts" && v.column === "timezone")).toBe(true);
  });

  it("passes the A8 core-course outline select (course + nested lesson_catalog)", () => {
    const source =
      'supabase.from("course_catalog").select(`course_key, display_label, display_order, phase, tier, lessons:lesson_catalog(lesson_id, course_key, display_order, required)`)';
    expect(findViolations({ path: "f", source }, allow).violations).toHaveLength(0);
  });

  it("DISCRIMINATING: flags a non-allowlisted column in the A8 course select", () => {
    // `active` and the embedded `created_at` are real columns but NOT in the
    // course/lesson anon allowlist — the guard must catch both.
    const source =
      'supabase.from("course_catalog").select(`course_key, active, lessons:lesson_catalog(lesson_id, created_at)`)';
    const { violations } = findViolations({ path: "f", source }, allow);
    expect(violations.some((v) => v.table === "course_catalog" && v.column === "active")).toBe(true);
    expect(violations.some((v) => v.table === "lesson_catalog" && v.column === "created_at")).toBe(true);
  });

  it("DISCRIMINATING: flags a spread embed leak (...clients(status, kind))", () => {
    const source = `supabase.from("projects").select("id, client_id, ...clients(id, name, status, kind)")`;
    const cols = findViolations({ path: "f", source }, allow)
      .violations.filter((v) => v.table === "clients").map((v) => v.column);
    expect(cols).toEqual(expect.arrayContaining(["status", "kind"]));
  });

  it("DISCRIMINATING: flags a policy call concatenated with literal leak columns", () => {
    const source = `supabase.from("clients").select(clientCardFields(a) + ", status, kind")`;
    expect(findViolations({ path: "f", source }, allow).violations.length).toBeGreaterThan(0);
  });

  it("DISCRIMINATING: fail-closed on a split builder (from and select detached)", () => {
    const source =
      `const q = supabase.from("clients");\n  await supabase.from("profiles").select("id, name");\n  await q.select("id, name, status, kind");`;
    expect(findViolations({ path: "f", source }, allow).violations.length).toBeGreaterThan(0);
  });

  it("treats a policy-sourced (dynamic) select as compliant", () => {
    for (const call of ["fieldsFor(\"project\", authState)", "projectCardFields(authState)", "clientCardFields(authState)"]) {
      const source = `supabase.from("projects").select(${call})`;
      expect(findViolations({ path: "f", source }, allow).violations).toHaveLength(0);
    }
  });

  it("fail-closed: a wildcard or unparseable literal resource-select is a violation", () => {
    expect(findViolations({ path: "f", source: `supabase.from("projects").select("*")` }, allow).violations.length)
      .toBeGreaterThan(0);
  });

  it("a file-level `// a7-allow:` waiver exempts the file and surfaces the reason", () => {
    const source = `// a7-allow: Framer feed, retired in A6\nsupabase.from("clients").select("id, name, status, kind")`;
    const { violations, waiver } = findViolations({ path: "f", source }, allow);
    expect(violations).toHaveLength(0);
    expect(waiver).toContain("Framer");
  });

  it("ignores non-§6 tables (e.g. profiles) selected by a public fn", () => {
    const source = `supabase.from("profiles").select("display_name, first_name, last_name")`;
    expect(findViolations({ path: "f", source }, allow).violations).toHaveLength(0);
  });

  it("parseSelect flattens aliases and casts to bare columns", () => {
    const { pairs } = parseSelect("id, kind:kind::text, friendly:friendly_name", "projects");
    expect(pairs.map((p) => p.column)).toEqual(["id", "kind", "friendly_name"]);
  });
});

// Runs the guard BINARY end-to-end (this is what check-guard-has-test credits as
// coverage: a committed test that execFileSyncs the guard against throwaway
// fixtures and asserts its exit codes). Also proves the CLI wiring, not just the
// exported functions.
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
