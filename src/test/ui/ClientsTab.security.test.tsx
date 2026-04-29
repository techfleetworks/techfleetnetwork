import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ClientsTab security coverage", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "components", "clients", "ClientsTab.tsx"), "utf8");

  it("SEC-CLIENTS-GRID-XSS-030: constructs action cells with DOM APIs instead of HTML strings", () => {
    expect(source).toContain("function createClientActionCell");
    expect(source).toContain("document.createElement");
    expect(source).toContain("return createClientActionCell(params.data)");
    expect(source).not.toContain('return `<div style="display:flex;gap:4px;align-items:center;height:100%">');
  });

  it("SEC-CLIENTS-GRID-XSS-030: does not interpolate client names into an HTML string renderer", () => {
    expect(source).not.toContain('aria-label="Edit ${c.name}"');
    expect(source).not.toContain('aria-label="Delete ${c.name}"');
    expect(source).toContain("editButton.setAttribute(\"aria-label\", `Edit ${client.name}`)");
    expect(source).toContain("deleteButton.setAttribute(\"aria-label\", `Delete ${client.name}`)");
  });
});