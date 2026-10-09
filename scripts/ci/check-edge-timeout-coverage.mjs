#!/usr/bin/env node
// ci-lane: standard
/**
 * EDGE-TIMEOUT-COVERAGE-001 — every browser-invoked edge function that calls the
 * Discord API through `discordFetch` must declare a client timeout budget in
 * src/lib/edge/edge-timeouts.ts (EDGE_FUNCTION_TIMEOUTS_MS).
 *
 * WHY THIS EXISTS
 * ---------------
 * `invokeEdge` (src/lib/edge/invokeEdge.ts) applies an 8s DEFAULT client timeout to
 * every call that isn't registered. `discordFetch` (supabase/functions/_shared/
 * discord-fetch.ts) retries with exponential backoff and honors a 429 `Retry-After`
 * for up to 15s PER retry — so a live Discord call can easily run past 8s. When it
 * does, the browser aborts with `TimeoutError` while the bot keeps working: the user
 * sees "couldn't get an invite link" / "couldn't connect Discord" on a call that was
 * actually succeeding. This is the exact failure that broke the Discord-connect invite
 * flow — `generate-discord-invite` was migrated to `invokeEdge` (raw-invoke burn-down,
 * ADR-0028) without a registry entry, silently inheriting the 8s cap.
 *
 * A per-call fix does not travel: the next caller of the same function re-inherits the
 * 8s bug. The budget belongs to the FUNCTION, so it is registered once in
 * EDGE_FUNCTION_TIMEOUTS_MS and every call site inherits it. This guard ties the two
 * contracts together mechanically: a browser-invoked discordFetch function that is NOT
 * registered fails the gate, so the class cannot silently recur.
 *
 * SHAPE
 * -----
 * A bespoke cross-reference reader: it correlates `invokeEdge(...)` call sites under
 * src/ with the discordFetch usage of supabase/functions/<name>/ and the registry in
 * src/lib/edge/edge-timeouts.ts — not a single-root content scan. It fails CLOSED: a
 * missing src/ or supabase/functions/ root, an unreadable/keyless registry, or zero
 * discovered call sites exits non-zero rather than passing vacuously. Pinned by
 * src/test/smoke/check-edge-timeout-coverage.smoke.test.ts.
 *
 * ci-guard-integrity: bespoke-dir-reader — cross-references src/ invokeEdge call sites with supabase/functions discordFetch usage + the timeout registry (not a per-file content scan)
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root = this guard's own location (cwd-independent; fileURLToPath, never
// new URL().pathname — that returns "/C:/…" on Windows and resolve() doubles it).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_DIR = join(ROOT, "src");
const FUNCS_DIR = join(ROOT, "supabase", "functions");
const REGISTRY = join(SRC_DIR, "lib", "edge", "edge-timeouts.ts");

const die = (msg, code = 2) => {
  console.error(`✖ check-edge-timeout-coverage: ${msg}`);
  process.exit(code);
};

if (!existsSync(SRC_DIR)) die(`src/ not found at ${SRC_DIR}. Failing closed.`);
if (!existsSync(FUNCS_DIR)) die(`supabase/functions not found at ${FUNCS_DIR}. Failing closed.`);

// --- Parse the registered function names from EDGE_FUNCTION_TIMEOUTS_MS ----------------------
let registrySrc;
try {
  registrySrc = readFileSync(REGISTRY, "utf8");
} catch (e) {
  die(
    `cannot read the timeout registry ${relative(ROOT, REGISTRY)}: ${e.message}. Failing closed.`
  );
}
// Keys look like:  "generate-discord-invite": 15_000,   (only inside the object literal, but the
// keys are distinctive enough; a full-line-comment strip prevents matching an example in prose.)
const registryCode = registrySrc
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");
const registered = new Set(
  [...registryCode.matchAll(/["']([a-z0-9][a-z0-9-]*)["']\s*:\s*[0-9_]+/gi)].map((m) => m[1])
);
if (registered.size === 0) {
  die(
    `parsed 0 keys from EDGE_FUNCTION_TIMEOUTS_MS — the registry shape changed? Failing closed.`,
    1
  );
}

// --- Collect edge functions invoked from the browser via the invokeEdge wrapper -------------
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
    `found 0 invokeEdge(...) call sites under src/ — the detector regex likely broke. Failing closed.`,
    1
  );
}

// --- A function "uses discordFetch" if any non-test .ts in its dir calls it ------------------
function usesDiscordFetch(fnDir) {
  let entries;
  try {
    entries = readdirSync(fnDir);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (!name.endsWith(".ts") || isTestFile(name)) continue;
    try {
      if (readFileSync(join(fnDir, name), "utf8").includes("discordFetch(")) return true;
    } catch {
      /* unreadable file — skip, don't crash the scan */
    }
  }
  return false;
}

const violations = [];
let checked = 0;
let unresolved = 0;

for (const [fn, callSite] of [...targets].sort()) {
  const fnDir = join(FUNCS_DIR, fn);
  if (!existsSync(fnDir)) {
    // Dynamically-named/renamed target — another guard owns existence. Skip, don't false-flag.
    unresolved++;
    continue;
  }
  if (!usesDiscordFetch(fnDir)) continue; // not a live Discord call — 8s default is fine
  checked++;
  if (!registered.has(fn)) {
    violations.push({ fn, callSite });
  }
}

if (checked === 0) {
  console.log(
    `✓ check-edge-timeout-coverage: OK — no browser-invoked discordFetch functions among ${targets.size} invokeEdge target(s) (${unresolved} unresolved/dynamic name(s) skipped).`
  );
  process.exit(0);
}

if (violations.length) {
  console.error(
    `✖ check-edge-timeout-coverage: ${violations.length} browser-invoked edge function(s) call the Discord API ` +
      `via discordFetch but are NOT in EDGE_FUNCTION_TIMEOUTS_MS — they inherit the 8s default and will abort ` +
      `the client mid-call under Discord rate-limiting (false "it failed"):`
  );
  for (const v of violations) console.error(`  - ${v.fn}  (invoked at ${v.callSite})`);
  console.error(
    `\nFix: register a budget in src/lib/edge/edge-timeouts.ts (one line, all call sites inherit it) —\n` +
      `    "${violations[0].fn}": 15_000,   // above the function's server-side worst case\n` +
      `Do NOT pass timeoutMs at the call site: the budget belongs to the function, not the caller.`
  );
  process.exit(1);
}

console.log(
  `✓ check-edge-timeout-coverage: OK — all ${checked} browser-invoked discordFetch function(s) declare a timeout budget ` +
    `(${targets.size} invokeEdge target name(s); ${unresolved} unresolved/dynamic name(s) skipped).`
);
process.exit(0);
