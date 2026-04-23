

# Security Audit in Response to Reported Lovable Vulnerability Claims

You shared a post claiming a mass Lovable data-leak via Broken Object Level Authorization (BOLA). I cannot verify the post's claims, and several details in it don't check out. Rather than acting on unverified information, I'll perform a concrete audit of *your* project against every specific risk the post lists, then give you a clear, evidence-based answer plus any real fixes that are warranted.

## What I will check

### 1. Service role key exposure
- Search the entire client codebase (`src/`, `public/`, `index.html`, `.env*`) for `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, and any hardcoded JWT-shaped secrets.
- Confirm every edge function reads the service role key from `Deno.env.get(...)` and never echoes it in responses or logs.
- Confirm `src/integrations/supabase/client.ts` uses only the publishable (anon) key — which is designed to be public and protected by RLS.

### 2. Hardcoded third-party credentials
- Grep the codebase for common credential patterns: `sk_live`, `sk_test`, `Bearer `, `api_key`, `apiKey`, `SECRET`, `TOKEN`, `password`, plus provider-specific prefixes (Stripe, SendGrid, OpenAI, Resend, Discord, Airtable).
- Flag anything that should be a secret and isn't.

### 3. RLS coverage on every table
- Run the Supabase linter and pull `pg_policies` to list every table, whether RLS is enabled, and which policies exist.
- Specifically inspect tables holding PII or admin data: `profiles`, `user_roles`, `admin_promotions`, `audit_log`, `notifications`, `feedback`, `general_applications`, `project_applications`, `clients`, `projects`, `passkey_*`, `email_*`.
- Verify each policy uses `auth.uid()` or `has_role(auth.uid(), 'admin')` — not client-supplied input.

### 4. Edge function authorization
- Walk every function in `supabase/functions/` and confirm: JWT validation in code, role check via `user_roles` for admin-only functions, no SQL string interpolation, no reflected secrets.
- Special focus on the recently added `ingest-workshop-docs`, the passkey functions, and any function that touches PII.

### 5. Anomalous database access (last 48 days)
- Query Supabase logs for unusual `SELECT` patterns on `profiles`, `user_roles`, `audit_log`, `feedback`, `general_applications`.
- Look for spikes in read volume, queries from unexpected IPs, or `service_role` usage from outside our edge functions.
- Check `audit_log` for `pii_access`, `role_granted`, and `session_revoked` events that don't have a known actor.

### 6. Publish & visibility settings
- Read current publish visibility for this project and explain what "public" actually exposes (the rendered site only — not source, not DB, not chat).
- Confirm whether anything needs to change.

### 7. Past chat / secret hygiene
- Pull the list of configured runtime secrets so you can see exactly what is stored.
- Identify any secret that was ever pasted into chat (I cannot scan all chat history, but I can flag anything that looks like a secret in the recent code/secrets tooling).

## What I will deliver

A single written report with:
- **Verdict per claim** in the post: confirmed / not applicable / needs action — with the file, table, or log evidence behind each.
- **Actionable fix list**, ordered by real risk (not panic order). For example: if any function is missing JWT validation, I'll fix it. If a third-party token is hardcoded, I'll move it to secrets and rotate.
- **Rotation guidance scoped to what's actually exposed** — not a blanket "rotate everything." Blanket rotation of the service role key without cause will break your edge functions, queues, and triggers.
- **A clear statement** of what the post got wrong, so you can respond to it confidently if it's circulating in your network.

## What I will NOT do without your sign-off

- Rotate `LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or any third-party key.
- Flip the project to private (this affects how teammates and Discord OAuth callbacks work).
- Tear down any edge function or table.

These are reversible only with effort, and several would actively break your live notification queue, Discord bot, and admin tooling. I want evidence before we touch them.

## Out of scope

- Investigating Lovable-platform-wide claims. I can only audit *your* project. If you want, after the audit I can also point you at Lovable's official security/status page so you can verify platform-level claims directly rather than via a social post.

