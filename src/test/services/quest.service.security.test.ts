import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("QuestService OWASP A02 data minimization", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "services", "quest.service.ts"), "utf8");

  it("SEC-QUEST-SERVICE-PROJECTION-043: avoids wildcard projections", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).not.toContain(".select('*')");
  });

  it("SEC-QUEST-SERVICE-PROJECTION-043: uses explicit allowlists for quest reads", () => {
    expect(source).toContain("QUEST_PATH_COLUMNS");
    expect(source).toContain("QUEST_PATH_STEP_COLUMNS");
    expect(source).toContain("USER_QUEST_SELECTION_COLUMNS");
    expect(source).toContain(".select(QUEST_PATH_COLUMNS)");
    expect(source).toContain(".select(QUEST_PATH_STEP_COLUMNS)");
    expect(source).toContain(".select(USER_QUEST_SELECTION_COLUMNS)");
  });

  it("SEC-QUEST-SERVICE-PROJECTION-043: bounds user quest selections to journey UI fields", () => {
    expect(source).toContain('"user_id"');
    expect(source).toContain('"path_id"');
    expect(source).toContain('"completed_at"');
    expect(source).not.toContain("profile_email");
    expect(source).not.toContain("metadata");
  });
});