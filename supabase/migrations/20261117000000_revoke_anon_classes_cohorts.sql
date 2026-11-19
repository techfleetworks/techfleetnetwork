-- public-access A6: close DIRECT anonymous PostgREST access to classes/cohorts.
--
-- Every public reader now goes through a SERVICE-ROLE gateway (public-class-detail,
-- public-classes, public-project-detail/openings), so anon no longer needs any
-- grant on these tables. This enforces the D-A contract: the gateway — not a row
-- policy — decides what an anonymous visitor sees, and a column added to the table
-- can no longer leak to anon via a raw `select=*`.
--
-- `authenticated` KEEPS its grants (the logged-in app reads classes/cohorts via the
-- published-RLS policy); only `anon` is revoked. Idempotent.
--
-- ⚠ ORDERING: apply ONLY AFTER the public-classes service-role change is deployed.
-- Until then public-classes still uses the anon key and this REVOKE would break it.
-- (The whole public-access branch deploys together at Phase B, so apply with it.)

REVOKE ALL ON public.classes FROM anon;
REVOKE ALL ON public.cohorts FROM anon;
