import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("general-application.service OWASP data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "services", "general-application.service.ts"), "utf8");

  it("SEC-GENERAL-APPLICATION-SERVICE-PROJECTION-054: avoids wildcard and implicit projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
    expect(source).not.toMatch(/\.select\(\s*\)/);
  });

  it("SEC-GENERAL-APPLICATION-SERVICE-PROJECTION-054: uses application allowlists for reads and insert returns", () => {
    expect(source).toContain("GENERAL_APPLICATION_COLUMNS");
    expect(source.match(/\.select\(GENERAL_APPLICATION_COLUMNS\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("SEC-GENERAL-APPLICATION-SERVICE-PROJECTION-054: keeps profile email lookup bounded", () => {
    expect(source).toContain("PROFILE_EMAIL_COLUMNS");
    expect(source).toContain(".select(PROFILE_EMAIL_COLUMNS)");
    expect(source).not.toContain("encrypted_ssn");
    expect(source).not.toContain("private_metadata");
    expect(source).not.toContain("membership_gumroad_sale_id");
  });
});
