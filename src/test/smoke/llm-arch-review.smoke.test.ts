// Smoke coverage for scripts/ci/llm-arch-review.mjs — the LLM architecture-review Action that
// closes the "judge-arch is agent-run convention, not CI" gap (ADR-0023 → ADR-0025) by running the
// four-questions rubric on every PR diff and posting an advisory comment. It is ADVISORY (exits 0
// unless ENFORCE=1), so it is not a pass/fail guard — but per verifiable-quality-gates we still test
// its deterministic core (request assembly, comment framing, findings detection) and its seams.
//
// Seams (test-only, never set in prod/CI): LLM_REVIEW_FIXTURE (model response from a file),
// LLM_REVIEW_DIFF_FILE (diff from a file), and --dry-run (print the comment instead of posting).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildRequest, buildComment, hasFindings } from "../../../scripts/ci/llm-arch-review.mjs";

const REPO = process.cwd();
const SCRIPT = resolve(REPO, "scripts/ci/llm-arch-review.mjs");
const made: string[] = [];
function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "llmreview-"));
  made.push(dir);
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}
afterAll(() => {
  // best-effort cleanup of tmp dirs
  for (const d of made) {
    try {
      execFileSync("node", [
        "-e",
        `require("fs").rmSync(${JSON.stringify(d)},{recursive:true,force:true})`,
      ]);
    } catch {
      /* ignore */
    }
  }
});

/** Run the real script with --dry-run and seam env; return { code, out }. */
function runDry(env: Record<string, string>): { code: number; out: string } {
  try {
    const out = execFileSync("node", [SCRIPT, "--dry-run"], {
      cwd: REPO,
      stdio: "pipe",
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, out: err.stdout ?? "" };
  }
}

describe("llm-arch-review (smoke)", () => {
  it("LAR-001: buildComment frames the review with the upsert marker and an advisory footer", () => {
    const c = buildComment("ARCH-REVIEW: PASS");
    expect(c).toContain("<!-- llm-arch-review -->");
    expect(c).toContain("ARCH-REVIEW: PASS");
    expect(c.toLowerCase()).toContain("advisory");
  });

  it("LAR-002: hasFindings distinguishes a clean review from one with findings", () => {
    expect(hasFindings("ARCH-REVIEW: PASS")).toBe(false);
    expect(hasFindings("ARCH-REVIEW: 2 finding(s)\n### Boundary...")).toBe(true);
    expect(hasFindings("")).toBe(false);
  });

  it("LAR-003: buildRequest caches the rules block and carries the diff + truncation note", () => {
    const req = buildRequest({ rules: "RULES-TEXT", diff: "DIFF-TEXT", truncated: true }) as any;
    expect(req.system[1].cache_control).toEqual({ type: "ephemeral" }); // rules are the cached prefix
    expect(req.system[0].cache_control).toBeUndefined(); // the rubric preamble is not the cache anchor
    expect(req.messages[0].content).toContain("DIFF-TEXT");
    expect(req.messages[0].content).toContain("truncated"); // disclosed to the model
    expect(req.max_tokens).toBeGreaterThan(0);
  });

  it("LAR-004: dry-run posts the model's verdict verbatim inside the comment (fixture seam)", () => {
    const fixture = tmpFile(
      "review.txt",
      "ARCH-REVIEW: 1 finding(s)\n### Data ownership\n**Where:** billing"
    );
    const diff = tmpFile("d.diff", "diff --git a/x b/x\n+const total = stored + rows;\n");
    const { code, out } = runDry({ LLM_REVIEW_FIXTURE: fixture, LLM_REVIEW_DIFF_FILE: diff });
    expect(code).toBe(0);
    expect(out).toContain("<!-- llm-arch-review -->");
    expect(out).toContain("ARCH-REVIEW: 1 finding(s)");
    expect(out).toContain("Data ownership");
  });

  it("LAR-005: an empty diff self-heals to a skip (exit 0, no comment emitted)", () => {
    const diff = tmpFile("empty.diff", "   \n");
    const { code, out } = runDry({
      LLM_REVIEW_FIXTURE: tmpFile("r.txt", "ARCH-REVIEW: PASS"),
      LLM_REVIEW_DIFF_FILE: diff,
    });
    expect(code).toBe(0);
    expect(out).not.toContain("<!-- llm-arch-review -->"); // skipped before building a comment
  });

  it("LAR-006: a thrown reachability/infra error never blocks — exits 0 with a warning (ADR-0025)", () => {
    // A missing fixture path makes the model-load throw; the advisory contract requires exit 0.
    const diff = tmpFile("d.diff", "diff --git a/x b/x\n+x\n");
    const { code, out } = runDry({
      LLM_REVIEW_FIXTURE: join(tmpdir(), "does-not-exist-llmreview.txt"),
      LLM_REVIEW_DIFF_FILE: diff,
    });
    expect(code).toBe(0);
    expect(out).not.toContain("<!-- llm-arch-review -->"); // errored before it could post
  });
});
