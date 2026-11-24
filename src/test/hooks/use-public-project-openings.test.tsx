// B11: usePublicProjectOpenings joins the gateway's separate projects + clients
// arrays into one list (each opening carries its client), reading the public
// gateway with apikey only (anon has no table grants). The join + missing-client
// handling is real logic, so it is tested against a mocked fetch.
// Module under test: src/hooks/use-public-catalog.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@/lib/react-query";
import { usePublicProjectOpenings } from "@/hooks/use-public-catalog";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePublicProjectOpenings (B11)", () => {
  it("joins each project to its client and reads public-project-openings with apikey", async () => {
    const fetchMock = mockFetchOnce({
      projects: [
        { id: "p1", client_id: "cl1", project_type: "web_app", project_status: "apply_now", team_hats: ["UX"], current_phase_milestones: [], friendly_name: "A", description: null, is_shipathon: false, created_at: "2026-11-01T00:00:00Z" },
        { id: "p2", client_id: "cl2", project_type: "research", project_status: "coming_soon", team_hats: [], current_phase_milestones: [], friendly_name: "B", description: null, is_shipathon: false, created_at: "2026-11-02T00:00:00Z" },
      ],
      clients: [
        { id: "cl1", name: "Acme", logo_url: null },
        { id: "cl2", name: "Globex", logo_url: "https://x/logo.png" },
      ],
    });

    const { result } = renderHook(() => usePublicProjectOpenings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].client).toEqual({ id: "cl1", name: "Acme", logo_url: null });
    expect(result.current.data?.[1].client?.name).toBe("Globex");

    // Reads the public gateway with an apikey header (the anon raw-fetch path, not
    // an authed client). The header KEY is present even where the env value is unset
    // in tests — asserting its presence proves the anon contract without depending
    // on a build-time env var.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("public-project-openings");
    expect(Object.prototype.hasOwnProperty.call(init.headers, "apikey")).toBe(true);
  });

  it("leaves client null when a project references an unknown or missing client_id", async () => {
    mockFetchOnce({
      projects: [
        { id: "p1", client_id: "missing", project_type: "web_app", project_status: "apply_now", team_hats: [], current_phase_milestones: [], friendly_name: "A", description: null, is_shipathon: false, created_at: "2026-11-01T00:00:00Z" },
        { id: "p2", client_id: null, project_type: "web_app", project_status: "apply_now", team_hats: [], current_phase_milestones: [], friendly_name: "B", description: null, is_shipathon: false, created_at: "2026-11-01T00:00:00Z" },
      ],
      clients: [{ id: "cl1", name: "Acme", logo_url: null }],
    });

    const { result } = renderHook(() => usePublicProjectOpenings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0].client).toBeNull();
    expect(result.current.data?.[1].client).toBeNull();
  });

  it("returns an empty list (not a throw) when the gateway sends no projects", async () => {
    mockFetchOnce({ projects: [], clients: [] });
    const { result } = renderHook(() => usePublicProjectOpenings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
