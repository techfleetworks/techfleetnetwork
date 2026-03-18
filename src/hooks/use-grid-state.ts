import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ColumnState, SortModelItem } from "ag-grid-community";

export interface GridState {
  columnState?: ColumnState[];
  filterModel?: Record<string, unknown>;
}

/**
 * Persist AG Grid column widths, order, sort, and filter per user per grid.
 * Debounces saves to avoid excessive writes.
 */
export function useGridState(gridId: string) {
  const { user } = useAuth();
  const [savedState, setSavedState] = useState<GridState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load state on mount
  useEffect(() => {
    if (!user) { setLoaded(true); return; }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("grid_view_states" as any)
          .select("state")
          .eq("user_id", user.id)
          .eq("grid_id", gridId)
          .maybeSingle();
        if (!error && data) {
          setSavedState((data as any).state as GridState);
        }
      } catch {
        // silent – fall back to defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, [user, gridId]);

  // Debounced save
  const persistState = useCallback(
    (state: GridState) => {
      if (!user) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          await (supabase as any)
            .from("grid_view_states")
            .upsert(
              { user_id: user.id, grid_id: gridId, state, updated_at: new Date().toISOString() },
              { onConflict: "user_id,grid_id" }
            );
        } catch {
          // silent
        }
      }, 500);
    },
    [user, gridId]
  );

  return { savedState, loaded, persistState };
}
