// Smoke coverage for scripts/ci/check-dependency-advisories.mjs (decisions.md §6) —
// the BLOCKING dependency-advisory gate (ADR-0041). We run the REAL guard (not a
// copy) against throwaway fixtures via its test-only env overrides
// (DEP_ADVISORIES_AUDIT_JSON = a fixture npm-audit report; DEP_ADVISORIES_WAIVERS
// = a fixture waivers file), so the shipped code path is exercised. The guard
// must DISCRIMINATE: unwaived → 1, expired waiver → 1, covered+unexpired → 0,
// unparseable audit → 2 (fail-closed). If detection is no-op'd, these flip.
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
function runGuard(opts: { audit: unknown | string; waivers: unknown }): number {
  const dir = mkdtempSync(join(tmpdir(), "dep-adv-"));
  tmps.push(dir);
  const auditPath = join(dir, "audit.json");
  const waiversPath = join(dir, "waivers.json");
  writeFileSync(
    auditPath,
    typeof opts.audit === "string" ? opts.audit : JSON.stringify(opts.audit)
  );
  writeFileSync(waiversPath, JSON.stringify(opts.waivers));
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: {
        ...process.env,
        DEP_ADVISORIES_AUDIT_JSON: auditPath,
        DEP_ADVISORIES_WAIVERS: waiversPath,
      },
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
