// Shared fixture helper for CI-guard smoke tests (the guard-the-guard burndown).
//
// It ONLY builds throwaway repo-shaped fixtures + cleans them up — it deliberately does
// NOT run any guard. Each guard's smoke test keeps its own `const GUARD = resolve(REPO,
// "scripts/ci/<name>.mjs")` + `execFileSync("node", [GUARD], ...)`, because check-guard-has-test
// credits a guard only when a test passes that guard's path to an exec (resolved from a local
// const). Centralizing the exec here would break that crediting — so only fixture I/O is shared.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const created: string[] = [];

/**
 * Create a throwaway fixture repo whose files are given as { "rel/path": "content" }.
 * Parent directories are created as needed. Only the paths you pass exist — so to exercise a
 * harness guard's fail-closed (missing root) path, simply don't write any file under that root;
 * to exercise its zero-match path, write a non-matching file under the root (e.g. a README).
 */
export function guardFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "guard-smoke-"));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Remove all fixtures created so far. Call from the test file's afterAll(). */
export function cleanupGuardFixtures(): void {
  for (const d of created.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
