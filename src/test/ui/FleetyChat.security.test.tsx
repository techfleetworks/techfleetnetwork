import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const readSource = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

describe("Fleety chat surfaces security logging coverage", () => {
  const widgetSource = readSource("src", "components", "FleetyChatWidget.tsx");
  const guidanceSource = readSource("src", "components", "resources", "GuidanceEmbed.tsx");

  it("SEC-FLEETY-LOG-REDACTION-032: widget uses centralized redacting logger instead of raw console errors", () => {
    expect(widgetSource).toContain('createLogger("FleetyChatWidget")');
    expect(widgetSource).toContain('log.error("send"');
    expect(widgetSource).not.toContain("console.error");
  });

  it("SEC-FLEETY-LOG-REDACTION-032: widget does not display backend/provider error messages directly", () => {
    expect(widgetSource).toContain('toast.error("Failed to get a response. Please try again.")');
    expect(widgetSource).not.toContain("toast.error(e.message");
    expect(widgetSource).not.toContain("errData.error");
  });

  it("SEC-GUIDANCE-LOG-REDACTION-033: guidance embed uses centralized redacting logger instead of raw console errors", () => {
    expect(guidanceSource).toContain('createLogger("GuidanceEmbed")');
    expect(guidanceSource).toContain('log.error("send"');
    expect(guidanceSource).not.toContain("console.error");
  });

  it("SEC-GUIDANCE-LOG-REDACTION-033: guidance embed enforces bounded input consistently", () => {
    expect(guidanceSource).toContain("const MAX_INPUT_LENGTH = 4000");
    expect(guidanceSource).toContain("maxLength={MAX_INPUT_LENGTH}");
    expect(guidanceSource).not.toContain("20000");
    expect(guidanceSource).not.toContain("errData.error");
  });
});
