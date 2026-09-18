/**
 * Shared owner of the CI-lane marker convention (ADR-0047). A guard self-declares which CI lane
 * it runs in with a single comment line in its OWN source:
 *
 *   // ci-lane: critical   → the BLOCKING lint-arch-critical matrix (auth/security invariants)
 *   // ci-lane: standard   → the informational lint-arch matrix
 *   // ci-lane: bespoke    → runs from its own hand-written workflow step (special setup:
 *                            fetch-depth:0, prod creds, an own job) — excluded from the matrices
 *
 * This replaces the two hard-coded matrix lists in ci.yml that every guard PR had to append to
 * (a central-list conflict magnet — the same disease ADR-0046 cured for BESPOKE_DIR_READERS).
 * `emit-guard-matrix.mjs` builds the matrix from these markers; `check-guards-wired.mjs` enforces
 * every guard declares exactly one valid lane. Both import THIS module so the convention has one
 * owner and cannot drift.
 *
 * The marker is matched like ADR-0046's: it must be the LEADING content of a single comment line
 * (`//`, ` *` JSDoc, or `/*`), matched with horizontal-whitespace separators so it cannot span a
 * newline and an incidental mention in a string literal or mid-sentence in prose cannot self-assign
 * a lane.
 */

export const LANES = ["critical", "standard", "bespoke"];

// Every ci-lane declaration that is the leading content of a comment line, capturing the raw value
// (validated against LANES by the caller so a typo is reported, not silently ignored).
const LANE_DECL = /^[ \t]*(?:\/\/|\/?\*)[ \t]*ci-lane:[ \t]*(\S+)/gm;

/**
 * Extract a guard's declared CI lane from its source.
 * @returns {{ lane: string|null, error: string|null }} lane is set iff exactly one valid lane is
 *   declared; otherwise error explains why (missing, invalid value, or conflicting declarations).
 */
export function laneOf(src) {
  const raw = [...src.matchAll(LANE_DECL)].map((m) => m[1].replace(/[.,;]+$/, ""));
  if (raw.length === 0) {
    return { lane: null, error: `no \`// ci-lane: <${LANES.join("|")}>\` marker` };
  }
  const distinct = [...new Set(raw)];
  const invalid = distinct.filter((l) => !LANES.includes(l));
  if (invalid.length) {
    return {
      lane: null,
      error: `invalid ci-lane value(s) ${invalid.join(", ")} (allowed: ${LANES.join("|")})`,
    };
  }
  if (distinct.length > 1) {
    return { lane: null, error: `conflicting ci-lane markers: ${distinct.join(", ")}` };
  }
  return { lane: distinct[0], error: null };
}
