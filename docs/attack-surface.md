# Tech Fleet Network — Attack Surface

**Last updated:** 2026-04-18

## Public (unauthenticated) surface

| Endpoint | Type | What it exposes | Defense |
|---|---|---|---|
| `/` (`LandingPage`) | Page | Marketing copy only. | Static. |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Pages | Auth forms. | Zod validation + Supabase rate-limit + `check_rate_limit` RPC + HIBP. |
| `/project-openings/:id` | Page | Public project detail. | Calls `public-project-detail` edge fn — read-only, no PII. |
| `/unsubscribe?token=…` | Page | Email unsubscribe. | Single-use token; deletes `email_unsubscribe_tokens` row on use. |
| `/.well-known/security.txt` | Static | Security contact info. | Static, no PII. |
| `public/sitemap.xml`, `public/robots.txt` | Static | SEO metadata. | Static. |
| `public-project-detail` edge fn | Webhook-style | Read-only project data for unauth viewers. | No write side-effects. |
| `discord-interactions` edge fn | Discord webhook | Slash command handler. | Validates Discord ed25519 signature. |
| `handle-email-suppression`, `handle-email-unsubscribe` edge fns | Webhook | Resend / mailbox provider callbacks. | HMAC signature check + token-based. |
| `auth-email-hook` | Supabase webhook | Custom auth-email rendering. | Validates Supabase webhook secret. |

## Authenticated surface (JWT required)

All other routes (`/dashboard`, `/profile/*`, `/applications/*`, `/admin/*`, etc.) sit behind `ProtectedRoute`. Admin routes additionally pass through `AdminRoute` which calls `useAdmin()` (RLS-checked `has_role('admin')`).

Edge functions requiring JWT — every function in `supabase/functions/*` except those listed in the public table — re-verify the bearer token via `auth.getUser()` before doing any work.

## Admin-only surface

| Route / Function | Extra check |
|---|---|
| `/admin/*` pages | `useAdmin()` — RLS via `has_role('admin')` |
| `promote-to-admin`, `confirm-admin-role`, `revoke-user-sessions`, `delete-account`, `mark-interview-scheduled` | `has_role('admin')` re-verified server-side + passkey gate per JWT session |
| `ingest-csv-knowledge`, `scrape-knowledge`, `firecrawl-search` | Admin-only |

## Outbound calls (egress allow-list)

Every external host is allow-listed in code or in `CSP connect-src` / Vault webhook URL:

- `https://*.supabase.co` (DB + storage + auth + functions)
- `https://accounts.google.com` (OAuth)
- `https://ai.gateway.lovable.dev` (Lovable AI)
- `https://api.firecrawl.dev` (web search)
- `https://discord.com/api/*`, `https://discordapp.com/api/*` (Discord bot + invites)
- `https://api.airtable.com` (roster + certifications sync)
- `https://api.resend.com` (transactional email)
- Discord webhooks read from Vault secrets

`isSafeExternalUrl()` blocks RFC1918 + cloud metadata endpoints (`169.254.169.254`).

## Data exposure summary

| Bucket / table | Public read | Authenticated read | Admin only |
|---|---|---|---|
| `avatars` storage | Yes (direct URL only — listing blocked) | n/a | Listing |
| `client-logos` storage | Yes (direct URL only) | n/a | Listing |
| `announcement-videos` storage | Yes (direct URL only) | n/a | Listing |
| `profiles` table | No | Own row | Read-all (logged via `log_pii_access`) |
| `clients`, `projects` | No | All rows | Write |
| `project_roster`, `project_applications`, `general_applications`, `notifications`, `feedback`, `audit_log`, `email_send_log` | No | Own rows | Read-all + write |

## Known sensitive operations

- Account deletion: `delete-account` edge fn → triggers `handle_user_deletion()` cascade.
- Admin promotion: two-step (`promote-to-admin` → emailed `confirm-admin-role` link).
- Session revocation: `sign-out-all-devices` writes `revoked_sessions` row → `is_session_revoked()` consulted on every gate.

## Realtime channels — audience matrix (audit L-03)

The `realtime.messages` RLS policy is intentionally permissive (`true` on the catch-all branch) because tightening it risks breaking every live subscription in production. This table documents the intended audience per channel so the frontend can enforce subscription guards and a future per-channel policy pass has a verified spec.

| Channel name pattern | Producer | Intended audience | Enforced by |
|---|---|---|---|
| `notifications:<user_id>` | `process-notification-fanout` | owner only (`auth.uid() = user_id`) | row-level RLS on `notifications` table; channel name embeds owner uid |
| `announcements` | `send-announcement-email` + DB trigger | all signed-in users | row RLS on `announcements` (audience filter) |
| `system_health` | cron + edge fns | admin only | `has_role(uid,'admin')` checked by subscriber hook before subscribing |
| `cohort:<cohort_id>` | teacher / cohort members | cohort members + teacher + admin | `cohort_members` row RLS |
| `triage` | `triage-error` | admin only | client-side `useAdmin` gate before subscribe |
| `web_vitals` | `record-web-vital` | admin only | client-side `useAdmin` gate |
| `fleety:<turn_id>` | `techfleet-chat` streaming | turn owner only | turn_id is uuid scoped to caller's session |

**Frontend rule:** every `supabase.channel()` call must be wrapped in a role check. Channels marked "admin only" must short-circuit when `useAdmin()` returns false. Channels embedding a user/cohort id must validate the id matches the current session before subscribing.

**Backend rule (deferred):** once every producer has been migrated to a structured topic name, replace the catch-all `true` policy with a per-prefix policy. Not done in this pass — risk of breaking live subscriptions.

## Edge function CORS posture (audit M-05)

64 of 81 edge functions currently set `Access-Control-Allow-Origin: *`. This is intentional for now because:
- Bearer-token auth makes CSRF surface minimal (no cookie auth on edge fns).
- Several functions are called from preview origins, custom domains, and signed webhooks — a single wildcard avoids per-environment header maintenance.
- Replacing `*` with the request origin (echo allow-list) is a no-op for first-party callers but requires per-function curl verification before merge.

Functions that **must** keep `*` because they receive third-party signed webhooks (signature is the auth, not origin):
- `discord-interactions` (Discord signature header)
- `gumroad-webhook` (Gumroad signature)
- `handle-email-suppression`, `handle-email-unsubscribe` (Resend webhooks)
- `auth-email-hook` (Supabase Auth hook)

Tightening the rest is tracked in the M-01/M-05 phased rollout (see `docs/runbooks/edge-fn-zod-rollout.md`).
