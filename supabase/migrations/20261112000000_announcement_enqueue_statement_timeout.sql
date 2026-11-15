-- PR1 (announcement broadcast resilience) — part 1 of 2: unblock the enqueue.
--
-- ROOT CAUSE (observed 2026-11-12): enqueue_announcement_emails is called over
-- PostgREST by the send-announcement-email edge function. That connection carries
-- an 8s statement_timeout (authenticator = 8s, authenticated = 8s; service_role
-- sets none of its own, so it does NOT raise the inherited wall; postgres has none,
-- which is why the same RPC completes 2,279/2,279 in the SQL editor). The set-based
-- INSERT of the full opted-in audience (~2,279 rows) plus its per-row triggers now
-- runs longer than 8s, so Postgres cancels the statement (SQLSTATE 57014) and rolls
-- the whole enqueue back: zero email_outbox rows, nothing on Resend. PostgREST
-- returns the 57014 error, the edge function returns 500, and the UI swallows it
-- (fire-and-forget) — so the failure is also silent. Part 2 (the reach alert)
-- removes the silence; this part removes the cancel.
--
-- FIX: give the function its own generous statement_timeout so a legitimate bulk
-- enqueue cannot be cancelled by the short connection default. Identical remedy to
-- spf_apply_dataset ('120s') and spf_rebuild_edges ('900s'). Body, grants, and
-- semantics are unchanged — this only widens the time the function may run.
--
-- This is the immediate unblock (defense-in-depth). The structural fix — a chunked,
-- resumable enqueue so audience size is never a correctness factor — is PR2 of
-- docs/design/announcement-broadcast-resilience.md.
--
-- Prod: hand-applied (no prod migration ledger). Idempotent. Verify the live
-- function's proconfig after applying (see ADR 20261112).

ALTER FUNCTION public.enqueue_announcement_emails(uuid, text, text, text, text[])
  SET statement_timeout = '120s';
