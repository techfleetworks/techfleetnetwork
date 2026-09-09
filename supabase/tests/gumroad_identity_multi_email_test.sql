-- pgTAP suite for Gumroad identity resolution — multi-email person model (ADR-0038).
-- Run: `supabase db test` (or pg_prove) against a DB with the migrations applied.
-- Proves resolve_gumroad_user() derivation, the alias-resolves-pending trigger (which
-- projects membership with no login), that UNVERIFIED aliases and AMBIGUOUS emails never
-- bind, and the RLS deny-by-default that stops a member self-asserting an alias.
-- Everything runs in a rolled-back transaction.

BEGIN;
SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alias-primary@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bee@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'AliasUser', 'alias-primary@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BeeUser',   'bee@example.com')
ON CONFLICT (user_id) DO NOTHING;

-- A pending FOUNDING sale bought under an email that is NOT A's account email.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status)
VALUES ('sale-alias-founding', 'alias-alt@example.com', 'ftpql', 'founding-membership', NULL, 'pending_user');

-- 1. resolve_gumroad_user matches the profile PRIMARY email.
SELECT is(
  public.resolve_gumroad_user('alias-primary@example.com'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'resolve matches the profile primary email');

-- 2. An email on no account and no alias resolves to NONE.
SELECT is(
  public.resolve_gumroad_user('alias-alt@example.com'),
  NULL,
  'unknown email resolves to none');

-- 3. Verifying an alias for that email BINDS the pending sale to the person.
INSERT INTO public.profile_email_aliases (email, user_id, verified_at, source)
VALUES ('alias-alt@example.com', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'admin');
SELECT is(
  (SELECT resolved_user_id FROM public.gumroad_sales WHERE sale_id = 'sale-alias-founding'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'verifying an alias binds the pending sale to the person');

-- 4. …and the projection ran: the person is now a founding member (no login needed).
SELECT is(
  (SELECT is_founding_member FROM public.profiles WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'binding the sale projects founding membership');

-- 5. An UNVERIFIED alias never binds a sale.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status)
VALUES ('sale-bee-founding', 'bee-alt@example.com', 'ftpql', 'founding-membership', NULL, 'pending_user');
INSERT INTO public.profile_email_aliases (email, user_id, verified_at, source)
VALUES ('bee-alt@example.com', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 'claim');
SELECT is(
  (SELECT resolved_user_id FROM public.gumroad_sales WHERE sale_id = 'sale-bee-founding'),
  NULL,
  'an unverified alias never binds a sale');

-- 6. An AMBIGUOUS email (primary of one person, verified alias of another) resolves to NONE.
UPDATE public.profiles SET email = 'dup@example.com'
  WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.profile_email_aliases (email, user_id, verified_at, source)
VALUES ('dup@example.com', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'admin');
SELECT is(
  public.resolve_gumroad_user('dup@example.com'),
  NULL,
  'an ambiguous email resolves to none (never a wrong-person bind)');

-- 7. AMBIGUITY GUARD on the alias trigger: verifying an alias for an email that is
--    ALSO another person's primary must NOT bind that person's pending sale. The
--    trigger binds through resolve_gumroad_user, which returns NULL when ambiguous.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status)
VALUES ('sale-shared', 'shared@example.com', 'ftpql', 'founding-membership', NULL, 'pending_user');
UPDATE public.profiles SET email = 'shared@example.com'
  WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.profile_email_aliases (email, user_id, verified_at, source)
VALUES ('shared@example.com', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'admin');
SELECT is(
  (SELECT resolved_user_id FROM public.gumroad_sales WHERE sale_id = 'sale-shared'),
  NULL,
  'the alias trigger refuses an ambiguous email (no wrong-person bind)');

-- ── RLS negative: a member cannot self-assert a verified alias ───────────────
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT throws_ok(
  $$ INSERT INTO public.profile_email_aliases (email, user_id, verified_at, source)
     VALUES ('attacker-claim@example.com', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'claim') $$,
  '42501', NULL, 'a member cannot insert a verified alias (RLS deny-by-default)');
RESET role;

SELECT * FROM finish();
ROLLBACK;
