import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import DashboardPage from "@/pages/DashboardPage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", user_metadata: { full_name: "Test User" } },
    profile: { first_name: "Test", display_name: "Test User" },
  }),
}));

vi.mock("@/hooks/use-dashboard-preferences", () => ({
  useDashboardPreferences: () => ({
    visibleWidgets: { broken: true } as any,
    widgetOrder: ["core_courses"],
    isVisible: () => true,
    toggleWidget: vi.fn(),
    reorderWidgets: vi.fn(),
    isNewUser: false,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-journey-progress", () => ({
  useCompletedCount: () => ({ data: 0 }),
}));

vi.mock("@/hooks/use-announcements", () => ({
  useLatestAnnouncements: () => ({ data: [] }),
}));

vi.mock("@/lib/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryFn, enabled = true }: { queryFn?: () => unknown; enabled?: boolean }) => {
    if (!enabled) return { data: undefined };
    return { data: queryFn ? queryFn() : undefined };
  },
}));

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
  });

  it("renders without crashing when visibleWidgets is malformed", async () => {
    renderWithRouter(<DashboardPage />);

    expect(await screen.findByText(/welcome back, test/i)).toBeInTheDocument();
    expect(screen.getByText(/course completion/i)).toBeInTheDocument();
  });
});