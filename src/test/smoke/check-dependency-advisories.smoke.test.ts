// Smoke coverage for scripts/ci/check-dependency-advisories.mjs (decisions.md §6) —
// the BLOCKING dependency-advisory gate (ADR-0041, delta mode ADR 20261009). We run
// the REAL guard (not a copy) against throwaway fixtures via its test-only env
// overrides (DEP_ADVISORIES_AUDIT_JSON = a fixture npm-audit report;
// DEP_ADVISORIES_WAIVERS = a fixture waivers file; DEP_ADVISORIES_BASE_AUDIT_JSON
// = a fixture base-branch audit for delta mode), so the shipped code path is
// exercised. FULL mode must DISCRIMINATE: unwaived → 1, expired waiver → 1,
// covered+unexpired → 0, unparseable audit → 2 (fail-closed). DELTA mode (a PR):
// an unwaived advisory already on the base → 0 (pre-existing, not introduced), a
// new one → 1. If detection is no-op'd, these flip.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-dependency-advisories.mjs");

const tmps: string[] = [];
afterAll(() => {
  for (const d of tmps) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

const GHSA = "GHSA-v3m3-f69x-jf25";

/** Write a fixture audit report + waivers file, run the REAL guard, return exit code. */
function runGuard(opts: {
  audit: unknown | string;
  waivers: unknown;
  baseAudit?: unknown;
  baseRef?: string;
  full?: boolean;
}): number {
  const dir = mkdtempSync(join(tmpdir(), "dep-adv-"));
  tmps.push(dir);
  const auditPath = join(dir, "audit.json");
  const waiversPath = join(dir, "waivers.json");
  writeFileSync(
    auditPath,
    typeof opts.audit === "string" ? opts.audit : JSON.stringify(opts.audit)
  );
  writeFileSync(waiversPath, JSON.stringify(opts.waivers));
  // Default to FULL mode: explicitly clear any base-ref env (e.g. GITHUB_BASE_REF
  // leaking in from a CI pull_request run) so the FULL cases stay deterministic.
  // `baseAudit` opts into DELTA against that fixture base; `baseRef` (without a
  // fixture) opts into the REAL git path — run in the throwaway dir (not a git
  // repo) so an unresolvable base fails fast and exercises the fallback-to-FULL.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DEP_ADVISORIES_AUDIT_JSON: auditPath,
    DEP_ADVISORIES_WAIVERS: waiversPath,
    GITHUB_BASE_REF: "",
    DEP_ADVISORIES_BASE_REF: "",
    DEP_ADVISORIES_BASE_AUDIT_JSON: "",
  };
  if (opts.baseAudit !== undefined) {
    const basePath = join(dir, "base-audit.json");
    writeFileSync(basePath, JSON.stringify(opts.baseAudit));
    env.DEP_ADVISORIES_BASE_REF = opts.baseRef ?? "main";
    env.DEP_ADVISORIES_BASE_AUDIT_JSON = basePath;
  } else if (opts.baseRef !== undefined) {
    env.DEP_ADVISORIES_BASE_REF = opts.baseRef;
  }
  try {
    execFileSync("node", opts.full ? [GUARD, "--full"] : [GUARD], {
      stdio: "pipe",
      cwd: dir, // non-git dir: the fallback case's `git` fetch fails hermetically
      env,
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const auditWith = (ghsa: string) => ({
  vulnerabilities: {
    quill: {
      severity: "low",
      via: [
        {
          url: `https://github.com/advisories/${ghsa}`,
          name: "quill",
          severity: "low",
          title: "XSS via HTML export",
        },
      ],
    },
  },
});
const waiver = (expires: string) => ({
  waivers: [
    {
      ghsa: GHSA,
      package: "quill",
      reason: "no upstream fix; mitigated",
      added: "2026-09-12",
      expires,
    },
  ],
});

describe("check-dependency-advisories guard", () => {
  it("exits 0 when the only advisory is covered by an unexpired waiver", () => {
    expect(runGuard({ audit: auditWith(GHSA), waivers: waiver("2999-12-31") })).toBe(0);
  });

  it("exits 1 on an advisory with no waiver", () => {
    expect(runGuard({ audit: auditWith(GHSA), waivers: { waivers: [] } })).toBe(1);
  });

  it("exits 1 when the covering waiver has expired", () => {
    expect(runGuard({ audit: auditWith(GHSA), waivers: waiver("2000-01-01") })).toBe(1);
  });

  it("exits 0 when there are no advisories at all", () => {
    expect(runGuard({ audit: { vulnerabilities: {} }, waivers: { waivers: [] } })).toBe(0);
  });

  it("fails closed (exit 2) on unparseable audit output", () => {
    expect(runGuard({ audit: "{ not valid json", waivers: { waivers: [] } })).toBe(2);
  });
});

const auditFor = (pkg: string, ghsa: string, severity = "high") => ({
  vulnerabilities: {
    [pkg]: {
      severity,
      via: [
        {
          url: `https://github.com/advisories/${ghsa}`,
          name: pkg,
          severity,
          title: `${pkg} issue`,
        },
      ],
    },
  },
});

describe("check-dependency-advisories guard — delta mode (pull requests, ADR 20261009)", () => {
  it("exits 0 when the unwaived advisory already exists on the base branch (pre-existing, not introduced)", () => {
    expect(
      runGuard({ audit: auditWith(GHSA), waivers: { waivers: [] }, baseAudit: auditWith(GHSA) })
    ).toBe(0);
  });

  it("exits 1 when the unwaived advisory is NOT on the base branch (introduced by this PR)", () => {
    expect(
      runGuard({
        audit: auditWith(GHSA),
        waivers: { waivers: [] },
        baseAudit: { vulnerabilities: {} },
      })
    ).toBe(1);
  });

  it("exits 1 when a NEW package carries a GHSA already on base via a DIFFERENT package (package::GHSA identity, not GHSA-only)", () => {
    const ghsa = "GHSA-aaaa-bbbb-cccc";
    expect(
      runGuard({
        audit: auditFor("new-runtime-pkg", ghsa),
        waivers: { waivers: [] },
        baseAudit: auditFor("some-dev-tool", ghsa), // same GHSA, different package
      })
    ).toBe(1);
  });

  it("fails CLOSED to the full gate (exit 1) when the base branch cannot be resolved", () => {
    // baseRef set but no fixture → the guard takes the real git path; run in the
    // throwaway (non-git) dir so `git fetch` fails → fallback to FULL → unwaived blocks.
    expect(
      runGuard({ audit: auditWith(GHSA), waivers: { waivers: [] }, baseRef: "no-such-base-xyz" })
    ).toBe(1);
  });

  it("--full forces the full gate even on a PR (base fixture ignored) → exit 1", () => {
    expect(
      runGuard({
        audit: auditWith(GHSA),
        waivers: { waivers: [] },
        baseAudit: auditWith(GHSA),
        full: true,
      })
    ).toBe(1);
  });
});
