// Source-level wiring check (ADR-0054): App.tsx must reference and render
// <SessionKeepalive /> so the app-owned token refresh is wired into the shell. This
// is a TEXT check — it proves the mount is wired, not that it is reachable at runtime;
// the behavioural proof that a mounted keepalive actually drives the refresh lives in
// src/test/ui/SessionKeepalive.test.tsx. Removing the mount reddens this loudly.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("SessionKeepalive stays mounted app-wide (ADR-0054)", () => {
  const app = fs.readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");

  it("App.tsx imports SessionKeepalive from its module", () => {
    expect(app).toMatch(
      /import\s*\{\s*SessionKeepalive\s*\}\s*from\s*["']@\/components\/SessionKeepalive["']/
    );
  });

  it("App.tsx renders <SessionKeepalive /> in the shell", () => {
    expect(app).toMatch(/<SessionKeepalive\s*\/>/);
  });
});
