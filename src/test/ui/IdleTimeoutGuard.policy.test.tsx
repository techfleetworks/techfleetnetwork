import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("IdleTimeoutGuard 30-minute inactivity policy", () => {
  const guardSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "IdleTimeoutGuard.tsx"), "utf8");
  const authServiceSource = fs.readFileSync(path.join(process.cwd(), "src", "services", "auth.service.ts"), "utf8");
  const securitySource = fs.readFileSync(path.join(process.cwd(), "src", "lib", "security.ts"), "utf8");

  it("SEC-SESSION-IDLE-30MIN-039: warns at 28 minutes and signs out after 30 minutes", () => {
    expect(guardSource).toContain("const timeoutMinutes = 30;");
    expect(guardSource).toContain("timeoutMs: timeoutMinutes * 60 * 1000");
    expect(guardSource).toContain("warningMs: 2 * 60 * 1000");
    expect(guardSource).toContain("timeoutMinutes - 2");
  });

  it("SEC-SESSION-IDLE-30MIN-039: aligns client session policy enforcement to 30 minutes", () => {
    expect(authServiceSource).toContain("const IDLE_SESSION_AGE_MS = 30 * 60 * 1000;");
    expect(securitySource).toContain("idleTimeoutMs = 30 * 60 * 1000");
    expect(securitySource).toContain("input.idleTimeoutMs ?? 30 * 60 * 1000");
  });
});
