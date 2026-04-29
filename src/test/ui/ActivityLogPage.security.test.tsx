import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("ActivityLogPage security and performance coverage", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "pages", "ActivityLogPage.tsx"), "utf8");

  it("SEC-ACTIVITY-LOG-HARDENING-034: uses centralized redacting logger instead of raw console errors", () => {
    expect(source).toContain('createLogger("ActivityLogPage")');
    expect(source).toContain('log.error("fetchLogs"');
    expect(source).toContain('log.warn("fetchProfiles"');
    expect(source).not.toContain("console.error");
  });

  it("SEC-ACTIVITY-LOG-HARDENING-034: avoids raw backend error disclosure in the UI", () => {
    expect(source).toContain('setLoadError("Activity log could not load. Please try again.")');
    expect(source).not.toContain("setLoadError(err instanceof Error ? err.message");
  });

  it("PERF-ACTIVITY-LOG-PROJECTION-035: uses explicit audit log projections instead of wildcard selects", () => {
    expect(source).toContain('const AUDIT_LOG_COLUMNS = "id, event_type, table_name, record_id, user_id, actor_email, changed_fields, error_message, created_at"');
    expect(source).toContain(".select(AUDIT_LOG_COLUMNS)");
    expect(source).not.toContain('.select("*")');
  });
});
