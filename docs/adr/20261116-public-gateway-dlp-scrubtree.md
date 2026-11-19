# 20261116 — Public-gateway DLP: free-text-leaf scrubbing with URL value preservation (scrubTree)

- Status: Accepted
- Date: 2026-11-16
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access) A4
- Related: 20261116-public-class-gateway (A3, which first hit this)

## Context

The public gateways (`public-class-detail`, `public-project-detail`,
`public-project-openings`) ran `scrubJson` over the WHOLE serialized payload as
output DLP. The A3 review found (F1) that whole-payload regex scrubbing corrupts
URL fields: a `hero_image_url` / `logo_url` / `registration_url` whose path
contains a long hex (Supabase storage hash) or a UUID gets rewritten to
`[redacted-*]`, breaking the image or link.

## Decision

Add one shared helper, `scrubTree(value, allow, preserveKeys)`, in
`supabase/functions/_shared/dlp.ts`, and route all three gateways through it
(replacing their per-payload `scrubJson` and a bespoke inline scrubber in
`public-class-detail`). `scrubTree`:

- walks the payload and scrubs every **string leaf** via the existing `scrub`
  (so free-text PII — emails, tokens, non-allowlisted ids — is still redacted at
  any depth, in objects and arrays);
- **preserves a leaf only when its key is in `URL_VALUE_KEYS` AND its value is
  actually `http(s)://`-shaped** (`/^https?:\/\/\S+$/i`). Key alone is not enough:
  an email or `mailto:` pasted into a url-named field is still scrubbed, so the
  preservation cannot become a DLP bypass (A4 review F1/F2);
- leaves `scrub` / `scrubJson` **unchanged**, so the 40+ other consumers are
  unaffected.

## Consequences

- **Good:** URL fields survive intact; free-text coverage is actually *wider*
  than the old class-gateway inline scrubber (which scrubbed only a hand-listed
  set). One shared DLP owner, one way to do it (deleted a second, bespoke
  scrubber — anti-drift).
- **Trade-off:** per-leaf scrubbing cannot catch PII that straddles a JSON
  structure boundary in the serialized string; real PII lives within one leaf, so
  the practical cases are unchanged.
- **Known limitation (pre-existing, not introduced here):** `scrub()` applies its
  credit-card regex before the UUID allowlist, so a pathological all-digit
  allowlisted UUID is redacted. Real `gen_random_uuid()` ids are hex, so
  unaffected. Tracked as a follow-up (fix order in `scrub`).

## Verification

- `supabase/functions/_shared/dlp.test.ts` (Deno, 5 cases) incl. a discriminating
  pair: a URL-shaped value under a URL key is preserved; a non-URL value
  (`mailto:`, free-text email) under a URL key is scrubbed. `deno test` → 5
  passed; `deno check` on all three gateways → clean.
