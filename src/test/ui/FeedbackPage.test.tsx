/**
 * FeedbackPage role-based view routing.
 *
 * Covers BDD scenarios:
 *   - 36.5 Admin sees feedback table instead of form on /feedback
 *   - 36.6 Member sees submission form on /feedback
 *   - FB-1  Admin entry point on feedback page
 *
 * The page swaps between AdminFeedbackView and FeedbackForm based purely on
 * the result of useAdmin(). We render the page with both states and assert
 * the correct subtree mounts. AdminFeedbackView and FeedbackForm are mocked
 * so this test stays fast and focused on the routing decision.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseAdmin = vi.fn();
vi.mock("@/hooks/use-admin", () => ({ useAdmin: () => mockUseAdmin() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "u@example.com" } }),
}));

vi.mock("@/contexts/PageHeaderContext", () => ({
  usePageHeader: () => ({ setHeader: vi.fn() }),
}));

vi.mock("@/lib/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("@/services/feedback.service", () => ({
  FEEDBACK_AREAS: ["General", "Bug"],
  FeedbackService: { submit: vi.fn(), list: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/discord-notify.service", () => ({
  DiscordNotifyService: { feedbackSubmitted: vi.fn() },
}));

vi.mock("@/components/AgGrid", () => ({
  ThemedAgGrid: () => <div data-testid="admin-feedback-table">Admin Table</div>,
}));

vi.mock("@/components/feedback/FeedbackDetailPanel", () => ({
  default: () => null,
}));

vi.mock("@/components/SectionEmptyState", () => ({
  SectionEmptyState: () => null,
}));

import FeedbackPage from "@/pages/FeedbackPage";

describe("FeedbackPage view routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the loading spinner while admin status resolves", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: false, loading: true });
    render(<FeedbackPage />);
    // Loader2 renders as an svg with animate-spin; assert via class hook.
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders the submission form for non-admin members (BDD 36.6)", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: false, loading: false });
    render(<FeedbackPage />);
    expect(screen.getByText("Share Your Feedback")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-feedback-table")).not.toBeInTheDocument();
  });

  it("renders the admin feedback view for admins (BDD 36.5 / FB-1)", () => {
    mockUseAdmin.mockReturnValue({ isAdmin: true, loading: false });
    render(<FeedbackPage />);
    // Admin view shows the "Add Feedback" entry point (FB-1) and never the
    // member submission card title.
    expect(screen.getByRole("button", { name: /add feedback/i })).toBeInTheDocument();
    expect(screen.queryByText("Share Your Feedback")).not.toBeInTheDocument();
  });
});
