import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PROJECT_COLUMNS,
  HANDOFF_PROJECT_COLUMNS,
  MY_APPLICATIONS_PROJECT_COLUMNS,
  PROJECT_APPLICATION_COLUMNS,
  PROJECT_APP_STATUS_COLUMNS,
  RECRUITING_PROJECT_COLUMNS,
  ROSTER_PROJECT_COLUMNS,
  SUBMISSION_DETAIL_PROJECT_COLUMNS,
  getProjectDetailPublic,
  getProjectForApplication,
  getProjectForApplicationStatus,
  getProjectInternalLinks,
  listRecruitingProjects,
} from "@/services/project.service";
import { supabase } from "@/integrations/supabase/client";
import { NotFoundError } from "@/lib/errors/AppError";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
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

describe("projectService — apply column contract (ADR-0056 / ADR-0065 / ADR-0071)", () => {
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

describe("projectService — read-page column contracts (ADR-0071 PR2)", () => {
  const READ_PAGE_COLUMNS: [string, string][] = [
    ["DASHBOARD_PROJECT_COLUMNS", DASHBOARD_PROJECT_COLUMNS],
    ["MY_APPLICATIONS_PROJECT_COLUMNS", MY_APPLICATIONS_PROJECT_COLUMNS],
    ["PROJECT_APP_STATUS_COLUMNS", PROJECT_APP_STATUS_COLUMNS],
    ["SUBMISSION_DETAIL_PROJECT_COLUMNS", SUBMISSION_DETAIL_PROJECT_COLUMNS],
    ["RECRUITING_PROJECT_COLUMNS", RECRUITING_PROJECT_COLUMNS],
    ["HANDOFF_PROJECT_COLUMNS", HANDOFF_PROJECT_COLUMNS],
    ["ROSTER_PROJECT_COLUMNS", ROSTER_PROJECT_COLUMNS],
  ];

  describe.each(READ_PAGE_COLUMNS)("%s", (_name, cols) => {
    it("never selects '*' (would expand to the ungranted operational columns → 42501/403)", () => {
      expect(cols).not.toContain("*");
    });
    it.each(OPERATIONAL_COLUMNS)("excludes the operational column %s (ADR-0056)", (op) => {
      expect(cols).not.toContain(op);
    });
  });
});

describe("projectService.getProjectForApplicationStatus", () => {
  beforeEach(() => vi.clearAllMocks());
  function mockMaybeSingle(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    return { select, eq, maybeSingle };
  }

  it("reads projects by id with the pinned app-status columns", async () => {
    const row = { id: "p1" };
    const { select, eq } = mockMaybeSingle({ data: row, error: null });
    const result = await getProjectForApplicationStatus("p1");
    expect(select).toHaveBeenCalledWith(PROJECT_APP_STATUS_COLUMNS);
    expect(eq).toHaveBeenCalledWith("id", "p1");
    expect(result).toEqual(row);
  });

  it("throws NotFoundError on a missing row", async () => {
    mockMaybeSingle({ data: null, error: null });
    await expect(getProjectForApplicationStatus("x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws on a read error", async () => {
    mockMaybeSingle({ data: null, error: new Error("boom") });
    await expect(getProjectForApplicationStatus("x")).rejects.toThrow("boom");
  });
});

describe("projectService.listRecruitingProjects", () => {
  beforeEach(() => vi.clearAllMocks());
  function mockOrder(result: { data: unknown; error: unknown }) {
    const order = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ order });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    return { select, order };
  }

  it("selects the pinned columns ordered by created_at desc and returns the array", async () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const { select, order } = mockOrder({ data: rows, error: null });
    const result = await listRecruitingProjects();
    expect(select).toHaveBeenCalledWith(RECRUITING_PROJECT_COLUMNS);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual(rows);
  });

  it("returns [] when data is null", async () => {
    mockOrder({ data: null, error: null });
    expect(await listRecruitingProjects()).toEqual([]);
  });

  it("throws on a read error", async () => {
    mockOrder({ data: null, error: new Error("boom") });
    await expect(listRecruitingProjects()).rejects.toThrow("boom");
  });
});

describe("projectService.getProjectInternalLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the RPC and returns its first row (operational links)", async () => {
    const links = {
      discord_role_id: "r1",
      discord_role_name: "Role",
      notion_repository_url: null,
      client_intake_url: null,
    };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [links], error: null } as never);
    const result = await getProjectInternalLinks("p1");
    expect(supabase.rpc).toHaveBeenCalledWith("get_project_internal_links", { p_project_id: "p1" });
    expect(result).toEqual(links);
  });

  it("returns null when the RPC returns no rows", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    expect(await getProjectInternalLinks("p1")).toBeNull();
  });

  it("throws on an RPC error (never silently drops it)", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("denied") } as never);
    await expect(getProjectInternalLinks("p1")).rejects.toThrow("denied");
  });
});
