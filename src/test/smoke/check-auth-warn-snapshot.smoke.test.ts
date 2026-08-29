// Smoke coverage for scripts/ci/check-auth-warn-snapshot.mjs — the AUTH-ARCH-CUTOVER-023
// ratchet guard. The warn-level auth-invariants rules (no-direct-supabase-auth, …) cannot be
// promoted to ESLint `error` yet (60+ legacy callsites), so the guard snapshots each file's
// per-rule violation COUNT in scripts/ci/auth-warn-snapshot.json and fails CI if any count
// GROWS or a NEW offending file appears — driving the legacy surface toward zero. Its "scan" is
// `npx eslint src/ -f json` run in process.cwd(), and its snapshot path is cwd-relative. So
// unlike a pure-fs guard we cannot fixture it in tmpdir: eslint must resolve the repo's LOCAL
// plugin (scripts/lint/eslint-plugin-auth-invariants.mjs) + node_modules. We therefore build the
// fixture INSIDE the repo, give it a minimal eslint.config.js that loads that real plugin, and
// run the real guard with cwd=fixtureRoot. These tests prove the ratchet CATCHES a new offending
// file and a grown count, and fails CLOSED when the snapshot is missing.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-warn-snapshot.mjs");
const SNAPSHOT_REL = "scripts/ci/auth-warn-snapshot.json";
const PLUGIN_URL = pathToFileURL(
  resolve(REPO, "scripts/lint/eslint-plugin-auth-invariants.mjs")
).href;

// A minimal flat config that loads ONLY the real auth-invariants plugin at warn level for the
// three snapshotted rules — deterministic, and enough for eslint to produce the JSON report the
// guard parses. Placed in each fixture so eslint prefers it over the repo's full 20-plugin config.
const ESLINT_CONFIG =
  `import authInvariants from "${PLUGIN_URL}";\n` +
  `import tseslint from "typescript-eslint";\n` +
  `export default [\n` +
  `  {\n` +
  `    files: ["**/*.ts"],\n` +
  `    languageOptions: { parser: tseslint.parser },\n` +
  `    plugins: { "auth-invariants": authInvariants },\n` +
  `    rules: {\n` +
  `      "auth-invariants/no-direct-supabase-auth": "warn",\n` +
  `      "auth-invariants/no-direct-failure-counters": "warn",\n` +
  `      "auth-invariants/no-auth-storage-literals": "warn",\n` +
  `    },\n` +
  `  },\n` +
  `];\n`;

// Each `supabase.auth.<x>()` in a non-feature src file is one no-direct-supabase-auth violation.
const oneViolation = "export const a = () => supabase.auth.onAuthStateChange(() => {});\n";
const twoViolations =
  oneViolation + "export const b = () => supabase.auth.onAuthStateChange(() => {});\n";

const created: string[] = [];

/**
 * Build an in-repo fixture: writes the eslint config, a src/thing.ts, and (optionally) a
 * snapshot JSON. Returns the fixture root. Must live under REPO so `npx eslint` resolves the
 * repo's eslint binary + typescript-eslint parser via upward node_modules lookup.
 */
function authWarnFixture(opts: {
  thing: string;
  snapshot?: Record<string, number> | null;
}): string {
  const root = mkdtempSync(join(REPO, ".smoke-authwarn-"));
  created.push(root);
  writeFileSync(join(root, "eslint.config.js"), ESLINT_CONFIG);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "thing.ts"), opts.thing);
  if (opts.snapshot !== null && opts.snapshot !== undefined) {
    mkdirSync(join(root, "scripts", "ci"), { recursive: true });
    writeFileSync(
      join(root, SNAPSHOT_REL),
      JSON.stringify({ rules: [], counts: opts.snapshot }) + "\n"
    );
  }
  return root;
}

afterAll(() => {
  for (const d of created.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

/** Run the real guard with cwd=root; return exit code (0 clean, 1 ratchet violation / fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

const KEY = "src/thing.ts|auth-invariants/no-direct-supabase-auth";

describe("check-auth-warn-snapshot ratchet guard (smoke)", () => {
  it("AWS-001: passes when current per-file counts match the snapshot", { timeout: 120000 }, () => {
    const r = authWarnFixture({ thing: oneViolation, snapshot: { [KEY]: 1 } });
    expect(runGuard(r)).toBe(0);
  });

  it(
    "AWS-002: FLAGS (exit 1) a NEW offending file absent from the snapshot",
    { timeout: 120000 },
    () => {
      const r = authWarnFixture({ thing: oneViolation, snapshot: {} });
      expect(runGuard(r)).toBe(1);
    }
  );

  it(
    "AWS-003: FLAGS (exit 1) a file whose violation count GREW above the snapshot floor",
    { timeout: 120000 },
    () => {
      const r = authWarnFixture({ thing: twoViolations, snapshot: { [KEY]: 1 } });
      expect(runGuard(r)).toBe(1);
    }
  );

  it(
    "AWS-004: fails CLOSED (exit 1) when the snapshot JSON is missing",
    { timeout: 120000 },
    () => {
      const r = authWarnFixture({ thing: oneViolation, snapshot: null });
      expect(runGuard(r)).toBe(1);
    }
  );

  it("AWS-005: the real repo passes the guard", { timeout: 240000 }, () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
