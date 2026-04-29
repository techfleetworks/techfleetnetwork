import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import DashboardPage from "@/pages/DashboardPage";

const mockState = vi.hoisted(() => ({
  dashboardOverview: undefined as unknown,
  widgetOrder: ["core_courses"],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", user_metadata: { full_name: "Test User" } },
    profile: { first_name: "Test", display_name: "Test User" },
  }),
}));

vi.mock("@/hooks/use-dashboard-preferences", () => ({
  useDashboardPreferences: () => ({
    visibleWidgets: { broken: true } as any,
    widgetOrder: mockState.widgetOrder,
    isVisible: () => true,
    toggleWidget: vi.fn(),
    reorderWidgets: vi.fn(),
    isNewUser: false,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-dashboard-overview", () => ({
  useDashboardOverview: () => ({ data: mockState.dashboardOverview }),
}));

vi.mock("@/hooks/use-journey-progress", () => ({
  useCompletedCount: () => ({ data: 0 }),
}));

vi.mock("@/hooks/use-announcements", () => ({
  useLatestAnnouncements: () => ({ data: [] }),
}));

vi.mock("@/lib/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useQuery: ({ queryFn, enabled = true }: { queryFn?: () => unknown; enabled?: boolean }) => {
      if (!enabled) return { data: undefined };
      return { data: queryFn ? queryFn() : undefined };
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
        in: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock("@/services/stats.service", () => ({
  StatsService: { getNetworkStats: vi.fn(async () => ({ badges_earned: 0 })) },
}));

vi.mock("@/components/BadgesDisplay", () => ({
  BadgesDisplay: () => <div>Badges</div>,
}));

vi.mock("@/components/DashboardCustomizer", () => ({
  DashboardCustomizer: () => <button type="button">Customize</button>,
}));

vi.mock("@/components/DiscordInviteBanner", () => ({
  DiscordInviteBanner: () => <div>Discord banner</div>,
}));

vi.mock("@/components/DashboardEmptyState", () => ({
  DashboardEmptyState: () => <div>Empty state</div>,
}));

vi.mock("@/components/SectionEmptyState", () => ({
  SectionEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/NetworkActivity", () => ({
  NetworkActivity: () => <div>Network Activity</div>,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.dashboardOverview = undefined;
    mockState.widgetOrder = ["core_courses"];
  });

  it("renders without crashing when visibleWidgets is malformed", async () => {
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText(/welcome back, test/i)).toBeInTheDocument();
    expect(screen.getByText(/course completion/i)).toBeInTheDocument();
  });

  it("DASH-APP-STATUS-001: shows submitted general application status on the dashboard", async () => {
    mockState.widgetOrder = ["my_project_apps"];
    mockState.dashboardOverview = {
      phase_counts: {},
      general_application: {
        id: "general-app-1",
        status: "completed",
        completed_at: "2026-04-20T12:00:00Z",
        updated_at: "2026-04-20T12:00:00Z",
        current_section: 5,
      },
      project_applications: [],
    };

    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText("General Application")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });
});