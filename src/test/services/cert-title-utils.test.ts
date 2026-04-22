/**
 * Server-side certification title extraction.
 *
 * Covers BDD scenarios:
 *   - PROJ-CERT-008  Project name cleaned at first comma
 *   - PROJ-CERT-007  Case-insensitive identity guard (skip own-name false matches)
 *   - CLASS-CERT-002 Display title cleaned of trailing "- Month YYYY" suffix
 *
 * These are the parsing gates that protect the database from displaying
 * unsanitized Airtable record IDs or emails as user-visible titles.
 */
import { describe, it, expect } from "vitest";
import {
  extractClassDisplayTitle,
  extractProjectDisplayTitle,
} from "../../../supabase/functions/_shared/cert-title-utils";

describe("extractClassDisplayTitle", () => {
  it("parses class name out of the Masterclass Attendee Unique ID", () => {
    const fields = {
      "Masterclass Attendee Unique ID":
        "1756 - Amanda Wolf - Service Leadership Masterclass - September 2025",
    };
    expect(extractClassDisplayTitle(fields)).toBe(
      "Service Leadership Masterclass",
    );
  });

  it("strips trailing ' - Month YYYY' suffix from Registered For", () => {
    const fields = { "Registered For": ["AI Foundations - March 2025"] };
    expect(extractClassDisplayTitle(fields)).toBe("AI Foundations");
  });

  it("rejects raw Airtable record IDs as titles (data-leak guard)", () => {
    const fields = { "Registered For": ["recABCDEFGHIJ123"] };
    expect(extractClassDisplayTitle(fields)).toBe("");
  });

  it("returns empty string when no usable field is present", () => {
    expect(extractClassDisplayTitle({})).toBe("");
  });
});

describe("extractProjectDisplayTitle", () => {
  it("cleans project name at the first comma (PROJ-CERT-008)", () => {
    const fields = {
      "Project Phase Name (from Project They Joined)": [
        "Tech Fleet Network Phase 2, extra context, more notes",
      ],
    };
    expect(extractProjectDisplayTitle(fields)).toBe(
      "Tech Fleet Network Phase 2",
    );
  });

  it("skips a value that equals the user's name, case-insensitively (PROJ-CERT-007)", () => {
    const fields = {
      "Project Phase Name (from Project They Joined)": ["amanda wolf"],
      "Project They Joined": ["Real Project Name"],
    };
    expect(extractProjectDisplayTitle(fields, "Amanda Wolf")).toBe(
      "Real Project Name",
    );
  });

  it("rejects email-shaped values as project titles", () => {
    const fields = { "Project Phase Name (from Project They Joined)": ["a@b.co"] };
    expect(extractProjectDisplayTitle(fields)).toBe("");
  });

  it("rejects raw Airtable record IDs", () => {
    const fields = { "Project They Joined": ["recXYZABCDEFG123"] };
    expect(extractProjectDisplayTitle(fields)).toBe("");
  });

  it("returns empty string when nothing usable is present", () => {
    expect(extractProjectDisplayTitle({})).toBe("");
  });
});
