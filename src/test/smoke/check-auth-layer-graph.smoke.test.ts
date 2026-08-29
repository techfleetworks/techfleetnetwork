// Smoke coverage for scripts/ci/check-auth-layer-graph.mjs — an AUTH-LAYER guard that fails
// CI when the defense-in-depth layers import "upward". The allowed direction is
//   ui → state → flows → services → domain  (RANK ui=4 > state=3 > flows=2 > services=1 > domain=0)
// and imports may only flow toward a LOWER rank. A reverse edge — a service importing a flow,
// a domain module importing a UI screen — collapses the architecture back into the sediment
// the auth rebuild climbed out of, and lets an auth regression re-enter through a back edge.
// This guard is the tripwire; these tests prove it trips on real upward edges (relative AND
// @/features/auth alias forms), stays green on a clean downward graph, and honors the
// testing-layer exemption — run the real guard against fixtures, assert exit codes.
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { guardFixture, cleanupGuardFixtures } from "./support/guard-fixture";

const REPO = process.cwd();
const GUARD = resolve(REPO, "scripts/ci/check-auth-layer-graph.mjs");

afterAll(cleanupGuardFixtures);

/** Run the real guard with cwd=root; return exit code (0 clean, 1 violation, 2 fail-closed). */
function runGuard(root: string): number {
  try {
    execFileSync("node", [GUARD], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("check-auth-layer-graph auth-layer guard (smoke)", () => {
  it("LAYER-001: passes a clean downward graph (flows→services, services→domain)", () => {
    const r = guardFixture({
      "src/features/auth/services/sign-in.service.ts":
        'import { ok } from "../domain/auth-result";\n' +
        "export const signInService = () => ok({});\n",
      "src/features/auth/flows/sign-in.flow.ts":
        'import { signInService } from "../services/sign-in.service";\n' +
        "export const signIn = () => signInService();\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("LAYER-002: FLAGS a service importing a flow (services→flows is upward)", () => {
    const r = guardFixture({
      "src/features/auth/services/bad.service.ts":
        'import { signIn } from "../flows/sign-in.flow";\n' +
        "export const bad = () => signIn();\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("LAYER-003: FLAGS a domain module importing a UI screen (domain→ui is upward)", () => {
    const r = guardFixture({
      "src/features/auth/domain/bad.ts":
        'import SignInScreen from "../ui/SignInScreen";\n' + "export const wrong = SignInScreen;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("LAYER-004: FLAGS an upward edge written via the @/features/auth alias (services→state)", () => {
    const r = guardFixture({
      "src/features/auth/services/bad-alias.service.ts":
        'import { authStore } from "@/features/auth/state/auth-store";\n' +
        "export const bad = () => authStore;\n",
    });
    expect(runGuard(r)).toBe(1);
  });

  it("LAYER-005: EXEMPTS the testing layer (an upward import there is not flagged)", () => {
    const r = guardFixture({
      "src/features/auth/testing/harness.ts":
        'import SignInScreen from "../ui/SignInScreen";\n' +
        "export const mounted = SignInScreen;\n",
    });
    expect(runGuard(r)).toBe(0);
  });

  it("LAYER-006: fails CLOSED (exit 2) when src/features/auth is missing", () => {
    const r = guardFixture({ "README.md": "no auth feature here" });
    expect(runGuard(r)).toBe(2);
  });

  it("LAYER-007: fails CLOSED (exit 1) when the auth root has zero .ts/.tsx files to scan", () => {
    const r = guardFixture({ "src/features/auth/README.md": "no code here" });
    expect(runGuard(r)).toBe(1);
  });

  it("LAYER-008: the real repo passes the guard", () => {
    expect(runGuard(REPO)).toBe(0);
  });
});
