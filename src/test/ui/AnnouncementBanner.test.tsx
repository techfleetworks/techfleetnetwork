import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

const {
  maybeSingle,
  upsert,
  eqState,
  eqGrid,
  select,
  from,
  setQueryData,
} = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const upsert = vi.fn();
  const eqState = vi.fn(() => ({ maybeSingle }));
  const eqGrid = vi.fn(() => ({ eq: eqState, maybeSingle }));
  const select = vi.fn(() => ({ eq: eqGrid }));
  const from = vi.fn(() => ({ select, upsert }));
  const setQueryData = vi.fn();

  return { maybeSingle, upsert, eqState, eqGrid, select, from, setQueryData };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

vi.mock("@/lib/react-query", () => ({
  useQueryClient: () => ({ setQueryData }),
  useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
    const React = require("react");
    const [data, setData] = React.useState<string[] | undefined>(undefined);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
      let active = true;
      queryFn().then((result) => {
        if (active) {
          setData(result as string[]);
          setIsLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }, [queryFn]);

    return { data, isLoading };
  },
}));

describe("AnnouncementBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null });
    upsert.mockResolvedValue({ error: null });
  });

  it("stores dismissals in grid_view_states instead of dashboard preferences", async () => {
    render(<AnnouncementBanner id="banner-1" title="Important" message="Message" />);

    const button = await screen.findByRole("button", { name: /dismiss announcement/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(from).toHaveBeenCalledWith("grid_view_states");
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          grid_id: "announcement_banner_dismissals",
          state: { dismissed_banners: ["banner-1"] },
        }),
        { onConflict: "user_id,grid_id" },
      );
    });

    expect(from).not.toHaveBeenCalledWith("dashboard_preferences");
  });
});