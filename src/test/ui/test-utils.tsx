import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@/lib/react-query";

// Minimal wrapper for components that need Router + React Query context
function RouterWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWithRouter(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: RouterWrapper, ...options });
}

// Mock AuthContext values
export const mockAuthLoggedOut = {
  user: null,
  session: null,
  profile: null,
  loading: false,
  profileLoaded: true,
  signOut: vi.fn(),
  signOutAllDevices: vi.fn(),
  refreshProfile: vi.fn(),
};

export const mockAuthLoggedIn = {
  user: { id: "test-user-id", email: "test@example.com", user_metadata: { full_name: "Test User" } } as any,
  session: {} as any,
  profile: {
    id: "profile-id",
    user_id: "test-user-id",
    first_name: "Test",
    last_name: "User",
    display_name: "Test User",
    email: "test@example.com",
    country: "United States",
    discord_username: "testuser",
    discord_user_id: "",
    bio: "",
    professional_background: "",
    interests: [],
    profile_completed: true,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  loading: false,
  profileLoaded: true,
  signOut: vi.fn(),
  signOutAllDevices: vi.fn(),
  refreshProfile: vi.fn(),
};
