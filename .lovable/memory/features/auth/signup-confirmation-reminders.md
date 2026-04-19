---
name: Signup confirmation reminders
description: Auto-resend signup confirmation emails to users who never confirmed within 48h
type: feature
---

## Overview
Users who register but never click the confirmation email get a reminder with a fresh confirmation link.

## Schedule
- Cron job `resend-signup-confirmations-every-6h` runs every 6 hours (jobid 11).
- Calls edge function `resend-signup-confirmations` with the vault-stored service role key.

## Edge function: `resend-signup-confirmations`
- Auth: accepts any JWT whose payload has `role=service_role` (works across key rotations).
- Pages through `auth.users` via admin API.
- Candidate criteria: `email_confirmed_at IS NULL` AND created >48h ago AND created <14 days ago.
- Per user: skip if 2 reminders already sent OR last reminder <48h ago.
- Generates fresh link via `supabase.auth.admin.generateLink({ type: 'signup' })`.
- Sends via `send-transactional-email` template `signup-confirmation-reminder`.
- Logs each send to `public.signup_confirmation_reminders`.

## Safeguards
- Max 2 reminders per user (MAX_REMINDERS_PER_USER).
- Min 48h between reminders (MIN_HOURS_BETWEEN_REMINDERS).
- Hard cutoff at 14 days — older accounts are abandoned, no reminder sent.
- Idempotency key `signup-reminder-${user_id}-${attempt}` prevents duplicate sends within a single run.

## Tracking table
`public.signup_confirmation_reminders` (id, user_id, email, attempt_number, sent_at, created_at). RLS enabled, admins can SELECT, only service role writes.

## Template
`signup-confirmation-reminder` in transactional-email-templates registry. Branded React Email component matching Tech Fleet styling.
