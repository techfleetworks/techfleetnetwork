import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";

const { mockGetNetworkStats } = vi.hoisted(() => ({
  mockGetNetworkStats: vi.fn(),
}));

vi.mock("@/services/stats.service", () => ({
  StatsService: { getNetworkStats: mockGetNetworkStats },
}));

import { NetworkActivity } from "@/components/NetworkActivity";

describe("NetworkActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows real aggregate stats when the public stats request succeeds", async () => {
    mockGetNetworkStats.mockResolvedValue({
      total_signups: 190,
      core_courses_active: 76,
      beginner_courses_active: 0,
      advanced_courses_active: 0,
      applications_completed: 10,
      badges_earned: 86,
      prev_week_start: "2026-04-22",
      prev_week_end: "2026-04-28",
      prev_week_signups: 71,
      prev_week_core_active: 24,
      prev_week_beginner_active: 0,
      prev_week_advanced_active: 0,
      prev_week_applications: 2,
      prev_week_badges: 26,
      projects_open_applications: 1,
      projects_coming_soon: 3,
      projects_live: 0,
      projects_previously_completed: 120,
    });

    renderWithRouter(<NetworkActivity showMap={false} />);

    expect(await screen.findByText("190")).toBeInTheDocument();
    expect(screen.getByText("76")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("shows an unavailable state instead of rendering every stat as zero when stats fail", async () => {
    mockGetNetworkStats.mockRejectedValue(new Error("permission denied for function get_network_stats"));

    renderWithRouter(<NetworkActivity showMap={false} />);

    expect(await screen.findByText(/could not load community activity/i)).toBeInTheDocument();
    expect(screen.queryByText("All Time")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Training")).not.toBeInTheDocument();
  });
});
