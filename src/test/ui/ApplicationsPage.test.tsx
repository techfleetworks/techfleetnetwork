import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

/* ── Mocks ──────────────────────────────────────────────── */

// Mock useAuth
const mockUser = { id: "user-1", email: "admin@test.com", user_metadata: { full_name: "Admin User" } };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: mockUser, session: {}, profile: null, loading: false, profileLoaded: true })),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock useAdmin — toggled per test
let mockIsAdmin = false;
vi.mock("@/hooks/use-admin", () => ({
  useAdmin: vi.fn(() => ({ isAdmin: mockIsAdmin, loading: false })),
}));

// Mock GeneralApplicationService
vi.mock("@/services/general-application.service", () => ({
  GeneralApplicationService: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            data: [],
            error: null,
          }),
          single: () => ({ data: null, error: null }),
          maybeSingle: () => ({ data: null, error: null }),
        }),
        in: () => ({ data: [], error: null }),
        order: () => ({ data: [], error: null }),
      }),
    }),
  },
}));

// Mock react-query to avoid real fetches
vi.mock("@/lib/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  };
});

import ApplicationsPage from "@/pages/ApplicationsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/applications"]}>
      <ApplicationsPage />
    </MemoryRouter>
  );
}

/* ── BDD Scenarios ──────────────────────────────────────── */

describe("Admin Application Review (ADMIN-APPS-001 to ADMIN-APPS-005)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = false;
  });

  /**
   * ADMIN-APPS-001: Admin sees Application Postings and Submitted Applications tabs
   */
  it("ADMIN-APPS-001: admin sees both tabs on the Applications page", () => {
    mockIsAdmin = true;
    renderPage();

    expect(screen.getByRole("tab", { name: /Application Postings/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Submitted Applications/i })).toBeInTheDocument();
  });

  /**
   * ADMIN-APPS-001 (cont): Application Postings tab shows existing application cards
   */
  it("ADMIN-APPS-001: Application Postings tab shows General Application card", () => {
    mockIsAdmin = true;
    renderPage();

    // The default tab is "postings" which includes the General Application card
    expect(screen.getByText("General Application")).toBeInTheDocument();
  });

  /**
   * ADMIN-APPS-005: Non-admin users do not see admin tabs
   */
  it("ADMIN-APPS-005: non-admin user does not see admin tabs", () => {
    mockIsAdmin = false;
    renderPage();

    expect(screen.queryByRole("tab", { name: /Application Postings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Submitted Applications/i })).not.toBeInTheDocument();
  });

  /**
   * ADMIN-APPS-005 (cont): Non-admin sees standard application cards directly
   */
  it("ADMIN-APPS-005: non-admin sees application cards directly without tabs", () => {
    mockIsAdmin = false;
    renderPage();

    expect(screen.getByText("General Application")).toBeInTheDocument();
    expect(screen.getByText("Project Applications")).toBeInTheDocument();
    expect(screen.getByText("Volunteer Applications")).toBeInTheDocument();
  });
});
