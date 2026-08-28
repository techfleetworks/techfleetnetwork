#!/usr/bin/env node
// Fails CI if an edge function authorizes on an UNVERIFIED JWT claim or on a
// substring match of a public key — the two auth-bypass classes from the
// 2026-08 audit (C1: unsigned service_role JWT; C2: anon-key .includes()).
//
// Rule A: a file that base64-decodes a token (`atob(`) AND trusts an unverified
//         `role === "service_role"` claim. Legit decoders (aal/iat/sub) don't
//         reference the service_role role, so this is specific to the bypass.
// Rule B: authorizing by `.includes(<ANON key>)` — the anon key is public
//         (shipped in the frontend bundle), so it can never gate privilege.
//
// Correct pattern: exact, constant-time match against SUPABASE_SERVICE_ROLE_KEY
// (see supabase/functions/_shared/service-role-auth.ts), or a verified admin JWT.
//
// Escape hatch (use only with a written justification): put
// `// @safe-service-auth` somewhere in the file.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIR = join(ROOT, "supabase", "functions");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const TRUSTS_ROLE =
  /\.role\s*[!=]==?\s*["']service_role["']|["']service_role["']\s*[!=]==?\s*[\w.?]*role/;
const ANON_INCLUDES = /\.includes\(\s*[^)]*ANON[^)]*\)/i;

// Fail closed: if the edge-functions root cannot be read, this security guard
// must NOT pass — an empty/errored scan is treated as a hard failure, never a
// silent green.
let files;
try {
  files = walk(DIR);
} catch (e) {
  console.error(
    `✖ check-no-unsigned-jwt-auth: cannot scan ${relative(ROOT, DIR).replace(/\\/g, "/")} — ${e.message}`
  );
  console.error(
    "  Failing closed: the security guard must never pass without inspecting the edge functions."
  );
  process.exit(2);
}

let scanned = 0;
let violations = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  scanned++;
  if (/\/\/\s*@safe-service-auth/.test(src)) continue;
  const rel = relative(ROOT, f).replace(/\\/g, "/");

  if (/\batob\s*\(/.test(src) && TRUSTS_ROLE.test(src)) {
    console.error(
      `✖ ${rel}\n   Decodes a JWT (atob) and trusts an UNVERIFIED role="service_role" claim.\n   Use exact constant-time SUPABASE_SERVICE_ROLE_KEY match (authorizeServiceRoleRequest) or verify the signature.`
    );
    violations++;
  }
  if (ANON_INCLUDES.test(src)) {
    console.error(
      `✖ ${rel}\n   Authorizes via .includes() of an ANON key — the anon key is PUBLIC and can never gate privilege.\n   Require exact service-role match or a verified admin JWT.`
    );
    violations++;
  }
}

if (violations > 0) {
  console.error(
    `\n${violations} insecure service-role/anon auth pattern(s) found (audit C1/C2 class).`
  );
  process.exit(1);
}

// Zero-scan is a failure, not a pass: it means the scan root moved.
if (scanned === 0) {
  console.error(
    `check-no-unsigned-jwt-auth: scanned 0 files under ${relative(ROOT, DIR).replace(/\\/g, "/")} — path moved?`
  );
  process.exit(1);
}

console.log(
  `✓ check-no-unsigned-jwt-auth: OK — ${scanned} files scanned, 0 violations ` +
    "(no unsigned-JWT or anon-key authorization patterns)."
);
