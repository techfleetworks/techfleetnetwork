#!/usr/bin/env node
// ci-lane: bespoke
/**
 * SESSION-REVOCATION-ENFORCED-001 — server-side session revocation must stay enforced
 * at the edge, and raw GoTrue `admin.signOut(...)` must never be reintroduced as THE
 * revocation mechanism.
 *
 * WHY THIS EXISTS
 * ---------------
 * Re-audit 2026-10-30 SEC-1 / RH1 (OWASP Session Management — server-side invalidation):
 * "sign out all devices", admin revoke, and the emergency global sign-out did not
 * invalidate anything on the SERVER. The only reader of the revocation fact
 * (`public.is_session_revoked` over `public.revoked_sessions`) was the browser, in
 * `src/features/auth/services/session.service.ts`. A stolen access/refresh token used
 * directly against PostgREST or an edge function — not through our SPA — never saw that
 * check, so the "kill switch" did nothing against the exact attacker it exists for.
 *
 * The fix moved enforcement to one server owner: `requireAuthenticatedRequest` in
 * `supabase/functions/_shared/request-auth.ts` now calls `is_session_revoked` for every
 * authenticated edge call. This guard makes that enforcement structurally permanent and
 * blocks the two ways it rots:
 *
 * THE RULES
 * ---------
 *   A. CLIENT-ONLY REVOCATION IS BANNED. `_shared/request-auth.ts` MUST contain a live
 *      `.rpc("is_session_revoked", ...)` call (not only in a comment). Delete the
 *      server-side check and revocation silently reverts to client-only → fail.
 *   B. RAW `admin.signOut(` AS THE MECHANISM IS BANNED. `*.auth.admin.signOut(` calls
 *      in supabase/functions are the defect pattern SEC-1 documents (a user id passed
 *      where a JWT is required, then the error swallowed). No NEW call site may appear:
 *      only the sites that predate this guard, listed in the shrink-only grandfather
 *      `scripts/ci/session-signout-grandfather.json`, are tolerated, and the list may
 *      only shrink (its refresh-token-delete RPC replacement is prod-blocked — see the
 *      ADR). A new signOut call, or growing the grandfather vs main, fails.
 *
 * SHAPE / FAIL-CLOSED
 * -------------------
 * Bespoke reader (reads one known file + enumerates supabase/functions) — not a
 * recursive content scan, so it self-declares the bespoke-dir-reader marker below
 * rather than using the _guard.mjs harness. Fails CLOSED: a missing request-auth.ts,
 * a missing functions root, a zero-function scan, an unreadable grandfather, or an
 * unfetched base ref all exit non-zero rather than passing vacuously. Pinned by
 * src/test/smoke/check-session-revocation-enforced.smoke.test.ts.
 *
 * Test-only seams (never set in CI/prod): SESSION_REVOKE_ROOT points the scan at a
 * fixture tree; SESSION_REVOKE_BASE points the shrink check at a fixture baseline
 * instead of `git show main:`.
 *
 * ci-guard-integrity: bespoke-dir-reader — reads _shared/request-auth.ts + enumerates supabase/functions against a shrink-only grandfather (not a recursive content scan)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = process.env.SESSION_REVOKE_ROOT ? resolve(process.env.SESSION_REVOKE_ROOT) : SRC_ROOT;
const FUNCS_DIR = join(ROOT, "supabase", "functions");
const REQUIRE_AUTH = join(FUNCS_DIR, "_shared", "request-auth.ts");
const REL_ALLOWLIST = "scripts/ci/session-signout-grandfather.json";
const ALLOWLIST_PATH = join(ROOT, REL_ALLOWLIST);

const die = (msg, code = 2) => {
  console.error(`✖ check-session-revocation-enforced: ${msg}`);
  process.exit(code);
};

// Strip full-line comments so the invariant/ban can't be satisfied — or tripped — by a
// mention inside a rationale comment.
const stripComments = (src) =>
  src
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

// --- Rule A: server-side revoked check must exist in request-auth.ts -------------------------
if (!existsSync(REQUIRE_AUTH))
  die(`${REL_FROM(REQUIRE_AUTH)} not found at ${REQUIRE_AUTH}. Failing closed.`);
const REVOKED_RPC_RE = /\.rpc\(\s*["']is_session_revoked["']/;
const authSrc = stripComments(readFileSync(REQUIRE_AUTH, "utf8"));
const serverCheckPresent = REVOKED_RPC_RE.test(authSrc);

function REL_FROM(abs) {
  return abs.slice(ROOT.length + 1).replace(/\\/g, "/");
}

// --- Rule B: no raw admin.signOut( outside the shrink-only grandfather -----------------------
const SIGNOUT_RE = /\.auth\.admin\.signOut\s*\(/;
function findSignOutFns(dir) {
  const offenders = new Set();
  let scanned = 0;
  if (!existsSync(dir)) return { offenders, scanned };
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name === "_shared") continue;
    const indexPath = join(dir, ent.name, "index.ts");
    if (!existsSync(indexPath)) continue;
    scanned++;
    const code = stripComments(readFileSync(indexPath, "utf8"));
    if (SIGNOUT_RE.test(code)) offenders.add(ent.name);
  }
  return { offenders, scanned };
}

if (!existsSync(FUNCS_DIR)) die(`supabase/functions not found at ${FUNCS_DIR}. Failing closed.`);
const { offenders, scanned } = findSignOutFns(FUNCS_DIR);
if (scanned === 0)
  die(`scanned 0 edge functions under ${FUNCS_DIR} — path drift? Failing closed.`);

// --- Load the shrink-only grandfather --------------------------------------------------------
if (!existsSync(ALLOWLIST_PATH))
  die(`grandfather allowlist not found at ${ALLOWLIST_PATH}. Failing closed.`);
let allow;
try {
  allow = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
} catch (e) {
  die(`grandfather allowlist is not valid JSON (${e.message}).`);
}
const allowSet = new Set(Array.isArray(allow) ? allow : allow.functions);
if (!(allowSet instanceof Set) || [...allowSet].some((x) => typeof x !== "string"))
  die(`grandfather allowlist must be a JSON array of function names (or { "functions": [...] }).`);

const newOffenders = [...offenders].filter((fn) => !allowSet.has(fn)).sort();
const stale = [...allowSet].filter((fn) => !offenders.has(fn)).sort();

// Shrink-only vs the base branch — the grandfather may not GROW.
function baseAllowlist() {
  if (process.env.SESSION_REVOKE_BASE) {
    const parsed = JSON.parse(readFileSync(process.env.SESSION_REVOKE_BASE, "utf8"));
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
    "cannot resolve the base branch (origin/main) to diff the grandfather — CI must checkout with " +
      "fetch-depth: 0. Failing closed rather than passing without a baseline."
  );
} else if (base === "introduction") {
  console.log(
    "::notice::[session-revocation-enforced] base has no grandfather yet — treating as the introducing change."
  );
} else {
  grown = [...allowSet].filter((fn) => !base.has(fn)).sort();
}

const problems = [];
if (!serverCheckPresent)
  problems.push([
    `server-side revocation check missing from ${REL_FROM(REQUIRE_AUTH)}:`,
    [`no live \`.rpc("is_session_revoked", ...)\` call in requireAuthenticatedRequest`],
    `Revocation must be enforced on the server for EVERY authenticated edge call, not only in the ` +
      `SPA. Restore the is_session_revoked check (SEC-1 / RH1). A comment mention does not count.`,
  ]);
if (newOffenders.length)
  problems.push([
    `${newOffenders.length} edge function(s) call raw admin.auth.admin.signOut( and are not grandfathered:`,
    newOffenders,
    `Raw signOut is not a working revocation mechanism (SEC-1: a user id is not a JWT, and the error ` +
      `is swallowed). Write the revoked_sessions row through the revocation owner instead of relying on signOut.`,
  ]);
if (grown.length)
  problems.push([
    `${grown.length} name(s) were ADDED to ${REL_ALLOWLIST} vs main — the grandfather may only shrink:`,
    grown,
    `Do not allowlist a new signOut call site; route revocation through the owner.`,
  ]);
if (stale.length)
  problems.push([
    `${stale.length} grandfather entr(y/ies) no longer call admin.signOut( — remove them:`,
    stale,
    `Delete these from ${REL_ALLOWLIST}; the list must track only sites that STILL need migrating.`,
  ]);

if (problems.length) {
  console.error(`✖ check-session-revocation-enforced: SESSION-REVOCATION-ENFORCED-001 violation(s):`);
  for (const [title, items, fix] of problems) {
    console.error(`\n  ${title}`);
    for (const it of items) console.error(`    - ${it}`);
    console.error(`  ${fix}`);
  }
  process.exit(1);
}

console.log(
  `✓ check-session-revocation-enforced: OK — server-side is_session_revoked check present in ` +
    `${REL_FROM(REQUIRE_AUTH)}; ${scanned} edge functions scanned; ` +
    `${offenders.size} still call raw admin.signOut( (all grandfathered, shrink-only).`
);
process.exit(0);
