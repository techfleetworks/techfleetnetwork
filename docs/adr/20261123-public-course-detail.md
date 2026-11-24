# 20261123 — Public free-course detail page (B12), with server-side YouTube durations

- Status: Accepted
- Date: 2026-11-23
- Deciders: product owner (mdenner), engineering
- Ticket: public-access B12 (34c1a3bd…); logged-out review follow-up.
- Related: 20261118-public-courses-gateway (A8, the outline feed this consumes),
  20261118-public-classes-pages (the /courses auth-branch pattern this mirrors),
  20261120-public-register-cta.

## Context and problem statement

The logged-out catalog's Onboarding tab listed the free Core courses but had no
detail page — a visitor couldn't see what a course covers before joining. The owner
asked for a public course page showing each module, each lesson's title, whether it
is a video, the video length, and the parts.

Where the data lives (confirmed by exploration):
- The A8 gateway (`public-courses`) and the DB (`course_catalog`/`lesson_catalog`)
  carry the OUTLINE ONLY — course/lesson order and keys — never titles, videos, or
  bodies (§6). The lesson titles and `youtubeId` live client-side in
  `src/data/*-course.ts`, already bundled and public.
- "Is a video" = `youtubeId !== null`. "Parts" = the module → lesson structure
  (`CourseSection` → `CourseLesson`). **Video length does not exist anywhere** in
  the repo — no duration field, and a YouTube id does not carry it.

Owner decision (2026-11-23): fetch the length **live from YouTube**.

## Decision

- **A public detail page `PublicCourseDetailPage` at `/course/:courseKey`.** Singular
  `/course/…` avoids colliding with the existing per-course authed `/courses/<slug>`
  routes (React Router prefers static over dynamic, so `/courses/:courseKey` would be
  shadowed for the Core courses that have literal authed routes). `CourseDetailRoute`
  auth-branches like `CoursesRoute`: anon → the public page; member → their
  in-platform course page. Linked from the Onboarding card's "View details".
- **Content comes from a client-side registry** (`public-course-registry.ts`,
  course_key → modules), reading the already-public `src/data/*-course.ts`. **Which
  courses are public and their label stay owned by the `public-courses` gateway**
  (`usePublicCourses`) — a key not in that feed renders not-found. So the page is a
  formatted projection of the gateway's visibility decision plus the public content.
- **Video length via a new `youtube-durations` edge gateway.** It calls the YouTube
  Data API server-side with `YOUTUBE_API_KEY` (a Supabase secret, never shipped to
  the browser), for a batch of video ids the page passes, and caches hard (a video's
  length is immutable — a week at the edge). It is **fail-safe**: no key or a YouTube
  error returns an empty map with 200, so the page renders without the length rather
  than erroring. verify_jwt=false (public); input is validated (11-char id allowlist,
  capped at 60) and WAF-guarded.

## Pattern-decision record (pattern-selector)

- **Forces:** show the free course content logged-out; keep the YouTube key secret;
  don't let a cosmetic field (length) break the page; reuse the gateway's visibility.
- **Decision:** a **Humble view** over a content **registry (Adapter)**, with the
  key-bearing YouTube call behind a **gateway (Facade)** that fails safe.
- **Candidates considered:**
  - (a) Registry + server-side youtube-durations gateway — chosen.
  - (b) Bake durations into `src/data` by hand — rejected by the owner (wanted live).
  - (c) Fetch durations from the browser — rejected: would expose the API key, and
    hit CORS/quota.
  - (d) `/courses/:courseKey` — rejected: collides with the authed literal routes.
- **Security (OWASP):** the API key is a server-only secret; the gateway validates
  ids (regex + cap), is rate-limited (WAF), never logs the key or payloads, and
  recovers to empty on any error. No new §6 data surface (it reads no app tables).
- **Verify:** vitest — the page renders modules/lessons with a Video/Reading
  indicator and the length, omits the length gracefully when absent, 404s an unknown
  key, and shows a spinner while loading; the registry resolves all 6 Core keys and
  null otherwise; `formatDuration` and the edge helpers (`iso8601ToSeconds`,
  `parseIds`, `durationsFromResponse`) have discriminating unit tests (Deno).
- **Real guarantee:** the page shows the course's real module/lesson outline and, when
  the key is set, real YouTube lengths. It does not itself gate access to the lesson
  bodies (those are the member experience) nor prove the YouTube key is configured.

## Consequences

- New: `src/pages/{PublicCourseDetailPage,CourseDetailRoute}.tsx`,
  `src/data/public-course-registry.ts`, `src/hooks/use-youtube-durations.ts`,
  `supabase/functions/youtube-durations/{index,lib}.ts`, the `/course/:courseKey`
  route, the Onboarding card "View details" link, tests.
- **Owner action:** to show real lengths, set the YouTube Data API key as a Supabase
  secret: `supabase secrets set YOUTUBE_API_KEY=… --project-ref pzvqxdgoztbfikfuifix`.
  Until then the page shows "Video" with no length (by design).
- Deploys: frontend via Cloudflare Pages; `youtube-durations` via the
  edge-functions workflow. The page shows lesson OUTLINE only — lesson bodies/videos
  remain the member experience behind "Join Platform".
- Follow-up: the newsletter "Get alerts" CTA (coming_soon/no-cohort) is still open.
