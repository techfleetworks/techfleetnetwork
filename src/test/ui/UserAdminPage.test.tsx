import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@/lib/react-query";

/**
 * User Admin page.
 * - BDD 13.2: access control is enforced by the <AdminRoute> wrapper (verified in
 *   AdminRoute.test.tsx); this suite verifies the page renders its admin surface when reached.
 * - Roster pagination: admin_list_users() is a SETOF, so PostgREST caps each response at the
 *   project max-rows (1000). The roster + "N users" badge must page through every window instead
 *   of truncating at 1000 (the reported bug: 1717 accounts displayed as "1000 users").
 */

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

const mockUseAdmin = vi.fn();
vi.mock("@/hooks/use-admin", () => ({ useAdmin: () => mockUseAdmin() }));

// The roster the mocked admin_list_users() RPC serves, one max-rows window at a time via .range().
let mockAccounts: Array<{ user_id: string } & Record<string, unknown>> = [];
const rangeCalls: Array<[number, number]> = [];

/** A minimal PostgREST-builder stand-in: awaitable AND pageable via .range(from, to). */
function adminUsersBuilder() {
  return {
    range: (from: number, to: number) => {
      rangeCalls.push([from, to]);
      return Promise.resolve({ data: mockAccounts.slice(from, to + 1), error: null });
    },
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: mockAccounts, error: null }),
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) =>
      name === "admin_list_users"
        ? adminUsersBuilder()
        : Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        order: () => ({ data: [], error: null }),
        is: () => ({ data: [], error: null }),
        eq: () => ({
          eq: () => ({ maybeSingle: () => ({ data: null }), single: () => ({ data: null }) }),
          single: () => ({ data: null }),
        }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: { invoke: vi.fn() },
  },
}));

async function renderPage() {
  const { default: UserAdminPage } = await import("@/pages/UserAdminPage");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/users"]}>
        <UserAdminPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeAccount(i: number) {
  return {
    user_id: `u-${i}`,
    email: `u${i}@example.test`,
    email_confirmed: true,
    account_created_at: new Date(Date.now() - i * 1000).toISOString(),
    last_sign_in_at: null,
    phone: null,
    is_banned: false,
    auth_providers: [],
    has_profile: true,
    profile_completed: true,
    first_name: null,
    last_name: null,
    display_name: `User ${i}`,
    discord_username: null,
    country: null,
    timezone: null,
    membership_tier: null,
    is_founding_member: false,
    is_test_account: false,
    onboarded_at: null,
    profile_created_at: null,
    profile: null,
  };
}

describe("UserAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccounts = [];
    rangeCalls.length = 0;
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      profile: { first_name: "Test" },
      loading: false,
      profileLoaded: true,
    });
    mockUseAdmin.mockReturnValue({ isAdmin: true, loading: false });
  });

  it("renders the User Admin surface for an admin (BDD 13.2; access control by AdminRoute)", async () => {
    await renderPage();
    expect(await screen.findByText("User Admin")).toBeInTheDocument();
  });

  it("pages past the 1000-row PostgREST cap so the badge shows the true total, not 1000", async () => {
    // 1717 accounts — more than one max-rows window. A single un-paginated call caps at 1000.
    mockAccounts = Array.from({ length: 1717 }, (_, i) => makeAccount(i));

    await renderPage();

    // The badge reads users.length — it must be the full 1717, never the 1000 cap.
    expect(await screen.findByText("1717 users")).toBeInTheDocument();
    expect(screen.queryByText("1000 users")).not.toBeInTheDocument();
    // Proof it actually paginated: a second window was requested starting at row 1000.
    expect(rangeCalls.some(([from]) => from === 1000)).toBe(true);
  });
});
