// Smoke coverage for scripts/ci/check-no-bom.mjs — NO-BOM-001.
// The guard forbids a UTF-8 BOM (bytes EF BB BF) at the start of any tracked TEXT file, because a
// BOM is invisible in most editors yet makes JSON.parse throw ("Unexpected token") — so a
// budget/allowlist that acquires one (PowerShell `Set-Content -Encoding utf8` and `>` both prepend
// it on Windows) crashes the guard that reads it instead of verifying. This class bit us repeatedly.
// The guard enumerates `git ls-files`, so each scenario builds a REAL throwaway git repo (init +
// stage) under the NO_BOM_ROOT seam and asserts exit codes: clean → 0, a BOM'd file → 1, and
// fail-closed (nothing to scan) → 2. The BOM is written as raw bytes, not a string, so the test
// proves the guard catches the actual on-disk byte sequence.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-no-bom.mjs");
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

afterAll(cleanupGuardFixtures);

/**
 * Populate a throwaway git repo with the given files (string = written UTF-8 as-is; Buffer =
 * written byte-for-byte, used to prepend a real BOM), `git add` them so `git ls-files` sees them,
 * then run the guard against it via the NO_BOM_ROOT seam. Returns the guard's exit code.
 */
function run(files: Record<string, string | Buffer>): number {
  const root = guardFixture({}); // registered temp root (cleaned in afterAll), no files yet
  for (const [rel, content] of Object.entries(files)) {
    const abs = resolve(root, rel);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git(["init", "-q"]);
  git(["add", "-A"]); // `git ls-files` reads the index — staging is enough, no commit needed
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env: { ...process.env, NO_BOM_ROOT: root } });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** A UTF-8 buffer with a BOM prepended — the exact byte sequence the guard must catch. */
const withBom = (text: string): Buffer => Buffer.concat([BOM, Buffer.from(text, "utf8")]);

describe("check-no-bom guard (smoke)", () => {
  it("NOBOM-001: passes when every tracked text file is clean UTF-8 (no BOM)", () => {
    expect(
      run({ "config.json": '{"a":1}', "readme.md": "# hi", "src/x.ts": "export const x = 1;" })
    ).toBe(0);
  });

  it("NOBOM-002: FLAGS (exit 1) a tracked JSON file that begins with a BOM (the crash class)", () => {
    expect(run({ "config.json": withBom('{"a":1}'), "readme.md": "# hi" })).toBe(1);
  });

  it("NOBOM-003: catches a BOM in any text type, not just JSON (e.g. a .ts source file)", () => {
    expect(run({ "config.json": '{"a":1}', "src/x.ts": withBom("export const x = 1;") })).toBe(1);
  });

  it("NOBOM-004: a BOM mid-file is NOT flagged — only a leading BOM breaks parsers", () => {
    // The bytes EF BB BF appearing later in a file are legal content, not a BOM.
    expect(
      run({
        "notes.md": Buffer.concat([Buffer.from("ok ", "utf8"), BOM, Buffer.from("more", "utf8")]),
      })
    ).toBe(0);
  });

  it("NOBOM-005: fails CLOSED (exit 2) when there are zero text files to scan (wrong root / all binary)", () => {
    // Only a binary asset is tracked → the TEXT filter matches nothing → the guard must not pass vacuously.
    expect(run({ "asset.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]) })).toBe(2);
  });
});
