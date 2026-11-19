# 20261116 — Public class-detail gateway (D-A), with curriculum exposure folded in

- Status: Accepted
- Date: 2026-11-16
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access) §6, §6.1, §6.3, §6.5
- Related: ADR-20261116 (public-access = server-side Strategy gateway), 20261116-class-short-description (A1), 20261116-class-deliverables-reuse-reference (A1b)

## Context and problem statement

Logged-out visitors must see a class detail page (title, blurb, curriculum,
deliverables, cohorts with a "Registration open" badge). Today `public.classes`
has an RLS policy `USING (status = 'published')` and **no column-level REVOKE**,
so anon can already `select=*` every published-class column directly via
PostgREST — including fields the §6 allowlist says to hide. The existing
`public-classes` edge fn is a separate **Framer marketing feed** (anon key, fixed
select) and also over-exposes cohort `capacity`/`timezone`/raw `status`.

Build-plan step A2 was originally "expose curriculum." But curriculum already
exists, is sanitized on write (`sanitize_classes_html` trigger +
`safeHtmlSchema("Curriculum", 50000)`), and is already anon-readable. So there is
no new exposure work; the real task is to put a **server-side gatekeeper** in
front of classes (per ADR-20261116) and serve curriculum through it. A2 is
therefore folded into A3.

## Decision

Add a hardened, unauthenticated **`public-class-detail`** edge function — the D-A
gatekeeper for the logged-out class page — mirroring the proven
`public-project-detail` pattern:

- **Service-role** admin client (`getAdminClient`) so RLS is bypassed and the
  function, not the row policy, decides what anon sees.
- **WAF** (`applyWaf`) on every request (rate-limit, size, scanner, SQLi, path
  traversal) — mandatory for a public endpoint.
- **Explicit §6 column allowlist** via `PUBLIC_CLASS_SELECT` / `PUBLIC_COHORT_SELECT`
  (in `lib.ts`, unit-tested). Classes expose: track, title, summary, description,
  outcomes, skills, prerequisites, hero_image_url, status, short_description (A1),
  deliverables (A1b), curriculum (A2), slug, id, published_at. `owner_user_id` is
  read only to derive `instructor_name`, then dropped. Cohorts expose only: id,
  label, start_date, end_date, registration_url.
- **Cohort "Registration open" by inclusion, not a flag.** The cohort query filters
  to `status = 'published'` AND `end_date >= today`, i.e. it returns ONLY cohorts
  open for registration, so the badge is conveyed by a cohort being present. No
  per-cohort `registration_open` flag or raw `status` is emitted (an earlier draft
  emitted an always-true flag; dropped as tautological). `status`/`capacity`/
  `timezone`/`meeting_url`/`schedule`/`class_id` are never selected.
- **Output DLP on free-text only.** `scrub` is applied to the free-text fields
  (title, summary, description, outcomes, short_description, curriculum,
  deliverables, skills, prerequisites, instructor_name, cohort label). URL / enum /
  date / id fields from the allowlist (hero_image_url, registration_url, slug,
  track, status, id, published_at, dates) are left verbatim — scrubbing the whole
  payload would corrupt a URL that legitimately contains a long hex or UUID
  (Supabase storage paths, Gumroad tokens). This deliberately deviates from
  `public-project-detail`'s whole-payload `scrubJson`.
- Lookup is by `slug` (single public URL per resource, SEO-friendly).

The Framer feed (`public-classes`) is a **separate Adapter** and is left
untouched here.

## Consequences

- **Good:** One server-side owner of class visibility (boundary + Strategy per
  ADR-20261116); the allowlist is explicit, commented, and unit-tested, so adding
  a field is a deliberate act. Curriculum ships to anon sanitized and DLP-scrubbed.
- **Deferred — the REVOKE (A6):** this gateway does not yet stop anon from reading
  `classes` directly. `REVOKE ALL ON public.classes FROM anon` + migrating the
  Framer feed off the anon key is a separate step (A6), done only once every public
  reader goes through a gateway, so nothing breaks. Until A6, the allowlist is
  defense-in-depth, not the sole control — stated honestly.
- **Trade-off (DLP scope):** scrubbing free-text only (not URLs) prevents a
  legitimate `hero_image_url`/`registration_url` from being mangled, at the cost of
  one more thing to remember: any NEW free-text field added to the allowlist must be
  added to the scrub list in `index.ts`. Accepted because the allowlist is small and
  stable. Follow-up: `public-project-detail`/`public-project-openings` carry the same
  latent URL-corruption risk on `logo_url` and should get the same treatment
  (tracked in BUILD-PLAN, out of this change's scope).
- **Scope:** this PR ships the **detail** gateway only. The public class **listing**
  endpoint (cards: short_description, deliverables, cohort badge) is a sibling
  follow-up; the Framer `public-classes` feed is unchanged.
- **Config:** registered with `verify_jwt = false` in `supabase/config.toml` and in
  `supabase/functions.manifest.json`, matching the other public functions. Deploys
  via `.github/workflows/deploy-edge-functions.yml` on push to `supabase/functions/`.

## Verification

- `supabase/functions/public-class-detail/lib.test.ts` (Deno, 6 cases) proves the §6
  allowlist (owner_user_id dropped; cohort status/capacity/timezone/meeting_url never
  emitted) and instructor-name derivation. `@security` scenario per
  owasp-secure-coding-bdd. `deno test … --no-check=remote` → 6 passed;
  `deno check index.ts` → clean.
