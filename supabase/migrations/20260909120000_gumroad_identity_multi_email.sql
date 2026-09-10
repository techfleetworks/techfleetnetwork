-- =============================================================================
-- Gumroad identity resolution: multi-email person model (EXPAND — additive only).
-- ADR-0038. Extends the ledger/projection (ADR-0037); changes NONE of it.
--
-- Problem: a sale is linked to a person by EMAIL ONLY (gumroad-webhook resolves
-- resolved_user_id from profiles.email; no match -> pending_user). A buyer who
-- purchased under an email different from their account email is silently
-- unrecognized until an admin runs attach_gumroad_sale. This adds a VERIFIED
-- email set per person and ONE owner function, resolve_gumroad_user(email), that
-- the webhook + resolve-pending path consult, so any known email of a person
-- resolves their sales automatically and on the spot.
--
-- Expand-only + idempotent: new table + new functions/triggers; no drops, no
-- column/constraint changes. Safe to apply BEFORE the webhook code that calls
-- resolve_gumroad_user ships (the old primary-email path keeps working), and safe
-- to leave applied if that code later rolls back.
--
-- Security (OWASP): profile_email_aliases is RLS deny-by-default for members — a
-- member must NOT self-assert a "verified" email, or they could claim another
-- person's pending sale. Verified writes come only from admin/service_role (or a
-- future SECURITY DEFINER claim function — separate change). Resolution NEVER
-- binds an unverified alias, and an ambiguous email resolves to NONE (no guess).
-- All functions pin search_path='' and fully-qualify names.
-- =============================================================================

-- ── Part A — verified-email set ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_email_aliases (
  email       text PRIMARY KEY CHECK (email = lower(email)),  -- stored normalized (lower-case)
  user_id     uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  verified_at timestamptz,                                    -- NULL = unverified; never resolves
  source      text NOT NULL DEFAULT 'claim',                  -- claim | admin | primary
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_email_aliases_user_id ON public.profile_email_aliases (user_id);

ALTER TABLE public.profile_email_aliases ENABLE ROW LEVEL SECURITY;

-- A member may READ their own aliases; only admins (or service_role, which bypasses
-- RLS) may WRITE — a verified extra email is an identity claim, never self-asserted.
DROP POLICY IF EXISTS "read own email aliases" ON public.profile_email_aliases;
CREATE POLICY "read own email aliases" ON public.profile_email_aliases
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin writes email aliases" ON public.profile_email_aliases;
CREATE POLICY "admin writes email aliases" ON public.profile_email_aliases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Part B — the single identity-resolution owner ────────────────────────────
-- "Which user owns this email?" — ONE definition, consulted by the webhook and the
-- resolve-pending triggers. Checks the profile primary email AND the VERIFIED alias
-- set. Never matches an unverified alias. Ambiguity (same email on >1 person, which
-- the schema should prevent) resolves to NONE — never a wrong-person bind (OWASP).
CREATE OR REPLACE FUNCTION public.resolve_gumroad_user(p_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(NULLIF(p_email, ''));
  v_users uuid[];
BEGIN
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;
  -- Collect the distinct owners of this email (primary + verified aliases). Postgres
  -- has no min(uuid) aggregate, so gather into an array and require exactly one.
  SELECT array_agg(DISTINCT user_id)
    INTO v_users
    FROM (
      SELECT p.user_id
        FROM public.profiles p
       WHERE lower(p.email) = v_email
      UNION
      SELECT a.user_id
        FROM public.profile_email_aliases a
       WHERE a.email = v_email AND a.verified_at IS NOT NULL
    ) m;
  IF v_users IS NOT NULL AND array_length(v_users, 1) = 1 THEN
    RETURN v_users[1];
  END IF;
  RETURN NULL;  -- NULL/0 = unknown; >1 = ambiguous → never guess
END
$$;

-- ── Part C — verifying an alias resolves that person's pending sales ─────────
-- Mirror of trg_profile_resolve_pending, keyed on the alias. Adding (or verifying)
-- an alias binds any pending_user sale for that email to the person and fires the
-- existing projection trigger — so one alias fixes all of that person's sales,
-- past and future. Only ever claims sales that are still unresolved.
CREATE OR REPLACE FUNCTION public.trg_email_alias_resolve_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.verified_at IS NOT NULL THEN
    UPDATE public.gumroad_sales gs
       SET resolved_user_id = NEW.user_id,
           status           = 'applied',
           processed_at     = now()
     WHERE gs.resolved_user_id IS NULL
       AND lower(gs.email) = NEW.email                          -- NEW.email is already lower (CHECK)
       AND public.resolve_gumroad_user(gs.email) = NEW.user_id;  -- bind through the single owner:
                                                                 -- inherits its ambiguity guard, so an email
                                                                 -- that also belongs to someone else (resolver
                                                                 -- returns NULL) is NOT bound to the wrong person.
    -- fires trg_gumroad_sales_project on each bound row.
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_email_alias_resolve_pending ON public.profile_email_aliases;
CREATE TRIGGER trg_email_alias_resolve_pending
  AFTER INSERT OR UPDATE OF verified_at ON public.profile_email_aliases
  FOR EACH ROW EXECUTE FUNCTION public.trg_email_alias_resolve_pending();

-- ── Part D — least-privilege grants ──────────────────────────────────────────
REVOKE ALL ON FUNCTION public.resolve_gumroad_user(text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_email_alias_resolve_pending()     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_gumroad_user(text)         TO service_role;

COMMENT ON TABLE public.profile_email_aliases IS
  'Verified additional emails per person (ADR-0038). Resolution consults this set + profiles.email via resolve_gumroad_user(); unverified rows never resolve. Member-write denied by RLS.';
COMMENT ON FUNCTION public.resolve_gumroad_user(text) IS
  'Single owner of Gumroad email -> user_id resolution (profile primary email + verified aliases). Ambiguous or unknown -> NULL. Used by gumroad-webhook and resolve-pending.';
