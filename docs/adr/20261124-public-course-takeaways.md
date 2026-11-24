# 20261124 — Public course lessons show an authored takeaway, not a live video length (B12)

- Status: Accepted
- Date: 2026-11-24
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), B12 (§6.2)
- Supersedes: **20261123-public-course-detail** (the youtube-durations video-length route)
- Related: 20261118-public-courses-gateway (A8), 20261118-public-classes-pages (B10). BUILD-PLAN Phase B.

## Context and problem statement

The public free-course detail page (B12, PR #520) showed, per lesson, the title, a
video/reading indicator, and the **video length**, fetched live from a new
`youtube-durations` edge function that held a `YOUTUBE_API_KEY` server-side. That
length never rendered in practice: the owner never set the key, and the owner has now
decided to **drop the YouTube-length route for now**. Showing minutes is not worth a
third-party API dependency, a secret to manage, and a public edge function to operate.

The owner wants each lesson to instead show a **one-sentence, plain-English takeaway**
of its key point — something a logged-out visitor can skim to judge the course — drawn
from the lesson's own text.

## Decision

- **Drop the YouTube-length route entirely.** Remove the `youtube-durations` edge
  function, the `use-youtube-durations` hook, `formatDuration`, the `courseVideoIds`
  registry helper, the `[functions.youtube-durations]` config, the CI deno-test entry,
  and the smoke/CORS wiring (the `map`-shape smoke branch existed only for it). No
  `YOUTUBE_API_KEY` is needed anywhere. Leaving it as unused code/infra is the dead
  code the repo rules forbid, and it is recoverable from git history if revisited.
- **Show an authored takeaway per lesson.** Each Core lesson gets ONE plain-English
  sentence (about an 8th-grade level, no em dashes, no filler), authored from that
  lesson's own `content` in `src/data/*-course.ts`. They are static, committed data in
  `src/data/public-course-takeaways.ts` (a `Record<lessonId, string>`), attached to the
  outline by `publicCourseModules`. No runtime AI, no new service — the sentences are
  content, like the lesson titles already are.
- **Takeaways live beside the other public course content, keyed by lesson id.** The
  registry (`public-course-registry.ts`) is the one adapter over the bundled course
  data; it looks up `LESSON_TAKEAWAYS[id] ?? null`, so an unmapped lesson renders no
  sentence rather than crashing. A coverage test holds every Core lesson mapped.
- **The page formats only.** `PublicCourseDetailPage` shows the title, the video/reading
  icon, and the takeaway sentence; it computes no length and calls no duration hook.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** show a useful per-lesson summary to anon without a third-party
  API, a secret, or a new runtime service; keep visibility owned server-side; no dead
  code left behind.
- **Pattern chosen:** static authored data (content) behind the existing registry
  Adapter; Humble view. No Strategy/factory — a single lookup suffices.
- **Candidates considered:**
  - (a) Authored static takeaways in a data map, shown via the registry — chosen.
  - (b) Keep youtube-durations, just set the key — rejected by the owner (not worth the
    API/secret/edge-function cost for minutes).
  - (c) Generate the takeaway at runtime from lesson text (client or an LLM call) —
    rejected: runtime cost/variance for what is stable content; authored once is simpler
    and reviewable.
- **Failure / rot prevented:** a dead public edge function and an unused API key; a
  blank per-lesson line; a crash on an unmapped lesson.
- **Security/operational trade-off:** removes a public internet-egress edge function and
  a managed secret — strictly less attack/ops surface. No new data surface (the §6
  public-courses gateway still owns which courses are public; takeaways are bundled
  content, already public like the titles).
- **Verify correct application:** vitest — the page renders each lesson's takeaway and
  shows no mm:ss length; the registry maps every Core lesson to a non-empty takeaway and
  an unmapped id to null; the removed youtube wiring no longer appears in the smokes.
- **Real guarantee:** every Core lesson shows an authored sentence and no minutes. It
  does not guarantee each sentence is the *best* possible summary — they are authored
  from the lesson text and reviewed, not formally verified against it.

## Consequences

- New: `src/data/public-course-takeaways.ts` (84 lesson takeaways), a `takeaway` field
  on `PublicLessonOutline`, registry coverage tests.
- Removed: `supabase/functions/youtube-durations/**`, `src/hooks/use-youtube-durations.ts`,
  `courseVideoIds`, `src/test/lib/format-duration.test.ts`, the config/CI/smoke wiring,
  and the two youtube-length BDD scenarios (replaced by takeaway scenarios).
- **No `YOUTUBE_API_KEY` is needed** — the earlier owner action to set it is void.
- Ops: the `youtube-durations` function is no longer in the repo, so it will not
  redeploy; an already-deployed copy can be removed with `supabase functions delete
  youtube-durations` (harmless if left — it has no key and nothing calls it).
- Takeaways are maintained as content: when a lesson's substance changes materially,
  update its sentence. The coverage test flags a new lesson id that has none.
