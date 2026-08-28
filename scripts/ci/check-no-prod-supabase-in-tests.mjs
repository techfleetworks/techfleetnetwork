// CI guard (PRD G-03 / P-05 / UC-09): the test suite must NEVER reference the
// production Supabase project. Tests run against jsdom + local/staging fixtures.
//
// Fails with file:line for every test file that references the production
// project ref or its REST/GoTrue host. Static grep — no network, no DB.
//
// Allowed: local (127.0.0.1:54321), staging vars, env-driven URLs.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// Production project ref — the one thing tests must not touch.
const PROD_REF = "pzvqxdgoztbfikfuifix";

// Where test code lives.
const ROOTS = ["src", "e2e"];
const TEST_FILE = /\.(test|spec|e2e)\.(ts|tsx|mjs|js)$/;
const TEST_DIR = /(^|\/)(__tests__|test|tests|e2e)(\/|$)/;

const offenders = [];
let testFilesScanned = 0;

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    // Fail closed: a scan root we cannot read is a moved/renamed path, not "clean".
    console.error(`check-no-prod-supabase-in-tests: cannot read directory ${dir}: ${e.message}`);
    process.exit(2);
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      await walk(p);
    } else if (TEST_FILE.test(e.name) || (TEST_DIR.test(p) && /\.(ts|tsx|mjs|js)$/.test(e.name))) {
      testFilesScanned++;
      const src = await readFile(p, "utf8");
      src.split("\n").forEach((line, i) => {
        if (line.includes(PROD_REF)) {
          offenders.push(`${p.replace(/\\/g, "/")}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

for (const r of ROOTS) await walk(r);

// Fail closed: no test files found means the test tree moved — never a silent pass.
if (testFilesScanned === 0) {
  console.error(
    `check-no-prod-supabase-in-tests: scanned 0 test files under ${ROOTS.join(", ")} — path moved?`
  );
  process.exit(1);
}

if (offenders.length) {
  console.error(
    `Production Supabase project (${PROD_REF}) referenced in ${offenders.length} test location(s).\n` +
      `Tests must use the local (127.0.0.1:54321) or staging instance — never production.\n`
  );
  for (const o of offenders) console.error("  • " + o);
  process.exit(1);
}
console.log(
  `OK: no production Supabase references in tests — ${testFilesScanned} test files scanned under ${ROOTS.join(", ")}, 0 violations.`
);
