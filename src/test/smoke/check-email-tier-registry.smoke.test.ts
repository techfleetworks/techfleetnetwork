// Smoke coverage for scripts/ci/check-email-tier-registry.mjs — a BLOCKING guard that fails CI
// when a real email template can be sent but has NO entry in the tier registry
// (supabase/functions/_shared/email/domain/email-tiers.ts). A template with no tier could have a
// critical email silently treated as gate-able, or a marketing email treated as un-gated. The
// guard scans TEMPLATES (registry.ts) + AUTH_TEMPLATES/BULK_TEMPLATES (types.ts) and requires
// every one to appear as a key in EMAIL_TIERS. It reads all inputs from process.cwd(), so we
// steer it with cwd=fixtureRoot. These tests prove it CATCHES a missing-tier template and fails
// CLOSED when its source files moved — run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-email-tier-registry.mjs");

const REGISTRY = "supabase/functions/_shared/transactional-email-templates/registry.ts";
const TIERS = "supabase/functions/_shared/email/domain/email-tiers.ts";

// A minimal registry.ts exposing one TEMPLATES key ("welcome").
const registrySrc = 'export const TEMPLATES = {\n  "welcome": x,\n};\n';
// EMAIL_TIERS that DOES register "welcome".
const tiersWithWelcome = 'export const EMAIL_TIERS = {\n  "welcome": { tier: 0 },\n};\n';
// EMAIL_TIERS that registers a different key — "welcome" is left without a tier.
const tiersWithoutWelcome = 'export const EMAIL_TIERS = {\n  "other": { tier: 0 },\n};\n';

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation / fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-email-tier-registry guard (smoke)", () => {
  it("ETR-001: passes when every scanned template has an EMAIL_TIERS entry", () => {
    const r = guardFixture({ [REGISTRY]: registrySrc, [TIERS]: tiersWithWelcome });
    expect(runGuard(r)).toBe(0);
  });

  it("ETR-002: FLAGS (exit 1) a template present in TEMPLATES but missing from EMAIL_TIERS", () => {
    const r = guardFixture({ [REGISTRY]: registrySrc, [TIERS]: tiersWithoutWelcome });
    expect(runGuard(r)).toBe(1);
  });

  it("ETR-003: fails CLOSED (exit 1) when the registry/types sources scan zero templates", () => {
    // No registry.ts / types.ts under the root — an empty required-set means the source
    // files moved or were renamed, a broken scan, NOT "no templates to check".
    const r = guardFixture({ "README.md": "no email sources here" });
    expect(runGuard(r)).toBe(1);
  });

  it("ETR-004: fails CLOSED (exit 1) when templates exist but the tier registry file is gone", () => {
    const r = guardFixture({ [REGISTRY]: registrySrc });
    expect(runGuard(r)).toBe(1);
  });

  it("ETR-005: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
