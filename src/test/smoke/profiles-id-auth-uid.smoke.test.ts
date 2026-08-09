// Smoke coverage for audit T-A — profiles.id (PK) vs auth.uid() (== user_id)
// confusion. Identity lookups/updates must key on user_id. The lint guard
// (scripts/ci/check-profiles-id-auth-uid.mjs) prevents regressions.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

describe("profiles.id vs auth.uid() (smoke)", () => {
  it("T-A-001: freescout customer fns look up profiles by user_id, not the PK", () => {
    for (const f of ["freescout-provision-customer", "freescout-sync-customer"]) {
      const src = read(`supabase/functions/${f}/index.ts`);
      expect(src).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*parsed\.data\.userId\s*\)/);
      expect(src).not.toMatch(/\.eq\(\s*["']id["']\s*,\s*parsed\.data\.userId\s*\)/);
    }
  });

  it("T-A-002: support-provisioning-retry keys profiles on user_id", () => {
    const src = read("supabase/functions/support-provisioning-retry/index.ts");
    expect(src).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*row\.user_id\s*\)/);
    expect(src).not.toMatch(/\.eq\(\s*["']id["']\s*,\s*row\.user_id\s*\)/);
  });

  it("T-A-003: record_policy_ack fix migration keys the profiles UPDATE on user_id", () => {
    const mig =
      readdirSync(resolve(REPO, "supabase/migrations"))
        .filter((f) => /fix_record_policy_ack_profiles_userid\.sql$/.test(f))
        .map((f) => read(`supabase/migrations/${f}`))[0] ?? "";
    expect(mig).toBeTruthy();
    expect(mig).toMatch(/update public\.profiles[\s\S]*where user_id = auth\.uid\(\)/i);
  });

  it("T-A-004: the regression-guard lint script exists", () => {
    expect(existsSync(resolve(REPO, "scripts/ci/check-profiles-id-auth-uid.mjs"))).toBe(true);
  });
});
