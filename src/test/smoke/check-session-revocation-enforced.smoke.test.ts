// Smoke coverage for scripts/ci/check-session-revocation-enforced.mjs —
// SESSION-REVOCATION-ENFORCED-001, the guard that keeps server-side session revocation
// enforced at the edge (SEC-1 / RH1) and bans reintroducing raw admin.auth.admin.signOut(
// as the revocation mechanism.
//
// The guard is run as the REAL shipped file (resolved from a local const so
// check-guard-has-test credits it) pointed at throwaway fixture trees via its test seams
// (SESSION_REVOKE_ROOT / SESSION_REVOKE_BASE), so the shrink check is deterministic without
// a git repo. Each case ties a specific exit code to the guard's behavior, so if the guard
// is no-op'd the FLAG/fail-closed cases stop failing and this suite reddens (discrimination
// gate, verify-guard-test-discrimination).
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-session-revocation-enforced.mjs");

afterAll(cleanupGuardFixtures);

const AUTH_WITH_CHECK =
  "export async function requireAuthenticatedRequest(req){\n" +
  "  const { data } = await userClient.auth.getClaims(token);\n" +
  '  const { data: revoked } = await userClient.rpc("is_session_revoked", { _user_id: u, _issued_at: iso });\n' +
  "  return revoked;\n}\n";
const AUTH_NO_CHECK =
  "export async function requireAuthenticatedRequest(req){\n" +
  "  // is_session_revoked enforcement deleted — client-only revocation\n" +
  "  const { data } = await userClient.auth.getClaims(token);\n" +
  "  return data;\n}\n";
const FN_CLEAN = 'export default async () => new Response("ok");\n';
const FN_SIGNOUT = 'await admin.auth.admin.signOut(userId, "global");\n';
const AL = (fns: string[]) => JSON.stringify({ functions: fns });

/** Run the REAL guard against a fixture tree, with the shrink base pinned to a fixture file. */
function run(root: string, base: string[]): number {
  const basePath = resolve(root, ".base.json");
  writeFileSync(basePath, JSON.stringify({ functions: base }));
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, SESSION_REVOKE_ROOT: root, SESSION_REVOKE_BASE: basePath },
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const baseFiles = () => ({
  "supabase/functions/_shared/request-auth.ts": AUTH_WITH_CHECK,
  "scripts/ci/session-signout-grandfather.json": AL([]),
  "supabase/functions/alpha/index.ts": FN_CLEAN,
});

describe("check-session-revocation-enforced guard (smoke)", () => {
  it("SRE-001: passes when the server check is present, no signOut, empty grandfather", () => {
    const r = guardFixture(baseFiles());
    expect(run(r, [])).toBe(0);
  });

  it("SRE-002: FLAGS (exit 1) client-only revocation — server is_session_revoked check removed", () => {
    const r = guardFixture({
      ...baseFiles(),
      "supabase/functions/_shared/request-auth.ts": AUTH_NO_CHECK,
    });
    expect(run(r, [])).toBe(1);
  });

  it("SRE-003: FLAGS (exit 1) a new raw admin.signOut( call site not on the grandfather", () => {
    const r = guardFixture({ ...baseFiles(), "supabase/functions/beta/index.ts": FN_SIGNOUT });
    expect(run(r, [])).toBe(1);
  });

  it("SRE-004: passes raw signOut on a grandfathered site", () => {
    const r = guardFixture({
      ...baseFiles(),
      "supabase/functions/beta/index.ts": FN_SIGNOUT,
      "scripts/ci/session-signout-grandfather.json": AL(["beta"]),
    });
    expect(run(r, ["beta"])).toBe(0);
  });

  it("SRE-005: FLAGS (exit 1) growing the grandfather vs base", () => {
    const r = guardFixture({
      ...baseFiles(),
      "supabase/functions/beta/index.ts": FN_SIGNOUT,
      "scripts/ci/session-signout-grandfather.json": AL(["beta"]),
    });
    expect(run(r, [])).toBe(1); // base listed none → beta is a forbidden new entry
  });

  it("SRE-006: FLAGS (exit 1) a stale grandfather entry (site no longer calls signOut)", () => {
    const r = guardFixture({
      ...baseFiles(),
      "scripts/ci/session-signout-grandfather.json": AL(["alpha"]),
    });
    expect(run(r, ["alpha"])).toBe(1);
  });

  it("SRE-007: fails CLOSED (exit 2) when request-auth.ts is missing", () => {
    const r = guardFixture({
      "scripts/ci/session-signout-grandfather.json": AL([]),
      "supabase/functions/alpha/index.ts": FN_CLEAN,
    });
    expect(run(r, [])).toBe(2);
  });

  it("SRE-009: fails CLOSED (exit 2) when the shrink base cannot be resolved (no origin/main, no base seam)", () => {
    // The guard rides gate-verify's fetch-depth:0 checkout in CI so origin/main resolves. This pins
    // the OTHER side: if the base branch cannot be resolved at all (a shallow checkout with no base
    // seam), baseAllowlist() returns null and the guard dies rather than passing without a baseline.
    const root = guardFixture(baseFiles());
    try {
      execFileSync("node", [GUARD], {
        stdio: "pipe",
        // SESSION_REVOKE_BASE intentionally unset; fixture root is not a git repo → origin/main unresolvable.
        env: { ...process.env, SESSION_REVOKE_ROOT: root, SESSION_REVOKE_BASE: "" },
      });
      throw new Error("guard unexpectedly passed with no resolvable base");
    } catch (e) {
      expect((e as { status?: number }).status).toBe(2);
    }
  });

  it("SRE-008: the real repo passes the guard (invariant + no new signOut + no stale entries)", () => {
    // Pin the shrink baseline to the repo's OWN grandfather (self-compare → no growth) so this runs
    // at any checkout depth; the vs-main git path runs in the fetch-depth:0 gate job.
    try {
      execFileSync("node", [GUARD], {
        cwd: REPO,
        stdio: "pipe",
        env: {
          ...process.env,
          SESSION_REVOKE_BASE: resolve(REPO, "scripts/ci/session-signout-grandfather.json"),
        },
      });
      expect(true).toBe(true);
    } catch (e) {
      throw new Error(
        "real-repo check-session-revocation-enforced failed: " +
          ((e as { stdout?: Buffer }).stdout ?? "")
      );
    }
  });
});
