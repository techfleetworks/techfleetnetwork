-- pgTAP: SECURITY DEFINER anon-exposure COMPLETENESS guard (DB-1 / re-audit RP-I).
--
-- security_definer_exposure_test.sql locks a HAND-PICKED set ("expand as the locked list grows").
-- That is the RH2 pattern: it proves 13 named functions are safe, not that EVERY SECURITY DEFINER
-- function is. Supabase's default privileges GRANT EXECUTE on new functions to `anon` (via PUBLIC), so a
-- function created without an explicit REVOKE is anon-callable — and a logged-out visitor should never be
-- able to invoke a privileged DEFINER function. This test proves COMPLETENESS: it enumerates every public
-- SECURITY DEFINER function from the catalog and asserts NONE is anon-executable, except an explicit,
-- shrink-only grandfather allowlist (the known current exposures, each to be revoked and removed).
--
-- A NEW anon-exposed DEFINER function (not on the allowlist) fails this test — the hole is caught by
-- construction, not by someone remembering to add a line.
--
-- The grandfather is keyed by the FULL identity signature `name(argtypes)`, NOT bare name: grandfathering
-- one overload must not mask an exposed sibling overload (a real hole otherwise). The signature string is
-- exactly what the diag prints, so seeding from the CI output is copy-paste.
--
-- NOTE: no grant is changed here (no app-break risk). This measures + locks the invariant; the actual
-- REVOKEs for the grandfathered functions are the burndown (they need the call graph so a legitimate
-- authenticated RPC is not broken — see ADR 20261110-db1-anon-definer-completeness). This file runs in
-- the (currently informational, not a required check) db-test suite; db-test now also runs when
-- supabase/tests/ changes. Scope: schema `public`, role `anon` only (see the ADR limitations).
BEGIN;
SELECT plan(2);

-- Shrink-only grandfather: FULL signatures `name(argtypes)` of public SECURITY DEFINER functions
-- currently anon-EXECUTE — each an intentional public RPC (keep, with a reason) or a known exposure
-- awaiting a REVOKE (burn down). SEEDED FROM THE db-test CI RUN of this file (the diag below prints the
-- exact set). Growth is review-gated (adding a line is a visible diff a reviewer blocks); it may only
-- shrink. Seed example:  INSERT INTO _anon_definer_grandfather(sig) VALUES ('foo(text)'), ('bar(uuid)');
CREATE TEMP TABLE _anon_definer_grandfather (sig text PRIMARY KEY);
-- (seed here from the CI diag)

-- The exposed-signature expression, reused by the diag and both assertions.
-- sig = proname || '(' || identity-argtypes || ')'  e.g.  decrypt_pii(text)

-- Diagnostic: the exact exposed set outside the grandfather (so it can be seeded / burned down from CI).
SELECT diag(
  'public SECURITY DEFINER functions anon-EXECUTE outside the grandfather: ' ||
  COALESCE(string_agg(DISTINCT sig, ', ' ORDER BY sig), '(none)')
)
FROM (
  SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
) s
WHERE s.sig NOT IN (SELECT sig FROM _anon_definer_grandfather);

-- 1. COMPLETENESS: no public SECURITY DEFINER function is anon-executable outside the grandfather.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
   ) s
   WHERE s.sig NOT IN (SELECT sig FROM _anon_definer_grandfather)),
  0,
  'no public SECURITY DEFINER function is anon-executable outside the explicit grandfather (DB-1)'
);

-- 2. SHRINK-ONLY hygiene: every grandfather signature is still a real public SECURITY DEFINER function
--    that is still anon-exposed (a stale entry — removed, renamed, or already revoked — must be pruned).
SELECT is(
  (SELECT count(*)::int FROM _anon_definer_grandfather g
    WHERE g.sig NOT IN (
      SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'EXECUTE'))),
  0,
  'no stale grandfather entry (each still exists, is SECURITY DEFINER, and is still anon-exposed)'
);

SELECT * FROM finish();
ROLLBACK;
