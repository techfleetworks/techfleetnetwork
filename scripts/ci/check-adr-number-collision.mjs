#!/usr/bin/env node
// ci-lane: bespoke
/**
 * ADR-NUMBER-001 guard: no two ADRs in docs/adr/ may collide on their identifier.
 *
 * Two identifier forms are allowed:
 *
 *   1. LEGACY sequential  `<NNNN>-<slug>.md`   (4-digit, e.g. 0042-...) — FROZEN.
 *   2. DATE-based         `<YYYYMMDD>-<slug>.md` (8-digit, e.g. 20261009-...) — PREFERRED.
 *
 * Why two forms: an ADR's identifier is its identity — cross-references
 * ("see ADR-0012"), links, and the historical record key on it. A duplicate makes
 * every such reference ambiguous and silently breaks `docs/adr/*.md` links.
 *
 * The sequential scheme is structurally collision-PRONE and was the recurring
 * failure here: parallel PRs each grab "the next number" against a base that lacks
 * the other's ADR, both go green, then collide on merge (it happened on `main` for
 * 0009/0013/0014/0016, and again every time a feature branch sat open while others
 * merged). A shared counter allocated at author time cannot be made collision-free.
 *
 * The date scheme fixes this at the root — the SAME way DB migrations already do it
 * (`YYYYMMDDHHMMSS_...`, see check-migration-version-collision.mjs). Two authors on
 * different branches almost never pick the same day AND the same slug, and if they
 * share a day they differ by slug, so the filenames stay unique with no coordination.
 * Date-based ADRs are therefore NOT grouped by their numeric prefix (many may share a
 * date); only the full filename must be unique, which the filesystem already enforces.
 *
 * On a `pull_request` run CI checks out the PR merged into base, so this scan sees the
 * PR's ADR alongside base's and catches a cross-PR collision at PR time (provided
 * "require branches up to date before merging" is on).
 *
 * Fix when it fires: name NEW ADRs with a date prefix — `<YYYYMMDD>-<slug>.md`
 * (today's date). Do NOT mint a new 4-digit number — the sequential space is frozen.
 * If you must touch a legacy number, pick one that is unused; never reuse a number.
 *
 * GRANDFATHERED: the legacy pairs that predate this guard are allowed to remain
 * doubled (renumbering merged, cross-referenced ADRs would break existing links). The
 * guard blocks only NEW collisions — a fresh legacy number, or a THIRD file on a
 * grandfathered number. As these are cleaned up, remove them from the set below.
 *
 * ci-guard-integrity: bespoke-dir-reader — filename collision detector
 */
import { readdirSync } from "node:fs";

const DIR = "docs/adr";

// Legacy 4-digit number -> how many files are historically allowed to share it
// (these predate the guard). The date scheme has no such list — it does not collide.
const GRANDFATHERED = new Map([
  ["0013", 2], // 0013-consent-ledger-source-of-truth + 0013-fleety-retrieval-lexical-fallback
  ["0014", 2], // 0014-ghost-email-octopus-sync-topology + 0014-fleety-file-uploads
  ["0016", 2], // 0016-email-tiering-and-notify-announcements-retirement + 0016-tal-9000-future-mode-terminal
]);

/** True if an 8-digit string is a plausible YYYYMMDD date (guards against 00000001-style dodges). */
function isPlausibleDate(s) {
  const y = +s.slice(0, 4);
  const mo = +s.slice(4, 6);
  const d = +s.slice(6, 8);
  return y >= 2020 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
} catch (e) {
  console.error(`❌ ADR-NUMBER-001: cannot read ${DIR}: ${e.message}`);
  process.exit(1);
}

const byNumber = new Map(); // legacy 4-digit number -> [files]
const dateAdrs = []; // date-based ADRs (collision-free; filename-unique by construction)
const malformed = [];

for (const f of files) {
  if (f.toLowerCase() === "readme.md") continue; // the index, not an ADR
  // Date-based IDs first — an 8-digit prefix is NOT four digits followed by a hyphen,
  // so it would otherwise be flagged malformed. A date ADR is unique by filename, so it
  // is never grouped for collision; only validate the date is real.
  const d8 = f.match(/^([0-9]{8})-/);
  if (d8) {
    if (!isPlausibleDate(d8[1])) {
      malformed.push(f);
      continue;
    }
    dateAdrs.push(f);
    continue;
  }
  const m = f.match(/^([0-9]{4})-/);
  if (!m) {
    malformed.push(f);
    continue;
  }
  const num = m[1];
  if (!byNumber.has(num)) byNumber.set(num, []);
  byNumber.get(num).push(f);
}

if (malformed.length) {
  console.error(
    "❌ ADR-NUMBER-001: ADR filenames must be `<YYYYMMDD>-<slug>.md` (preferred) or a legacy " +
      "`<NNNN>-<slug>.md` 4-digit prefix:"
  );
  for (const f of malformed) console.error(`  - ${f}`);
  process.exit(1);
}

// A collision is any LEGACY number over its allowed count (1, or the grandfathered count).
// Date-based ADRs cannot collide (the filesystem already guarantees unique filenames), so
// they are never in this set — that is the whole point of the date scheme.
const violations = [...byNumber.entries()].filter(
  ([num, fs]) => fs.length > (GRANDFATHERED.get(num) ?? 1)
);

if (violations.length) {
  console.error("❌ ADR-NUMBER-001: duplicate ADR numbers (references become ambiguous):");
  for (const [num, fs] of violations) {
    const allowed = GRANDFATHERED.get(num);
    console.error(
      `  ${num}${allowed ? ` (grandfathered for ${allowed}, found ${fs.length})` : ""}:`
    );
    for (const f of fs) console.error(`    - ${f}`);
  }
  console.error(
    `\nFix: name your NEW ADR with a date prefix — <YYYYMMDD>-<slug>.md (today's date) — not a ` +
      `4-digit number. The sequential space is frozen because parallel branches collide on it. ` +
      `Update any references to the ADR you are renaming. Never reuse a number.`
  );
  process.exit(1);
}

const grandfathered = [...GRANDFATHERED.keys()].filter((n) => byNumber.has(n)).length;
console.log(
  `✓ ADR-NUMBER-001: ${byNumber.size + dateAdrs.length} ADRs ` +
    `(${dateAdrs.length} date-based, ${byNumber.size} legacy numbered), no number collisions` +
    (grandfathered ? ` (${grandfathered} grandfathered pair(s) still present)` : "")
);
