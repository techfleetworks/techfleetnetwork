---
name: Defense-in-depth security stack
description: Encryption, redaction, hash-chain, WAF, DLP, and rotation infra so a leak (DB backup, admin token, third-party breach, prompt injection) is contained
type: feature
---

# Defense-in-depth security architecture

## Tier 1 (live)

- **PII encryption at rest**: `failed_login_attempts.ip_address`/`user_agent`, `passkey_login_sessions.ip_address`, `passkey_recovery_tokens.ip_address`, `audit_log.ip_address`, `security_events.ip_address` are AES-256 encrypted via `pgp_sym_encrypt` with key in `vault.secrets` (`pii_encryption_key`). Auto-encrypted by `tg_encrypt_pii_columns` triggers. Read via SECURITY-INVOKER views `audit_log_decrypted` / `failed_login_attempts_decrypted` (admin-only via underlying RLS).
- **Email/discord_user_id NOT encrypted** — heavily queried by universal search / AG Grid / admin tools; encrypting would regress UX (per `mem://constraints/no-ux-regression`).
- **Log redaction**: `redact_sensitive_text()` strips emails, JWTs, bearer tokens, sb_*/sk_*/pk_* keys, hex tokens, CC numbers, IPv4 from `audit_log.error_message`, `notification_outbox.last_error`, `notification_dlq.last_error` via BEFORE INSERT/UPDATE triggers.
- **Append-only hash chain**: `audit_log` and `admin_promotions` carry `prev_hash`/`row_hash` (sha256 of `prev || row_json minus hash cols`). Backfilled for all rows. UPDATE/DELETE on `audit_log` blocked by `tg_block_mutation`. `verify_audit_chain('audit_log')` returns first broken row, NULL if intact.
- **Centralized admin client**: `supabase/functions/_shared/admin-client.ts` exports `getAdminClient()` / `getUserClient()` / `extractBearerToken()`. Memoizes per isolate, warns when `SUPABASE_SERVICE_ROLE_ROTATED_AT` is >90 days old. Migrated: `passkey-auth-verify`, `public-project-detail`, `techfleet-chat`. Other functions still use direct `Deno.env.get` and migrate opportunistically.

## Tier 2 (live)

- **WAF**: `_shared/waf.ts` `applyWaf(req, source)`. Blocks oversize bodies (>1 MB), scanner UAs (sqlmap/nikto/etc.), SQLi/path-traversal patterns, per-IP burst >100 req/10s. Logs blocks to `security_events` (severity warn/error). Wired into `public-project-detail`, `techfleet-chat`. Add to any new public function.
- **DLP**: `_shared/dlp.ts` `scrub(text, allow)` + `scrubJson(body, allow)`. Strips JWTs, bearer tokens, sb/sk/pk keys, hex tokens, CCs, emails, UUIDs, IPv4. `allow.emails` / `allow.uuids` for legitimate values (e.g. requester's own). Layered on top of Fleety's existing `sanitizeAIOutput`. Wired into `public-project-detail`, `techfleet-chat` SSE stream.
- **Elevated MFA gate**: `is_elevated(uuid)` SQL function (currently `admin` only) and `_shared/elevated-roles.ts` `isElevatedUser(userId)`. Add new role to the SQL `IN (...)` list to widen MFA — no edge code changes.

## Tier 3 prep (scaffolding present, automation pending)

- `security_events` table (admin-only RLS, IP encrypted) for WAF blocks + future anomaly events.
- `verify_audit_chain(table)` SECURITY DEFINER function ready for cron.
- `docs/SECURITY_INCIDENT_RESPONSE.md` runbook covers rotation, revocation, integrity verification, encrypted-PII access.
- TODO: weekly digest cron + `notify-admins-on-anomaly` function.

## Rotation

`SUPABASE_SERVICE_ROLE_ROTATED_AT` env var = ISO date of last rotation. Set after every rotation. Wrapper logs warning at >90 days. PII key rotation procedure in IR runbook §9 (manual, planned op).

## Storage buckets

`avatars`, `client-logos`, `announcement-videos` intentionally remain public — they're embedded in unauth pages (project detail, email previews) and locking them down would break UX. Writes are RLS-controlled. No private data in any bucket.
