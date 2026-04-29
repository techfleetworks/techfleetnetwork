import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("announcement.service OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "services", "announcement.service.ts"), "utf8");

  it("SEC-ANNOUNCEMENT-SERVICE-PROJECTION-053: avoids wildcard and implicit projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
    expect(source).not.toMatch(/\.select\(\s*\)/);
  });

  it("SEC-ANNOUNCEMENT-SERVICE-PROJECTION-053: uses allowlists for announcement reads and insert returns", () => {
    expect(source).toContain("ANNOUNCEMENT_COLUMNS");
    expect(source.match(/\.select\(ANNOUNCEMENT_COLUMNS\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("SEC-ANNOUNCEMENT-SERVICE-PROJECTION-053: keeps read receipts identifier-only", () => {
    expect(source).toContain("ANNOUNCEMENT_READ_COLUMNS");
    expect(source.match(/\.select\(ANNOUNCEMENT_READ_COLUMNS\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("ip_address");
    expect(source).not.toContain("user_agent");
    expect(source).not.toContain("private_metadata");
  });
});
