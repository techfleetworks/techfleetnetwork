import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { maskEmailForDisplay, safeOperationalMessage } from "@/pages/SystemHealthPage";

describe("SystemHealthPage OWASP A02/A09 hardening", () => {
  const serviceSource = fs.readFileSync(path.join(process.cwd(), "src", "services", "system-health.service.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(process.cwd(), "src", "pages", "SystemHealthPage.tsx"), "utf8");

  it("SEC-SYSTEM-HEALTH-ERROR-DATA-MIN-042: avoids wildcard remediation projections", () => {
    expect(serviceSource).toContain("SYSTEM_REMEDIATION_COLUMNS");
    expect(serviceSource).toContain(".select(SYSTEM_REMEDIATION_COLUMNS)");
    expect(serviceSource).not.toContain('.select("*")');
    expect(serviceSource).not.toContain(".select('*')");
  });

  it("SEC-SYSTEM-HEALTH-ERROR-DATA-MIN-042: masks recipient identifiers before rendering logs", () => {
    expect(maskEmailForDisplay("member@example.com")).toBe("me••••@example.com");
    expect(maskEmailForDisplay("x@example.com")).toBe("x•••@example.com");
    expect(maskEmailForDisplay("not-an-email")).toBe("Hidden recipient");
    expect(pageSource).toContain("maskEmailForDisplay(log.recipient_email)");
  });

  it("SEC-SYSTEM-HEALTH-ERROR-DATA-MIN-042: replaces raw provider/database errors with safe operational guidance", () => {
    expect(safeOperationalMessage("Provider rejected the sender domain")).toBe("Delivery issue detected. Review provider configuration and retry from the runbook.");
    expect(safeOperationalMessage("postgres connection failed for service token")).toBe("Delivery issue detected. Review provider configuration and retry from the runbook.");
    expect(pageSource).toContain("safeErrorMessage(error)");
    expect(pageSource).not.toContain("error instanceof Error ? error.message");
  });
});