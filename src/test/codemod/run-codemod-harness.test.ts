/**
 * Unit tests for the codemod HARNESS exclusion logic (Phase 0c toolkit).
 *
 * The toolkit's core safety guarantee is that no codemod can ever edit the FROZEN auth
 * layer (src/features/auth/**), which is owned by the Phase 2-AUTH track. That guarantee
 * rests entirely on `HARD_EXCLUDES` + `globToRegExp`, so — per AGENTS.md ("every guard's
 * test must DISCRIMINATE") — we test not just that auth paths are excluded, but that
 * REMOVING the auth entry makes an auth path stop being excluded (so a regression that
 * neutralizes the glob would fail this test, not ship green).
 */
import { describe, it, expect } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — plain .mjs harness, no type declarations
import {
  HARD_EXCLUDES,
  makeIsExcluded,
  globToRegExp,
} from "../../../scripts/codemod/run-codemod.mjs";

describe("codemod harness — exclusions", () => {
  const isExcluded = makeIsExcluded(HARD_EXCLUDES);

  it("excludes the frozen auth layer", () => {
    expect(isExcluded("src/features/auth/session.service.ts")).toBe(true);
    expect(isExcluded("src/features/auth/engine/use-sign-in-engine.ts")).toBe(true); // nested
  });

  it("DISCRIMINATES: without the auth entry, an auth path is NOT excluded", () => {
    // Proves the auth glob is what protects the frozen layer — remove it and the guarantee fails.
    const withoutAuth = HARD_EXCLUDES.filter((g: string) => !g.includes("features/auth"));
    expect(withoutAuth.length).toBe(HARD_EXCLUDES.length - 1); // the entry exists to be removed
    expect(makeIsExcluded(withoutAuth)("src/features/auth/session.service.ts")).toBe(false);
  });

  it("excludes tests and the test tree, but not production source", () => {
    expect(isExcluded("src/foo.test.ts")).toBe(true);
    expect(isExcluded("src/foo.spec.tsx")).toBe(true);
    expect(isExcluded("src/test/smoke/x.ts")).toBe(true);
    expect(isExcluded("src/services/discord-notify.service.ts")).toBe(false);
    expect(isExcluded("src/pages/UserAdminPage.tsx")).toBe(false);
  });

  it("globToRegExp: `**` spans nested directories; `*` does not cross `/`", () => {
    expect(globToRegExp("src/features/auth/**").test("src/features/auth/a/b/c.ts")).toBe(true);
    expect(globToRegExp("src/features/auth/**").test("src/features/authz/x.ts")).toBe(false);
    expect(globToRegExp("**/*.test.*").test("src/deep/nested/file.test.ts")).toBe(true);
  });
});
