// Static-assertion smoke for the invariants the live-derived stats model (ADR-0050 / ADR-0052)
// relies on: the append-only ledgers are uniquely keyed, test accounts are flaggable, the Discord
// link timestamp is stamped by a trigger, and get_network_stats exposes the live-derived keys.
// Runtime behavior is proven by the pgTAP suites (stats_live_derivation_test.sql,
// retire_stats_snapshot_test.sql) — badges and counts are now emitted/derived live, so there is no
// recompute/reconcile RPC left to assert (ADR-0052 retired that subsystem).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const sql = fs.existsSync(MIGRATIONS_DIR)
  ? fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n")
  : "";

describe("Network Stats — ledger + live-derivation invariants (smoke)", () => {
  it("STATS-001/010: course_completions has UNIQUE(user_id, course_key)", () => {
    expect(sql).toMatch(/course_completions[\s\S]*UNIQUE\s*\(\s*user_id\s*,\s*course_key\s*\)/i);
  });

  it("STATS-004: general_application_submissions has UNIQUE(user_id)", () => {
    expect(sql).toMatch(/general_application_submissions[\s\S]*UNIQUE\s*\(\s*user_id\s*\)/i);
  });

  it("STATS-005: profiles.is_test_account column exists", () => {
    expect(sql).toMatch(/is_test_account\s+boolean/i);
  });

  it("STATS-RECON-002: discord_linked_at column + timestamp trigger exist", () => {
    expect(sql).toMatch(/discord_linked_at\s+timestamptz/i);
    expect(sql).toMatch(/set_discord_linked_at/);
  });

  it("STATS-RECON-004: get_network_stats exposes the live-derived keys", () => {
    expect(sql).toMatch(/'course_completions_total'/);
    expect(sql).toMatch(/'discord_links_count'/);
    expect(sql).toMatch(/'prev_week_discord_links_count'/);
  });
});
