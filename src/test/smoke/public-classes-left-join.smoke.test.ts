// PUB-CLASSES-LEFTJOIN-001: public-classes must LEFT-join cohorts, not `!inner`.
//
// The public catalog shows every published class in the track — the same
// visibility rule as the authenticated list (ClassService.listPublishedByTrack:
// status=published + track). An `!inner` embed on cohorts turns the query into
// an INNER JOIN, silently dropping any published class that has no open
// (published, future-dated) cohort — so a logged-out visitor sees "Nothing here
// yet" while a signed-in member still sees the class. That divergence was the
// 2026-11-19 "nothing" report. This test locks the join so it cannot regress.
// (ADR 20261119-public-classes-visibility.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "supabase", "functions", "public-classes", "index.ts");

/** True when the source embeds cohorts WITHOUT an inner-join (keeps all parents). */
export function cohortsAreLeftJoined(src: string): boolean {
  // Must still select the cohorts relationship...
  const embedsCohorts = /cohorts\s*:\s*cohorts\s*\(/.test(src);
  // ...and must NOT force an inner join on it.
  const usesInner = /cohorts\s*:\s*cohorts!inner\b/.test(src) || /\bcohorts!inner\b/.test(src);
  return embedsCohorts && !usesInner;
}

describe("public-classes left-joins cohorts (PUB-CLASSES-LEFTJOIN-001)", () => {
  it("the deployed source embeds cohorts without `!inner`", () => {
    const src = readFileSync(SRC, "utf8");
    expect(cohortsAreLeftJoined(src)).toBe(true);
  });

  it("DISCRIMINATING: an `!inner` embed is rejected, a plain embed is accepted", () => {
    // The exact regression shape (inner join) must be caught...
    expect(cohortsAreLeftJoined(`.select("id, cohorts:cohorts!inner(id, label)")`)).toBe(false);
    // ...and the correct left-join shape accepted.
    expect(cohortsAreLeftJoined(`.select("id, cohorts:cohorts(id, label)")`)).toBe(true);
    // No cohorts embed at all is also non-compliant (the listing needs them).
    expect(cohortsAreLeftJoined(`.select("id, slug, title")`)).toBe(false);
  });
});
