// CI guard: enforces email subsystem v2 layering.
// Domain MUST NOT import infrastructure/providers/Deno/npm I/O.
// Application MUST NOT import infrastructure directly (only ports).
// Infrastructure MAY import domain types + ports.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "supabase/functions/_shared/email";
const errors = [];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const FORBIDDEN_IN_DOMAIN = [
  /from\s+['"]npm:@supabase/,
  /from\s+['"]npm:@lovable\.dev/,
  /from\s+['"]npm:@react-email/,
  /Deno\./,
  /fetch\(/,
];
const FORBIDDEN_IN_APPLICATION = [
  /from\s+['"]\.\.\/infrastructure/,
  /from\s+['"]npm:@supabase/,
  /from\s+['"]npm:@lovable\.dev/,
];

let files;
try {
  files = await walk(ROOT);
} catch (e) {
  // Fail closed: the email v2 layer exists on main, so a missing/renamed path is a
  // real problem, not a reason to pass. A silent skip here would be a false green.
  console.error(`❌ check-email-architecture: cannot scan ${ROOT}: ${e.message} (failing closed)`);
  process.exit(2);
}

if (files.length === 0) {
  console.error(
    `❌ check-email-architecture: scanned 0 files under ${ROOT} — path moved? Failing closed rather than passing vacuously.`
  );
  process.exit(2);
}

let domainChecked = 0;
let appChecked = 0;
for (const f of files) {
  if (/\.test\.ts$/.test(f)) continue; // tests may use Deno.test
  const src = (await readFile(f, "utf8"))
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // strip comment lines
    .join("\n");
  if (f.includes("/domain/")) {
    domainChecked++;
    for (const re of FORBIDDEN_IN_DOMAIN)
      if (re.test(src)) errors.push(`[domain] ${f} contains forbidden pattern: ${re}`);
  } else if (f.includes("/application/")) {
    appChecked++;
    for (const re of FORBIDDEN_IN_APPLICATION)
      if (re.test(src)) errors.push(`[application] ${f} contains forbidden pattern: ${re}`);
  }
}

if (errors.length) {
  console.error(
    "Email subsystem v2 architecture violations:\n" + errors.map((e) => "  • " + e).join("\n")
  );
  process.exit(1);
}
console.log(
  `Email subsystem v2 architecture: OK — ${files.length} file(s) scanned (${domainChecked} domain, ${appChecked} application).`
);
