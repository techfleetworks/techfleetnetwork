// Public YouTube video-length lookup (public-access B12). Calls the
// youtube-durations edge gateway (which holds the API key server-side) for a set
// of video ids and returns a { videoId: seconds } map. Durations are immutable, so
// it caches forever. Any failure resolves to {} — a missing length is cosmetic and
// must never break or error the course page.
import { useQuery } from "@/lib/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const REQUEST_TIMEOUT_MS = 8_000;

export type DurationMap = Record<string, number>;

export function useYoutubeDurations(videoIds: readonly string[]) {
  // Stable, deduped, sorted key so the same video set hits one cache entry.
  const ids = [...new Set(videoIds.filter(Boolean))].sort();
  return useQuery<DurationMap>({
    queryKey: ["youtube-durations", ids.join(",")] as const,
    enabled: ids.length > 0,
    staleTime: Infinity, // a video's length never changes
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/youtube-durations?ids=${encodeURIComponent(ids.join(","))}`,
          { headers: { apikey: ANON_KEY, "Content-Type": "application/json" }, signal: controller.signal },
        );
        if (!res.ok) return {};
        const data = (await res.json()) as { durations?: DurationMap };
        return data.durations ?? {};
      } catch {
        // Cosmetic field: recover to empty rather than surface an error state.
        return {};
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

/** Seconds → "8:30" / "1:02:05". Returns undefined for missing/invalid input. */
export function formatDuration(seconds: number | undefined | null): string | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
