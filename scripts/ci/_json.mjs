/**
 * Shared BOM-tolerant JSON reader for the CI guards.
 *
 * A UTF-8 BOM (bytes EF BB BF, code point U+FEFF) at the start of a file makes JSON.parse throw
 * ("Unexpected token"). check-no-bom.mjs is the STRUCTURAL defense — it forbids a committed BOM in
 * any tracked text file, so one can never reach these readers via the repo. This helper is the
 * belt-and-braces second layer for the guards that parse the hand/tool-edited ratchet + allowlist
 * JSON: a developer running a guard LOCALLY against a file they just BOM'd (PowerShell
 * `Set-Content -Encoding utf8` / `>` add one on Windows) gets a correct read instead of a confusing
 * crash, before check-no-bom flags it in CI.
 *
 * Underscore-prefixed = a shared harness module, not a guard: it is excluded from the guard scans
 * (check-ci-guard-integrity / check-guards-wired / check-guard-has-test) by construction, so it
 * needs no wiring and no test of its own; its behavior is exercised through its callers. The strip
 * is done by comparing the first code point to 0xFEFF — deliberately no literal BOM byte and no
 * \u escape in the source, so this file (whose whole job is BOMs) carries none itself.
 */
import { readFileSync } from "node:fs";

/** JSON.parse(readFileSync(path, "utf8")) that tolerates a single leading UTF-8 BOM (U+FEFF). */
export const readJson = (path) => {
  const text = readFileSync(path, "utf8");
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
};
