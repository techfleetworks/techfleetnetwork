#!/usr/bin/env node
/**
 * EDGE-CORS-TRACE-001 — every edge function invoked from the browser must allow the
 * `x-trace-id` CORS preflight header.
 *
 * WHY THIS EXISTS
 * ---------------
 * The frontend calls edge functions through the `invokeEdge` wrapper (src/lib/edge/invokeEdge.ts),
 * which attaches an `x-trace-id` request header to EVERY call. A browser therefore lists
 * `x-trace-id` in the CORS preflight (Access-Control-Request-Headers). If the target function's
 * `Access-Control-Allow-Headers` does not include `x-trace-id`, the browser BLOCKS the POST and
 * supabase-js throws `FunctionsFetchError` ("Failed to send a request to the Edge Function") — a
 * silent failure with ZERO edge-side logs (the function never runs). This exact drift broke the
 * Recruiting Center status update and 7 other features when their callers migrated to invokeEdge
 * (the "invoke burn-down"): the functions hand-rolled a CORS block that predated x-trace-id.
 *
 * The shared owner supabase/functions/_shared/http.ts already lists x-trace-id / x-request-id
 * (supabase/functions/CLAUDE.md: "inline CORS is banned … hand-rolled blocks that omit them
 * silently fail preflight"). This guard ties the two contracts together mechanically so the drift
 * cannot recur: for every function named in an `invokeEdge(...)` call site under src/, its CORS
 * must allow x-trace-id — either by sourcing CORS from _shared/http.ts, or by an inline
 * Access-Control-Allow-Headers list that already contains x-trace-id.
 *
 * SHAPE
 * -----
 * This is a bespoke cross-reference reader (it correlates src/ call sites with
 * supabase/functions/ CORS), not a single-root content scan — so it is a named exception in
 * check-ci-guard-integrity.mjs's BESPOKE_DIR_READERS. It fails CLOSED: a missing src/ or
 * supabase/functions/ root, an unreadable or x-trace-id-less _shared/http.ts owner, or zero
 * discovered call sites exits non-zero rather than passing vacuously. Pinned by
 * src/test/smoke/check-edge-cors-trace.smoke.test.ts.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root = this guard's own location (cwd-independent; fileURLToPath, never new URL().pathname
// — that returns "/C:/…" on Windows and resolve() doubles it — see check-ci-guard-integrity.mjs).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_DIR = join(ROOT, "src");
const FUNCS_DIR = join(ROOT, "supabase", "functions");
const HTTP_OWNER = join(FUNCS_DIR, "_shared", "http.ts");
const TRACE_HEADER = "x-trace-id";

const die = (msg, code = 2) => {
  console.error(`✖ check-edge-cors-trace: ${msg}`);
  process.exit(code);
};

if (!existsSync(SRC_DIR)) die(`src/ not found at ${SRC_DIR}. Failing closed.`);
if (!existsSync(FUNCS_DIR)) die(`supabase/functions not found at ${FUNCS_DIR}. Failing closed.`);

// The shared CORS owner must ITSELF allow x-trace-id — otherwise "sources CORS from the owner"
// is not a valid compliance proof. Verify up front and fail closed on owner drift.
let ownerSrc;
try {
  ownerSrc = readFileSync(HTTP_OWNER, "utf8");
} catch (e) {
  die(
    `cannot read the shared CORS owner ${relative(ROOT, HTTP_OWNER)}: ${e.message}. Failing closed.`
  );
}
// Strip full-line comments before the check: http.ts names x-trace-id in BOTH its
// rationale comment AND the ALLOWED_REQUEST_HEADERS value, so a whole-file substring
// would pass falsely if a future edit dropped it from the value but left the comment.
const ownerCode = ownerSrc
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");
if (!ownerCode.toLowerCase().includes(TRACE_HEADER)) {
  die(
    `the shared CORS owner supabase/functions/_shared/http.ts no longer lists "${TRACE_HEADER}" in code ` +
      `(only in a comment, or not at all) — every function relying on it would fail preflight. Failing closed.`
  );
}

// --- Collect the edge functions invoked from the browser via the invokeEdge wrapper ---------
// (Raw supabase.functions.invoke is intentionally NOT matched: it does not attach x-trace-id, so
// its targets have no such CORS requirement. The no-raw-functions-invoke lint is migrating those
// to invokeEdge anyway. `\binvokeEdge` matches both `invokeEdge(` and `sessionPort.invokeEdge(`.)
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const isTestFile = (n) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(n);
const isTestDir = (n) => n === "test" || n === "tests" || n === "__tests__";
const TARGET_RE = /\binvokeEdge\s*(?:<[^>]*>)?\s*\(\s*(['"`])([^'"`]+)\1/g;

function walkSrc(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (name === "node_modules" || isTestDir(name)) continue;
      walkSrc(full, out);
    } else if (
      EXTS.has(full.slice(full.lastIndexOf("."))) &&
      !isTestFile(name) &&
      !full.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

const targets = new Map(); // function name -> first "src/rel:line" call site
for (const file of walkSrc(SRC_DIR)) {
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = TARGET_RE.exec(text))) {
    const fn = m[2];
    if (!targets.has(fn)) {
      const line = text.slice(0, m.index).split("\n").length;
      targets.set(fn, `${relative(ROOT, file).replace(/\\/g, "/")}:${line}`);
    }
  }
}

if (targets.size === 0) {
  die(
    `found 0 invokeEdge(...) call sites under src/ — the detector regex likely broke. ` +
      `Failing closed rather than passing vacuously.`,
    1
  );
}

// --- For each target, confirm its CORS allows x-trace-id -------------------------------------
// Compliance: (a) any inline Access-Control-Allow-Headers list it declares must contain
// x-trace-id, AND (b) it must either import CORS from _shared/http.ts (verified above to include
// x-trace-id) or declare such an inline list. A function that hand-rolls a list WITHOUT x-trace-id
// — the exact bug — fails (a); one that declares no CORS source at all fails (b).
const INLINE_ALLOW_RE = /["']Access-Control-Allow-Headers["']\s*:\s*(["'])([\s\S]*?)\1/gi;
const IMPORTS_HTTP_OWNER = /from\s+["'][^"']*_shared\/http\.ts["']/;

const violations = [];
let checked = 0;
let unresolved = 0;

for (const [fn, callSite] of [...targets].sort()) {
  const indexPath = join(FUNCS_DIR, fn, "index.ts");
  if (!existsSync(indexPath)) {
    // The function's existence is another guard's concern (edge-function-coverage); a
    // dynamically-named or renamed target simply isn't verifiable here — skip, don't false-flag.
    unresolved++;
    continue;
  }
  checked++;
  let src;
  try {
    src = readFileSync(indexPath, "utf8");
  } catch (e) {
    die(`cannot read supabase/functions/${fn}/index.ts: ${e.message}. Failing closed.`);
  }

  const inline = [...src.matchAll(INLINE_ALLOW_RE)].map((mm) => mm[2]);
  const inlineAllOk = inline.every((v) => v.toLowerCase().includes(TRACE_HEADER)); // true when empty
  const importsOwner = IMPORTS_HTTP_OWNER.test(src);

  if (inlineAllOk && (importsOwner || inline.length > 0)) continue; // compliant

  violations.push({
    fn,
    callSite,
    why: !inlineAllOk
      ? `inline Access-Control-Allow-Headers omits "${TRACE_HEADER}"`
      : `no CORS from _shared/http.ts and no inline allow-list`,
  });
}

// Fail closed if every target name failed to resolve to a function directory (mass rename,
// or a shift to dynamic/template-literal names the regex can't capture): we verified nothing.
if (checked === 0) {
  die(
    `all ${targets.size} invokeEdge target name(s) were unresolved (no matching ` +
      `supabase/functions/<name>/index.ts) — mass rename or dynamic names? ` +
      `Failing closed rather than verifying nothing.`,
    1
  );
}

if (violations.length) {
  console.error(
    `✖ check-edge-cors-trace: ${violations.length} browser-invoked edge function(s) do not allow the ` +
      `"${TRACE_HEADER}" preflight header — the browser blocks the POST (FunctionsFetchError, no edge logs):`
  );
  for (const v of violations) console.error(`  - ${v.fn}  (invoked at ${v.callSite}) — ${v.why}`);
  console.error(
    `\nFix: source CORS from the shared owner —\n` +
      `    import { corsHeaders } from "../_shared/http.ts";   // or handleCors / jsonResponse\n` +
      `instead of a hand-rolled block. It already lists ${TRACE_HEADER} + x-request-id. ` +
      `See supabase/functions/CLAUDE.md ("inline CORS is banned").`
  );
  process.exit(1);
}

console.log(
  `✓ check-edge-cors-trace: OK — ${checked} browser-invoked edge function(s) all allow "${TRACE_HEADER}" ` +
    `(${targets.size} invokeEdge target name(s); ${unresolved} unresolved/dynamic name(s) skipped).`
);
process.exit(0);
