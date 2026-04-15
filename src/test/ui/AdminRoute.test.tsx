import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminRoute } from "@/components/AdminRoute";

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useAdmin
const mockUseAdmin = vi.fn();
vi.mock("@/hooks/use-admin", () => ({
  useAdmin: () => mockUseAdmin(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function renderWithRouter(initialEntry: string = "/admin/test") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/admin/test"
          element={
            <AdminRoute>
              <div data-testid="admin-content">Admin Content</div>
            </AdminRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while auth is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, profileLoaded: false });
    mockUseAdmin.mockReturnValue({ isAdmin: false, loading: true });
    renderWithRouter();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to /login when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, profileLoaded: true });
    mockUseAdmin.mockReturnValue({ isAdmin: false, loading: false });
    renderWithRouter();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("redirects to /dashboard when user is not admin", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      loading: false,
      profileLoaded: true,
    });
    mockUseAdmin.mockReturnValue({ isAdmin: false, loading: false });
    renderWithRouter();
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("renders children when user is admin", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      loading: false,
      profileLoaded: true,
    });
    mockUseAdmin.mockReturnValue({ isAdmin: true, loading: false });
    renderWithRouter();
    expect(screen.getByTestId("admin-content")).toBeInTheDocument();
  });
});
