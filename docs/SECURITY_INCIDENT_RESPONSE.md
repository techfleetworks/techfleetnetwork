# Security Incident Response Runbook

Owner: Tech Fleet platform admins. Keep this file current — it is the single source of truth during an incident.

## 1. Severity triage (first 5 minutes)

| Signal | Severity | First action |
|---|---|---|
| Publishable frontend key committed in `.env` | Low | Step 2a + Step 11 |
| Service-role key, JWT, or admin password posted publicly | **Critical** | Step 2 + Step 4 |
| Unknown admin promotion in `admin_promotions` | **Critical** | Step 3 + Step 5 |
| `verify_audit_chain('audit_log')` returns a row | **Critical** | Step 5 |
| `security_events` shows scanner UA / SQLi spike | High | Step 6 |
| `failed_login_attempts` spike for one email | Medium | Step 7 |
| User reports "I see someone else's data" | **Critical** | Step 4 + page on-call |

## 2. Rotate every secret (5 min)

In Lovable Cloud → Backend → Settings → Secrets:
1. Rotate `SUPABASE_SERVICE_ROLE_KEY`. Then add/update secret `SUPABASE_SERVICE_ROLE_ROTATED_AT` with today's ISO date.
2. Rotate `LOVABLE_API_KEY` via the rotate tool (do **not** delete and re-add).
3. Rotate `RESEND_API_KEY`, `DISCORD_BOT_TOKEN`, `AIRTABLE_PAT`, `FIRECRAWL_API_KEY`.
4. Trigger any deploy (push a no-op) — every edge function reads via `_shared/admin-client.ts` and will pick up new keys on next cold start.

## 2a. Publishable key exposure in git history

If the leaked value is a frontend publishable key, treat it as low severity: it is designed to be present in browser bundles and is not an admin credential. Still remove committed `.env` files, run `npm run scan:secrets`, and mark the scanner alert resolved after verification. Rotate the publishable key only if the security team wants a clean scanner trail or if any private key was exposed in the same commit.

## 3. Revoke admin access

```sql
-- See recent admin promotions
SELECT * FROM public.admin_promotions ORDER BY created_at DESC LIMIT 20;
-- Demote a suspect user
DELETE FROM public.user_roles WHERE user_id = '<uuid>' AND role = 'admin';
```

Then call `sign-out-all-devices` for that user from `/admin/users` to invalidate active JWTs.

## 4. Mass session invalidation

Call edge function `revoke-user-sessions` with `{ scope: "all" }` (admin-only). All users must re-authenticate; admin passkeys are re-required on next login.

## 5. Verify integrity (hash chain)

```sql
SELECT * FROM public.verify_audit_chain('audit_log');         -- empty = intact
SELECT * FROM public.verify_audit_chain('admin_promotions');  -- empty = intact
```

A returned row means someone tampered with the table directly (bypassing the API). Treat as critical and preserve a backup before any further writes.

## 6. WAF / scanner activity

```sql
SELECT event_type, count(*), max(created_at)
FROM public.security_events
WHERE created_at > now() - interval '24 hours'
GROUP BY event_type ORDER BY count(*) DESC;
```

If one IP dominates, add a temporary block at the Lovable Cloud edge (Connectors → Cloud → Network) and email `support@lovable.dev`.

## 7. Failed login spike

```sql
SELECT email, count(*) FROM public.failed_login_attempts
WHERE attempted_at > now() - interval '1 hour'
GROUP BY email HAVING count(*) > 5 ORDER BY 2 DESC;
```

Force password reset for any account >20 failures/hour.

## 8. Reading encrypted PII (admin-only)

`failed_login_attempts.ip_address`, `audit_log.ip_address`, `passkey_login_sessions.ip_address`, `passkey_recovery_tokens.ip_address`, and `security_events.ip_address` are AES-256 encrypted at rest (key in `vault.secrets` as `pii_encryption_key`).

Use the decrypted views — never query the raw columns:

```sql
SELECT * FROM public.audit_log_decrypted WHERE created_at > now() - interval '1 day';
SELECT * FROM public.failed_login_attempts_decrypted WHERE email = 'foo@example.com';
```

Both views are restricted to admins via RLS on the underlying tables.

## 9. Rotating the PII encryption key

```sql
-- 1. Generate a new key and store under a new name
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'pii_encryption_key_v2');

-- 2. Update encrypt_pii / decrypt_pii to read from the new secret name
-- 3. Walk every encrypted column and re-encrypt with the new key
-- 4. DELETE FROM vault.secrets WHERE name = 'pii_encryption_key';
```

This is a planned operation, not an emergency one — schedule it during low traffic.

## 10. Communication

- Internal: `#security-incidents` Discord channel.
- External: only the operations admin posts to users. Do not promise timelines until step 5 is green.
- Regulatory: if PII confirmed exposed, retain logs for 90 days.

## 11. Git history cleanup decision

Removing a secret from the current tree does not erase old commits. If the leaked value was only a publishable frontend key, do not rewrite history unless required by policy. If a private credential was committed, rotate it first, then purge history with `git filter-repo` or BFG, force-push, and require every clone/fork to rebase or reclone.

## Defenses in place (reference)

- Column-level AES-256 encryption for IPs/UAs (Tier 1)
- Server-side log/error redaction (Tier 1)
- Append-only hash chain on `audit_log`, `admin_promotions` (Tier 1)
- Centralized rotation-aware admin client (`_shared/admin-client.ts`) (Tier 1)
- WAF middleware (`_shared/waf.ts`) on all public functions (Tier 2)
- DLP scrubber (`_shared/dlp.ts`) on AI / public responses (Tier 2)
- Passkey MFA gate via `is_elevated()` SQL function (Tier 2)
- `security_events` table for anomaly logging (Tier 3 prep)
- `verify_audit_chain()` for tamper detection (Tier 3 prep)
