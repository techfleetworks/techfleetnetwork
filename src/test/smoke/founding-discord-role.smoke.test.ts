// Smoke coverage for the Founding Members Discord role FOUNDATION (ADR-0049, PR-A).
// Hermetic file-content checks (no DB/network), matching the gumroad smoke convention. Each
// guards a CONFIG or SAFETY invariant — if one fails, fix the source, do not relax the test.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");
const migrationsDir = resolve(REPO, "supabase/migrations");
const migration = (re: RegExp) =>
  readdirSync(migrationsDir).filter((f) => re.test(f)).map((f) => read(`supabase/migrations/${f}`))[0] ?? "";

const config = migration(/discord_roles_config\.sql$/);
const targets = migration(/founding_discord_role_targets\.sql$/);
const pgtap = read("supabase/tests/founding_discord_role_test.sql");

describe("founding discord role — foundation (smoke)", () => {
  it("FDR-001: the config migration seeds the Founding Members role id + is RLS-protected (AC3)", () => {
    expect(config).toMatch(/CREATE TABLE IF NOT EXISTS public\.discord_roles/);
    expect(config).toMatch(/'founding_members',\s*'1533887923597087041',\s*'Founding Members'/);
    expect(config).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(config).toMatch(/discord_roles_admin_read/);
  });

  it("FDR-002: the target set encodes the REAL invariant (founding AND OAuth-verified Discord)", () => {
    expect(targets).toMatch(/is_founding_member = true/);
    expect(targets).toMatch(/discord_user_id IS NOT NULL/);
    expect(targets).toMatch(/has_discord_account/);
    // Hardened convention: SECURITY DEFINER with a pinned empty search_path.
    expect(targets).toMatch(/security definer[\s\S]{0,80}set search_path\s*=\s*''/i);
  });

  it("FDR-003: PR-A is DARK — neither migration enqueues a grant or calls Discord", () => {
    for (const m of [config, targets]) {
      expect(m).not.toMatch(/INSERT INTO public\.discord_role_grant_queue/i);
      expect(m).not.toMatch(/queue_discord_role_grant/);
      expect(m).not.toMatch(/discord\.com/);
    }
  });

  it("FDR-004: the dry-run report emits an auditable summary (visible before go-live)", () => {
    expect(targets).toMatch(/founding_discord_role_reconcile_dryrun/);
    expect(targets).toMatch(/write_audit_log/);
    expect(targets).toMatch(/connected_targets/);
  });

  it("FDR-005: pgTAP proves target membership + the dark guarantee", () => {
    expect(pgtap).toMatch(/list_founding_discord_role_targets/);
    expect(pgtap).toMatch(/no enqueue/i);
    expect(pgtap).toMatch(/plan\(7\)/);
  });
});
