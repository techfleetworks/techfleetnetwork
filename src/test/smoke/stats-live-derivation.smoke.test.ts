// ADR-0050 guard — the read path for displayed stats must be LIVE-derived and must never
// revert to a stored/denormalized counter table. If someone reintroduces a snapshot read in
// the display RPCs, this fails. Pairs with the pgTAP proof
// (supabase/tests/stats_live_derivation_test.sql) and the arch-gate rule that keeps the
// frontend off the counter tables (arch-gate.config.json + decisions.md §2).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIG_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Body of the LAST migration (by filename order) that (re)defines `fnName`. */
function latestDefinitionBody(fnName: string): { file: string; body: string } {
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\b`);
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIG_DIR, files[i]), "utf8");
    const m = sql.match(re);
    if (m && m.index !== undefined) {
      const rest = sql.slice(m.index);
      const end = rest.indexOf("$$;");
      return { file: files[i], body: end >= 0 ? rest.slice(0, end + 3) : rest };
    }
  }
  throw new Error(`No CREATE OR REPLACE FUNCTION for ${fnName} found in migrations`);
}

describe("Displayed stats are live-derived, not read from a stored counter (ADR-0050)", () => {
  it("STATS-016: get_network_stats does NOT read network_stats_snapshots", () => {
    const { body } = latestDefinitionBody("get_network_stats");
    expect(body).not.toMatch(/network_stats_snapshots/);
  });

  it("STATS-017: get_network_stats reads the live owning rows (profiles + journey_progress)", () => {
    const { body } = latestDefinitionBody("get_network_stats");
    expect(body).toMatch(/FROM public\.profiles/);
    expect(body).toMatch(/journey_progress/);
  });

  it("STATS-018: get_course_completion_counts does NOT read course_completion_stats", () => {
    const { body } = latestDefinitionBody("get_course_completion_counts");
    expect(body).not.toMatch(/course_completion_stats/);
  });

  it("STATS-019: get_course_completion_counts counts live journey_progress rows", () => {
    const { body } = latestDefinitionBody("get_course_completion_counts");
    expect(body).toMatch(/journey_progress/);
    expect(body).toMatch(/is_test_account/); // excludes test accounts, like the app
  });
});
