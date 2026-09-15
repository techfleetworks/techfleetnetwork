#!/usr/bin/env node
/**
 * NO-INLINE-CORS-001 — edge functions must source CORS from the shared owner, never hand-roll it.
 *
 * WHY THIS EXISTS
 * ---------------
 * A hand-rolled `Access-Control-Allow-Headers` block is how the recruiting-center outage class
 * happens: the moment a browser caller migrates to `invokeEdge` (which attaches `x-trace-id`), any
 * function whose inline allow-list omits that header fails preflight — the browser blocks the POST,
 * supabase-js throws `FunctionsFetchError`, and NOTHING is logged edge-side (the function never
 * runs). `check-edge-cors-trace.mjs` catches this for functions that are ALREADY invokeEdge targets;
 * this guard closes the door one step earlier, for EVERY function, so a function cannot carry a
 * latent inline-CORS bomb that detonates the day its client converts. Together they make the drift
 * structurally impossible, not merely caught late.
 *
 * THE RULE
 * --------
 * Any supabase/functions/<name>/index.ts that sets `Access-Control-Allow-Headers` MUST import CORS
 * from `../_shared/http.ts` (the shared owner, which already lists x-trace-id + x-request-id — see
 * supabase/functions/CLAUDE.md, "inline CORS is banned"). A function may still spread/extend that
 * shared set for a bespoke header (e.g. send-community-agreement-trigger merges x-internal-secret)
 * — that is compliant BECAUSE it imports the owner. A plain hand-rolled string literal with no such
 * import is the violation.
 *
 * SHRINK-ONLY GRANDFATHER
 * -----------------------
 * scripts/ci/no-inline-cors-grandfather.json lists the function names still carrying inline CORS
 * that predate this guard. The list may only SHRINK:
 *   - a NEW inline-CORS function (not on main's list) fails — you cannot add one, nor allowlist it
 *     past this guard (the vs-main check below blocks new entries);
 *   - a grandfathered function that has since migrated (now compliant) MUST be removed from the list
 *     (a stale entry fails), so the backlog can only burn down toward zero.
 *
 * SHAPE / FAIL-CLOSED
 * -------------------
 * Bespoke directory reader (readdirSync over supabase/functions) — a named exception in
 * check-ci-guard-integrity.mjs's BESPOKE_DIR_READERS. Fails CLOSED: a missing functions root, an
 * unreadable grandfather file, a zero-function scan, or (for the shrink check) an unfetched base
 * ref all exit non-zero rather than passing vacuously. Pinned by
 * src/test/smoke/check-no-inline-cors.smoke.test.ts. See ADR-0042 and decisions.md §5.
 *
 * Test-only seams (never set in CI/prod): NO_INLINE_CORS_ROOT points the scan at a fixture tree;
 * NO_INLINE_CORS_BASE points the shrink check at a fixture baseline instead of `git show main:`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FUNCS_DIR = process.env.NO_INLINE_CORS_ROOT
  ? resolve(process.env.NO_INLINE_CORS_ROOT)
  : join(ROOT, "supabase", "functions");
const REL_ALLOWLIST = "scripts/ci/no-inline-cors-grandfather.json";
const ALLOWLIST_PATH = join(ROOT, REL_ALLOWLIST);

const ALLOW_HEADER_RE = /Access-Control-Allow-Headers/i;
const IMPORTS_HTTP_OWNER = /from\s+["'][^"']*_shared\/http\.ts["']/;

const die = (msg, code = 2) => {
  console.error(`✖ check-no-inline-cors: ${msg}`);
  process.exit(code);
};

if (!existsSync(FUNCS_DIR)) die(`supabase/functions not found at ${FUNCS_DIR}. Failing closed.`);

// Strip full-line comments so a header named only in a rationale comment is not flagged, and a
// function that dropped the real value but kept the comment is not passed falsely.
const stripComments = (src) =>
  src
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

/** The current set of function names whose index.ts hand-rolls CORS without importing the owner. */
function findInlineCorsFns(dir) {
  const offenders = new Set();
  let scanned = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory() || name.name === "_shared") continue;
    const indexPath = join(dir, name.name, "index.ts");
    if (!existsSync(indexPath)) continue;
    scanned++;
    const code = stripComments(readFileSync(indexPath, "utf8"));
    if (ALLOW_HEADER_RE.test(code) && !IMPORTS_HTTP_OWNER.test(code)) offenders.add(name.name);
  }
  return { offenders, scanned };
}

