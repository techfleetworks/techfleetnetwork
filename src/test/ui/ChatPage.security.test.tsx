import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ChatPage security logging coverage", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "ChatPage.tsx"), "utf8");

  it("SEC-CHAT-LOG-REDACTION-031: uses centralized redacting logger instead of raw console errors", () => {
    expect(source).toContain('createLogger("ChatPage")');
    expect(source).toContain('log.error("createConversation"');
    expect(source).toContain('log.error("send"');
    expect(source).not.toContain("console.error");
  });

  it("SEC-CHAT-LOG-REDACTION-031: does not display provider error messages directly to users", () => {
    expect(source).toContain('toast.error("Failed to get a response. Please try again.")');
    expect(source).not.toContain("toast.error(e.message");
  });
});