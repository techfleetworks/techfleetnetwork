#!/usr/bin/env node
/**
 * NO-BOM-001 — no committed text file may begin with a UTF-8 BOM.
 *
 * WHY THIS EXISTS
 * ---------------
 * A UTF-8 BOM (the bytes EF BB BF) at the start of a file is invisible in most
 * editors but breaks tools that don't strip it: `JSON.parse` throws
 * "Unexpected token" on a BOM'd JSON file, so a guard that reads a budget
 * or allowlist crashes instead of verifying. PowerShell is the usual source —
 * `Set-Content -Encoding utf8` and `>` both PREPEND a BOM on Windows — so a file
 * edited or regenerated on Windows can silently acquire one. This guard makes that
 * impossible to commit: any tracked text file starting with a BOM fails CI.
 *
 * Paired with the shared BOM-tolerant reader `scripts/ci/_json.mjs` this closes the class
 * both ways: a BOM can't ENTER the repo (this guard), and the guard-integrity checks that read
 * the hand-edited ratchet/allowlist JSON (check-guards-wired, check-guard-has-test,
 * check-db-objects-present) go through readJson — so a locally-BOM'd allowlist degrades to a
 * correct read instead of crashing before this guard flags it in CI.
 *
 * Bespoke reader: enumerates `git ls-files` and reads each file's first bytes — not
 * a content scan, so it does not use the _guard.mjs harness (listed in
 * check-ci-guard-integrity's BESPOKE_DIR_READERS). Fails closed on a git error.
 * Pinned by src/test/smoke/check-no-bom.smoke.test.ts.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.NO_BOM_ROOT
  ? resolve(process.env.NO_BOM_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Binary/asset extensions can legitimately start with any bytes — only lint text.
const TEXT =
  /\.(json|mjs|cjs|js|jsx|ts|tsx|sql|md|ya?ml|toml|css|scss|html?|svg|txt|sh|env|gitattributes|gitignore|editorconfig)$/i;

const die = (msg) => {
  console.error(`✖ check-no-bom: ${msg}`);
  process.exit(2);
};

let files;
try {
  files = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => TEXT.test(f));
} catch (e) {
  die(`cannot list tracked files (git ls-files) in ${ROOT}: ${e.message}. Failing closed.`);
}
if (files.length === 0)
  die(`git ls-files matched 0 text files under ${ROOT} — wrong root? Failing closed.`);

const withBom = [];
for (const rel of files) {
  let buf;
  try {
    buf = readFileSync(resolve(ROOT, rel));
  } catch {
    continue; // a listed-but-unreadable file (submodule, deleted) is not our concern
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    withBom.push(rel);
  }
}

if (withBom.length) {
  console.error(
    `✖ check-no-bom: ${withBom.length} tracked file(s) begin with a UTF-8 BOM (breaks JSON.parse and other tools):`
  );
  for (const f of withBom) console.error(`  - ${f}`);
  console.error(
    `\nStrip the BOM (re-save as UTF-8 *without* BOM). On Windows avoid \`Set-Content -Encoding utf8\` and \`>\` ` +
      `(both add one) — use \`[IO.File]::WriteAllText(path, text)\` or an editor set to "UTF-8 (no BOM)".`
  );
  process.exit(1);
}

console.log(
  `✓ check-no-bom: OK — ${files.length} tracked text files scanned, none begin with a BOM.`
);
