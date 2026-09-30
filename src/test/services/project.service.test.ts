import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_APPLICATION_COLUMNS,
  getProjectDetailPublic,
  getProjectForApplication,
} from "@/services/project.service";
import { supabase } from "@/integrations/supabase/client";
import { NotFoundError } from "@/lib/errors/AppError";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

// The four operational columns are column-scoped away from `authenticated` (ADR-0056) and must NEVER
// appear in a frontend projects select — they come only from get_project_internal_links / the
// service-role edge function. A frontend read that names one fails 42501/403 (the ADR-0065 outage).
const OPERATIONAL_COLUMNS = [
  "discord_role_id",
  "discord_role_name",
  "notion_repository_url",
  "client_intake_url",
];

describe("projectService — apply column contract (ADR-0056 / ADR-0065 / ADR-0066)", () => {
  it("keeps is_shipathon so the Shipathon question flow stays correct (ADR-0055)", () => {
    expect(PROJECT_APPLICATION_COLUMNS).toContain("is_shipathon");
  });

  it("never selects '*' (a '*' expands to the ungranted operational columns → 42501/403)", () => {
    expect(PROJECT_APPLICATION_COLUMNS).not.toContain("*");
  });

  it.each(OPERATIONAL_COLUMNS)(
    "excludes the operational column %s (column-scoped away for authenticated, ADR-0056)",
    (col) => {
      expect(PROJECT_APPLICATION_COLUMNS).not.toContain(col);
    }
  );
});

describe("projectService.getProjectForApplication", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockMaybeSingle(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    return { select, eq, maybeSingle };
  }

  it("reads public.projects by id with the pinned explicit column contract", async () => {
    const row = { id: "p1", is_shipathon: true };
    const { select, eq } = mockMaybeSingle({ data: row, error: null });

    const result = await getProjectForApplication("p1");

    expect(supabase.from).toHaveBeenCalledWith("projects");
    expect(select).toHaveBeenCalledWith(PROJECT_APPLICATION_COLUMNS);
    expect(eq).toHaveBeenCalledWith("id", "p1");
    expect(result).toEqual(row);
  });

  it("throws when the read errors — a failed read must surface, never resolve to null", async () => {
    mockMaybeSingle({ data: null, error: new Error("42501") });
    await expect(getProjectForApplication("p1")).rejects.toThrow("42501");
  });

  it("throws NotFoundError when the project is missing (never silently resolves to null)", async () => {
    mockMaybeSingle({ data: null, error: null });
    await expect(getProjectForApplication("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("projectService.getProjectDetailPublic", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("calls the public-project-detail edge fn with the projectId and returns the payload", async () => {
    const payload = {
      project: { id: "p1" },
      client: null,
      milestoneData: { deliverables: [], activities: [], skills: [] },
      applicationCount: 0,
      coordinatorName: null,
    };
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });

    const result = await getProjectDetailPublic("p1");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0] as string).toContain(
      "/functions/v1/public-project-detail?projectId=p1"
    );
    expect(result).toEqual(payload);
  });

  it("throws the server error message on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Project is closed" }),
    });
    await expect(getProjectDetailPublic("p1")).rejects.toThrow("Project is closed");
  });

  it("throws a generic message when a non-ok response carries no error body", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error("no json")) });
    await expect(getProjectDetailPublic("p1")).rejects.toThrow("Failed to load project");
  });
});
