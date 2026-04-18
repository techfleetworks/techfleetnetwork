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