const { offenders, scanned } = findInlineCorsFns(FUNCS_DIR);
if (scanned === 0)
  die(
    `scanned 0 edge functions under ${FUNCS_DIR} — path drift? Failing closed rather than passing vacuously.`
  );

// --- Load the grandfather allowlist ----------------------------------------------------------
if (!existsSync(ALLOWLIST_PATH))
  die(`grandfather allowlist not found at ${ALLOWLIST_PATH}. Failing closed.`);
let allow;
try {
  allow = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
} catch (e) {
  die(`grandfather allowlist is not valid JSON (${e.message}).`);
}
const allowSet = new Set(Array.isArray(allow) ? allow : allow.functions);
if (!allowSet || !(allowSet instanceof Set))
  die(`grandfather allowlist must be a JSON array of function names (or { "functions": [...] }).`);

// --- 1) New / unallowlisted inline-CORS functions --------------------------------------------
const newOffenders = [...offenders].filter((fn) => !allowSet.has(fn)).sort();

// --- 2) Stale grandfather entries (migrated → now compliant, or renamed away) -----------------
const stale = [...allowSet].filter((fn) => !offenders.has(fn)).sort();

// --- 3) Shrink-only: the allowlist may not GROW vs the base branch ----------------------------
function baseAllowlist() {
  if (process.env.NO_INLINE_CORS_BASE) {
    const parsed = JSON.parse(readFileSync(process.env.NO_INLINE_CORS_BASE, "utf8"));
    return new Set(Array.isArray(parsed) ? parsed : parsed.functions);
  }
  const refExists = (r) => {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", r], { cwd: ROOT, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };
  const ref = ["origin/main", "main"].find(refExists);
  if (!ref) return null; // base not fetched
  try {
    const txt = execFileSync("git", ["show", `${ref}:${REL_ALLOWLIST}`], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const parsed = JSON.parse(txt);
    return new Set(Array.isArray(parsed) ? parsed : parsed.functions);
  } catch {
    return "introduction"; // ref exists but the file isn't in it yet → this PR introduces it
  }
}
const base = baseAllowlist();
let grown = [];
if (base === null) {
  die(
    "cannot resolve the base branch (origin/main) to diff the grandfather allowlist — CI must " +
      "checkout with fetch-depth: 0. Failing closed rather than passing without a baseline."
  );
} else if (base === "introduction") {
  console.log(
    "::notice::[no-inline-cors] base has no grandfather file yet — treating as the introducing change."
  );
} else {
  grown = [...allowSet].filter((fn) => !base.has(fn)).sort();
}

const problems = [];
if (newOffenders.length)
  problems.push([
    `${newOffenders.length} edge function(s) hand-roll CORS without importing the shared owner:`,
    newOffenders,
    `Fix: replace the inline block with \`import { corsHeaders } from "../_shared/http.ts";\` ` +
      `(it lists x-trace-id + x-request-id). See supabase/functions/CLAUDE.md.`,
  ]);
if (grown.length)
  problems.push([
    `${grown.length} name(s) were ADDED to ${REL_ALLOWLIST} vs main — the grandfather may only shrink:`,
    grown,
    `Migrate the function to the shared owner instead of allowlisting new inline CORS.`,
  ]);
if (stale.length)
  problems.push([
    `${stale.length} grandfather entr(y/ies) no longer hand-roll CORS (migrated or renamed) — remove them:`,
    stale,
    `Delete these from ${REL_ALLOWLIST}; the list must track only functions that STILL need migrating.`,
  ]);

if (problems.length) {
  console.error(`✖ check-no-inline-cors: NO-INLINE-CORS-001 violation(s):`);
  for (const [title, items, fix] of problems) {
    console.error(`\n  ${title}`);
    for (const it of items) console.error(`    - ${it}`);
    console.error(`  ${fix}`);
  }
  process.exit(1);
}

console.log(
  `✓ check-no-inline-cors: OK — ${scanned} edge functions scanned; ` +
    `${offenders.size} still hand-roll CORS (all grandfathered, shrink-only); ` +
    `${scanned - offenders.size} source CORS from the shared owner.`
);
process.exit(0);
