import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("banner.service OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "services", "banner.service.ts"), "utf8");

  it("SEC-BANNER-SERVICE-PROJECTION-051: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-BANNER-SERVICE-PROJECTION-051: uses an allowlist for admin banner reads", () => {
    expect(source).toContain("ADMIN_BANNER_COLUMNS");
    expect(source).toContain(".select(ADMIN_BANNER_COLUMNS)");
    expect(source.match(/\.select\(ADMIN_BANNER_COLUMNS\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("SEC-BANNER-SERVICE-PROJECTION-051: keeps dismissal reads narrow", () => {
    expect(source).toContain('.select("banner_id")');
    expect(source).toContain("reopen_after_dismiss");
    expect(source).not.toContain("private_metadata");
    expect(source).not.toContain("internal_notes");
    expect(source).not.toContain("ip_address");
  });
});
