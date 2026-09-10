-- pgTAP: audit H9 — deleting an auth user erases/de-identifies ALL their PII,
-- including the four orphan tables that had no FK cascade and no line in
-- handle_user_deletion (gumroad_sales, cookie_consents, support_provisioning_log,
-- support_ticket_events). Proves 20260810130000_h9_complete_erasure_cascade.
-- Runs in a rolled-back transaction.
BEGIN;
SELECT plan(6);

-- ── Fixture: an auth user (handle_new_user makes the profile) + PII everywhere ──
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('0e5a5e00-0000-0000-0000-000000000001', 'ta-erase@example.com',
   '{"first_name":"Era","last_name":"Sure"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.gumroad_sales (sale_id, email, resolved_user_id, status)
VALUES ('erase-sale-1', 'ta-erase@example.com', '0e5a5e00-0000-0000-0000-000000000001', 'applied');

INSERT INTO public.cookie_consents (user_id, categories, policy_version, user_agent, ip_country)
VALUES ('0e5a5e00-0000-0000-0000-000000000001', '{"analytics":true}'::jsonb, 'v1', 'Mozilla/5.0 test', 'US');

INSERT INTO public.support_provisioning_log (user_id, kind, status, attempts)
VALUES ('0e5a5e00-0000-0000-0000-000000000001', 'customer', 'success', 1);

INSERT INTO public.support_ticket_events (conversation_id, customer_user_id, event_type)
VALUES (987654, '0e5a5e00-0000-0000-0000-000000000001', 'customer.reply');

-- ── Act: delete the auth user (fires handle_user_deletion BEFORE DELETE) ───────
-- Isolate handle_user_deletion: the profiles→auth cascade trigger would re-enter
-- the same auth.users delete ("tuple already modified"); it's orthogonal to the
-- erasure logic under test (and is EXCEPTION-swallowed in the live GoTrue path).
ALTER TABLE public.profiles DISABLE TRIGGER trg_cascade_delete_auth_on_profile;
DELETE FROM auth.users WHERE id = '0e5a5e00-0000-0000-0000-000000000001';
ALTER TABLE public.profiles ENABLE TRIGGER trg_cascade_delete_auth_on_profile;

-- ── Assert ────────────────────────────────────────────────────────────────────
-- 1. Financial ledger row is RETAINED...
SELECT is(
  (SELECT count(*)::int FROM public.gumroad_sales WHERE sale_id = 'erase-sale-1'),
  1, 'gumroad_sales row is retained (financial record)');
-- 2. ...but de-identified (email redacted, user link nulled).
SELECT is(
  (SELECT count(*)::int FROM public.gumroad_sales
     WHERE sale_id = 'erase-sale-1'
       AND email = 'redacted@deleted.invalid' AND resolved_user_id IS NULL),
  1, 'gumroad_sales row is de-identified (email redacted, resolved_user_id null)');
-- 3. Consent record retained as proof, but user link nulled.
SELECT is(
  (SELECT count(*)::int FROM public.cookie_consents
     WHERE user_id = '0e5a5e00-0000-0000-0000-000000000001'),
  0, 'cookie_consents no longer references the deleted user');
-- 4-5. Append-only operational logs erased.
SELECT is(
  (SELECT count(*)::int FROM public.support_provisioning_log
     WHERE user_id = '0e5a5e00-0000-0000-0000-000000000001'),
  0, 'support_provisioning_log rows erased');
SELECT is(
  (SELECT count(*)::int FROM public.support_ticket_events
     WHERE customer_user_id = '0e5a5e00-0000-0000-0000-000000000001'),
  0, 'support_ticket_events rows erased');
-- 6. Profile itself erased (baseline cascade still works).
SELECT is(
  (SELECT count(*)::int FROM public.profiles
     WHERE user_id = '0e5a5e00-0000-0000-0000-000000000001'),
  0, 'profiles row erased');

SELECT * FROM finish();
ROLLBACK;
