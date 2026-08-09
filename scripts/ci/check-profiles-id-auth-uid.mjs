#!/usr/bin/env node
// Audit T-A guard: `profiles.id` is a random PK; the auth identity column is
// `user_id` (== auth.uid()). Confusing them silently no-ops identity
// lookups/updates — consent was never persisted (record_policy_ack), GDPR
// anonymize was skipped (freescout-sync-customer), tickets went invisible (C3).
// This flags the two recurring shapes so they can't regress:
//   1. Edge fns:  `.from("profiles") … .eq("id", <x>)`  → use .eq("user_id", …)
//   2. Post-cutoff migrations: a `public.profiles` statement with `id = auth.uid()`.
// Escape hatch (when `id` genuinely IS the profiles PK): put `@profiles-id-ok`
// on the flagged line or the line above it (or anywhere in the migration file).
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
  } catch {
    return out;
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

// 1. Edge functions — `.from("profiles")` then `.eq("id", …)` in the same query.
for (const file of walk(join(ROOT, "supabase", "functions"), [".ts"])) {
  if (file.endsWith(".test.ts")) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/\.from\(\s*["']profiles["']\s*\)/.test(lines[i])) continue;
    for (let j = i + 1; j <= Math.min(i + 8, lines.length - 1); j++) {
      const l = lines[j];
      if (/\.eq\(\s*["']id["']\s*,/.test(l) && !HATCH.test(l) && !HATCH.test(lines[j - 1] ?? "")) {
        console.error(
          `✖ ${rel(file)}:${j + 1}  .from("profiles") … .eq("id", …) — profiles.id is the PK; use .eq("user_id", …) (or // @profiles-id-ok)`
        );
        violations++;
      }
      if (/\.(maybeSingle|single|then)\(/.test(l) || /;\s*$/.test(l)) break;
    }
  }
}

// 2. Post-cutoff migrations — a public.profiles statement with `id = auth.uid()`.
for (const file of walk(join(ROOT, "supabase", "migrations"), [".sql"])) {
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

if (violations > 0) {
  console.error(`\n${violations} profiles.id vs auth.uid() confusion(s) found (audit T-A).`);
  process.exit(1);
}
console.log("✓ check-profiles-id-auth-uid: no profiles.id vs auth.uid() confusion found.");
