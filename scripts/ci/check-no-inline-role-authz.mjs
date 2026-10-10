#!/usr/bin/env node
// ci-lane: critical
/**
 * ROLE-AUTHZ-001 — an edge function must not read `user_roles` directly to make an authz decision.
 *
 * WHY THIS EXISTS
 * ---------------
 * The admin predicate has ONE owner: the `has_role` RPC (via `_shared/request-auth.ts`'s
 * `requireAdminRequest`). A handler that SELECTs `user_roles` itself is a hand-rolled authz check —
 * it drifts from the one predicate, skips the shared denial audit, and is the shape that ships a
 * subtly-wrong or bypassable gate (supabase/functions/CLAUDE.md "No inline admin checks";
 * enterprise-readiness audit 2026-10: only ~6% of functions used the shared predicate). This guard
 * makes a NEW hand-rolled authz READ impossible to merge.
 *
 * SCOPE: it flags `.from("user_roles") … .select(…)` (a READ) in an edge handler. It deliberately does
 * NOT flag WRITES (`insert`/`update`/`delete`/`upsert`) — role-management functions (promote / grant /
 * revoke) legitimately write `user_roles`. Pre-existing reads sit on a shrink-only grandfather and
 * burn down as they move to `has_role` (the actual rewrites are done under the auth regression suite).
 *
 * ci-guard-integrity: bespoke-dir-reader — walks the per-function .ts files under supabase/functions,
 * not a recursive src content scan, so it does not use _guard.mjs. Fails CLOSED (exit 2) on a missing
 * functions dir / zero files / unreadable allowlist. Pinned by
 * src/test/smoke/check-no-inline-role-authz.smoke.test.ts.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROLE_AUTHZ_ROOT
  ? resolve(process.env.ROLE_AUTHZ_ROOT)
  : resolve(HERE, "..", "..");
const FUNCS = resolve(ROOT, "supabase", "functions");
const ALLOWLIST_FILE =
  process.env.ROLE_AUTHZ_ALLOWLIST || resolve(HERE, "no-inline-role-authz-grandfather.json");

const die = (msg) => {
  console.error(`✖ check-no-inline-role-authz: ${msg}`);
  process.exit(2);
};

function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "_shared" || name === "tests" || name === "node_modules") continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...collect(p));
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

let allow;
try {
  allow = new Set(
    JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8").replace(/^﻿/, "")).grandfathered ?? []
  );
} catch (e) {
  die(`cannot read/parse allowlist ${ALLOWLIST_FILE}: ${e.message}. Failing closed.`);
}

if (!existsSync(FUNCS)) die(`no supabase/functions dir at ${FUNCS}. Failing closed.`);
const files = collect(FUNCS);
if (files.length === 0) die(`scanned 0 edge function .ts files under ${FUNCS}. Failing closed.`);

const FROM_USER_ROLES = /from\(\s*['"]user_roles['"]\s*\)/g;

const readSites = []; // { rel }
for (const file of files) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
  let m;
  FROM_USER_ROLES.lastIndex = 0;
  while ((m = FROM_USER_ROLES.exec(src))) {
    // Capture the statement chain: from the match to the next ';' (cap 400 chars).
    const start = m.index;
    const semi = src.indexOf(";", start);
    const span = src.slice(start, semi === -1 ? start + 400 : Math.min(semi, start + 400));
    if (/\.\s*select\s*\(/.test(span)) {
      const line = src.slice(0, start).split("\n").length;
      readSites.push({ rel, line });
    }
  }
}

const violations = readSites.filter((s) => !allow.has(s.rel));
const stale = [...allow].filter((a) => !readSites.some((s) => s.rel === a));

if (stale.length) {
  console.error(
    `✖ check-no-inline-role-authz: ${stale.length} grandfather entr(y/ies) no longer read user_roles — prune (shrink-only):`
  );
  for (const s of stale) console.error(`  - ${s}`);
  process.exit(1);
}

if (violations.length) {
  console.error(
    `✖ check-no-inline-role-authz: ${violations.length} edge handler(s) READ user_roles directly for authz ` +
      `(use the one owner — has_role / requireAdminRequest — not a hand-rolled check):`
  );
  for (const v of violations) console.error(`  ${v.rel}:${v.line}`);
  console.error(
    `\nReplace the user_roles SELECT with requireAdminRequest(...) or the has_role RPC ` +
      `(supabase/functions/CLAUDE.md "No inline admin checks"). Role-management WRITES are fine.`
  );
  process.exit(1);
}

console.log(
  `✓ check-no-inline-role-authz: OK — ${files.length} edge files scanned; ` +
    `${readSites.length} grandfathered user_roles read(s), 0 new hand-rolled authz reads.`
);
