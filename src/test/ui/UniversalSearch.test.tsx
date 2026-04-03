import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { UniversalSearch } from "@/components/UniversalSearch";
import type { ReactNode } from "react";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Default to desktop
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// Mock useAuth
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: {}, profile: null, loading: false, profileLoaded: true }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Mock useAdmin
let mockIsAdmin = false;
vi.mock("@/hooks/use-admin", () => ({
  useAdmin: () => ({ isAdmin: mockIsAdmin, loading: false }),
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        ilike: () => ({ limit: () => ({ data: [], error: null }) }),
        or: () => ({ limit: () => ({ data: [], error: null }) }),
        in: () => ({ data: [], error: null }),
        eq: () => ({ single: () => ({ data: null, error: null }), maybeSingle: () => ({ data: null, error: null }) }),
        limit: () => ({ data: [], error: null }),
      }),
    }),
  },
}));

function renderSearch() {
  return render(
    <MemoryRouter>
      <UniversalSearch />
    </MemoryRouter>
  );
}

describe("Universal Search (BDD 38.1–38.15)", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockIsAdmin = false;
  });

  // 38.1 – Open search dialog via button
  it("38.1: opens search dialog when button is clicked", async () => {
    renderSearch();
    const btn = screen.getByRole("button", { name: /search/i });
    await userEvent.click(btn);
    expect(screen.getByPlaceholderText(/search courses/i)).toBeInTheDocument();
  });

  // 38.2 – Keyboard shortcut (Ctrl+K)
  it("38.2: opens search dialog via Ctrl+K", () => {
    renderSearch();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search courses/i)).toBeInTheDocument();
  });

  // 38.3 – Partial keyword match
  it("38.3: filters results with partial keyword 'agil'", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    const input = screen.getByPlaceholderText(/search courses/i);
    await userEvent.type(input, "agil");
    expect(screen.getByText("Build an Agile Mindset")).toBeInTheDocument();
    expect(screen.getByText("Agile Cross-Functional Team Dynamics")).toBeInTheDocument();
  });

  // 38.5 – Case-insensitive
  it("38.5: search is case-insensitive", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    const input = screen.getByPlaceholderText(/search courses/i);
    await userEvent.type(input, "VOLUNTEER");
    expect(screen.getByText("Join Volunteer Teams")).toBeInTheDocument();
    expect(screen.getByText("Volunteer Applications")).toBeInTheDocument();
  });

  // 38.7 – No results
  it("38.7: shows no results message for non-matching query", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    const input = screen.getByPlaceholderText(/search courses/i);
    await userEvent.type(input, "xyznonexistent");
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  // 38.9 – All items visible when empty
  it("38.9: shows all items when query is empty", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(screen.getByText("Onboarding Steps")).toBeInTheDocument();
    expect(screen.getByText("General Application")).toBeInTheDocument();
    expect(screen.getByText("Project Training Overview")).toBeInTheDocument();
  });

  // 38.10 – Desktop shows shortcut hint
  it("38.10: desktop search button shows Search… text", () => {
    renderSearch();
    expect(screen.getByText("Search…")).toBeInTheDocument();
  });

  // 38.12 – Search by group name
  it("38.12: searching by group name shows that group's items", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    const input = screen.getByPlaceholderText(/search courses/i);
    await userEvent.type(input, "Applications");
    expect(screen.getByText("General Application")).toBeInTheDocument();
    expect(screen.getByText("Project Applications")).toBeInTheDocument();
    expect(screen.getByText("Volunteer Applications")).toBeInTheDocument();
  });

  // 38.12b – Ask Fleety always visible
  it("38.12b: always shows 'Ask Fleety the Helper Bot' option", async () => {
    renderSearch();
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(screen.getByText("Ask Fleety the Helper Bot")).toBeInTheDocument();
  });

  // 38.15 – Accessibility
  it("38.15: search button has accessible aria-label", () => {
    renderSearch();
    const btn = screen.getByRole("button", { name: /search courses, applications, clients, projects, and members/i });
    expect(btn).toBeInTheDocument();
  });
});
