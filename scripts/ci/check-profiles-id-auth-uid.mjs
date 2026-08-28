#!/usr/bin/env node
// Audit T-A guard: `profiles.id` is a random PK; the auth identity column is
// `user_id` (== auth.uid()). Confusing them silently no-ops identity
// lookups/updates — consent was never persisted (record_policy_ack), GDPR
// anonymize was skipped (freescout-sync-customer), tickets went invisible (C3).
// This flags the two recurring shapes so they can't regress:
//   1. Edge fns:  `.from("profiles") … .eq("id", <authUid>)`  → use .eq("user_id", …)
//   2. Post-cutoff migrations: a `public.profiles` statement with `id = auth.uid()`.
//
// The edge-fn check deliberately IGNORES `.eq("id", <expr>.id)` — an argument
// that is itself a `.id` property access (e.g. `prof.id`, `row.id`) is a genuine
// profiles-PK lookup after the row was already resolved by user_id, not an
// auth-uid confusion. The bug shape is `.eq("id", authUid)` where the value is
// the caller's uid (`user.id` from getUser(), a `userId` var, `parsed.data.userId`).
//
// Escape hatch (any other case where `id` genuinely IS the intended key): put
// `@profiles-id-ok` on the flagged line or the line above it (migrations: anywhere in the file).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = process.cwd();
const HATCH = /@profiles-id-ok/;
// Migrations on/before this stamp are immutable, already-applied history (the
// original record_policy_ack bug lives in a pre-cutoff file and is fixed by a
// post-cutoff CREATE OR REPLACE). Only new/edited migrations are enforced.
const BASELINE_CUTOFF = "20260809182000";

function walk(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (e) {
    // Fail closed: a scan root we cannot read is a moved/renamed path, not "clean".
    console.error(`check-profiles-id-auth-uid: cannot read directory ${dir}: ${e.message}`);
    process.exit(2);
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

let violations = 0;
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");

// `.eq("id", ARG)` — capture ARG so we can tell an auth-uid confusion from a
// legitimate profiles-PK lookup (`prof.id`). getUser() returns `user.id`, which
// IS the auth uid despite ending in `.id`, so that specific form still flags.
const EQ_ID_RE = /\.eq\(\s*["']id["']\s*,\s*([^,)]+?)\s*\)/;
const PK_PROP_RE = /\.id$/; // arg is `<expr>.id` — a resolved-row PK reference
const USER_ID_PROP_RE = /^(user|data\.user|\{?\s*user)\b.*\.id$/; // getUser().data.user.id / user.id

let scanned = 0;

// 1. Edge functions — `.from("profiles")` then `.eq("id", …)` in the same query.
const edgeFiles = walk(join(ROOT, "supabase", "functions"), [".ts"]);
for (const file of edgeFiles) {
  if (file.endsWith(".test.ts")) continue;
  scanned++;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/\.from\(\s*["']profiles["']\s*\)/.test(lines[i])) continue;
    // Start at i so a single-line chain (`.from("profiles")…​.eq("id", x)`) is
    // caught, not just multi-line chains where .eq is on a following line.
    for (let j = i; j <= Math.min(i + 8, lines.length - 1); j++) {
      const l = lines[j];
      const m = l.match(EQ_ID_RE);
      if (m && !HATCH.test(l) && !HATCH.test(lines[j - 1] ?? "")) {
        const arg = m[1].trim();
        // A `<expr>.id` PK reference is fine EXCEPT the `user.id`/`…user.id` form,
        // which is the auth uid and thus the exact confusion we're guarding.
        const isPkProp = PK_PROP_RE.test(arg) && !USER_ID_PROP_RE.test(arg);
        if (!isPkProp) {
          console.error(
            `✖ ${rel(file)}:${j + 1}  .from("profiles") … .eq("id", ${arg}) — profiles.id is the PK; use .eq("user_id", …) (or // @profiles-id-ok)`
          );
          violations++;
        }
      }
      if (/\.(maybeSingle|single|then)\(/.test(l) || /;\s*$/.test(l)) break;
    }
  }
}

// 2. Post-cutoff migrations — a public.profiles statement with `id = auth.uid()`.
const migrationFiles = walk(join(ROOT, "supabase", "migrations"), [".sql"]);
for (const file of migrationFiles) {
  scanned++;
  if (basename(file).slice(0, 14) <= BASELINE_CUTOFF) continue;
  const sql = readFileSync(file, "utf8");
  if (HATCH.test(sql)) continue;
  if (
    /(update|from|join)\s+(public\.)?profiles\b[\s\S]{0,240}?\bid\s*=\s*auth\.uid\(\)/i.test(sql)
  ) {
    console.error(
      `✖ ${rel(file)}  a public.profiles statement uses \`id = auth.uid()\` — use \`user_id = auth.uid()\` (or -- @profiles-id-ok)`
    );
    violations++;
  }
}

// Fail closed: a zero-scan means the scan roots moved/renamed — never a silent pass.
if (scanned === 0) {
  console.error(
    "check-profiles-id-auth-uid: scanned 0 files under supabase/functions, supabase/migrations — path moved?"
  );
  process.exit(1);
}

if (violations > 0) {
  console.error(`\n${violations} profiles.id vs auth.uid() confusion(s) found (audit T-A).`);
  process.exit(1);
}
console.log(
  `✓ check-profiles-id-auth-uid: OK — ${scanned} files scanned (${edgeFiles.length} edge fns, ${migrationFiles.length} migrations), 0 violations`
);
