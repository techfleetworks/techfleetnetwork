// Pure, testable helpers for the youtube-durations gateway (kept out of index.ts
// so they can be unit-tested without starting Deno.serve).
export const YT_ID = /^[A-Za-z0-9_-]{11}$/; // canonical YouTube video id shape
export const MAX_IDS = 60; // one YouTube videos.list call takes up to 50; cap tightly

/** ISO-8601 duration (PT#H#M#S) → whole seconds, or null if unparseable. */
export function iso8601ToSeconds(d: unknown): number | null {
  if (typeof d !== "string") return null;
  const m = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d);
  if (!m) return null;
  const [, h, min, s] = m;
  if (h === undefined && min === undefined && s === undefined) return null; // bare "PT"
  const total = Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
  return Number.isFinite(total) ? total : null;
}

/** Parse + validate the `ids` query into a unique, well-formed, capped id list. */
export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((s) => s.trim()).filter((s) => YT_ID.test(s));
  return [...new Set(ids)].slice(0, MAX_IDS);
}

/** Map a YouTube videos.list response to { videoId: seconds } (allowlisted ids only). */
export function durationsFromResponse(
  body: { items?: Array<{ id?: string; contentDetails?: { duration?: string } }> } | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of body?.items ?? []) {
    const secs = iso8601ToSeconds(item.contentDetails?.duration);
    if (item.id && YT_ID.test(item.id) && secs != null) out[item.id] = secs;
  }
  return out;
}
