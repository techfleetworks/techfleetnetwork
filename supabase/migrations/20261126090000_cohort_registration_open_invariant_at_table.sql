-- Move the registration-open invariant from the RPC INTO the cohort table trigger (the real floor).
--
-- 20261125150000 added the "register_now/live only on published + future" guard, but only inside
-- set_cohort_registration_status. A raw table UPDATE bypassed it. This re-asserts the SAME invariant in
-- cohorts_validate (BEFORE INSERT OR UPDATE), so EVERY writer — the RPC, a raw UPDATE, future code — is
-- rejected when it would store a false "open" on a cohort the public gateways filter out. The RPC keeps
-- its own copy for a friendlier message; this trigger makes the bad state structurally unreachable.
-- (ADR 20261126-cohorts-born-published.)
--
-- Also auto-sets published_at when a cohort is (or becomes) published, so a born-published cohort
-- (default flips to 'published' in 20261126091000) always records when it went live, the same way the
-- approve_and_publish_class RPC does.
--
-- Expand-only (ADR-0026): CREATE OR REPLACE of the existing trigger FUNCTION, same signature; preserves
-- every prior check (end_date>=start_date, https registration_url, status-transition whitelist,
-- updated_at) and only ADDS two guards. Forward-only, hand-applied. Idempotent (CREATE OR REPLACE).
-- Safe to apply before the default/backfill migrations: the new guard only rejects register_now/live on
-- a non-published/ended cohort, which nothing legitimately does.

CREATE OR REPLACE FUNCTION public.cohorts_validate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'cohort end_date must be on or after start_date';
  END IF;
  IF NEW.registration_url IS NOT NULL AND NEW.registration_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'cohort registration_url must be https';
  END IF;

  -- Status-transition whitelist. draft->published is now allowed: in the born-published model
  -- (ADR 20261126) publishing a cohort directly is the normal path, so the legacy two-step
  -- draft->pending_review->published is no longer required (the class owns approval, not the cohort).
  IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    IF NOT (
      (OLD.status = 'draft'          AND NEW.status IN ('pending_review','published','archived','cancelled'))
      OR (OLD.status = 'pending_review' AND NEW.status IN ('draft','published','archived','cancelled'))
      OR (OLD.status = 'published'   AND NEW.status IN ('archived','cancelled'))
      OR (OLD.status = 'archived'    AND NEW.status IN ('draft'))
      OR (OLD.status = 'cancelled'   AND NEW.status IN ('draft'))
    ) THEN
      RAISE EXCEPTION 'Invalid cohort status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- NEW: the registration-open invariant, enforced at the table for every writer.
  -- You cannot ESTABLISH an OPEN registration (register_now/live) on a cohort that would not actually be
  -- publicly visible as open (published + not ended). Enforced from any write path (RPC, raw UPDATE,
  -- future code), which makes the public false negative ("enrollment opened but shows not open") and its
  -- mirror false positive structurally impossible to STORE. coming_soon / finished are unaffected.
  --
  -- Guarded to the write that *opens* registration — an INSERT with an open status, or an UPDATE that
  -- CHANGES registration_status to an open value — NOT every write. This is deliberate: a cohort validly
  -- opened (published + future) whose end_date later passes is now 'live'+ended; the gateway already
  -- hides it (end_date filter), so it reads closed, never a false open. Re-checking it on an unrelated
  -- edit (label, dates, archiving) would wrongly LOCK the row — a stored value that was true when written
  -- is not a false store (ADR 20261126, honest limit #1). So we gate the transition into open, not the
  -- steady state. (Gating on a status or end_date change too would wrongly block archiving an open
  -- cohort — status goes published->archived — or shortening its end_date, so ONLY a registration_status
  -- change into open is checked.)
  IF NEW.registration_status IN ('register_now', 'live')
     AND NOT (NEW.status = 'published' AND NEW.end_date >= current_date)
     AND (TG_OP = 'INSERT'
          OR (TG_OP = 'UPDATE' AND NEW.registration_status IS DISTINCT FROM OLD.registration_status)) THEN
    RAISE EXCEPTION
      'cannot set registration status to % on cohort %: it must be published with a future end date first (publish status is %, end date is %)',
      NEW.registration_status, NEW.id, NEW.status, NEW.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- NEW: record when a cohort goes live, so born-published cohorts carry published_at like RPC-published ones.
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END$$;

-- Trigger binding is unchanged (BEFORE INSERT OR UPDATE); re-assert idempotently.
DROP TRIGGER IF EXISTS trg_cohorts_validate ON public.cohorts;
CREATE TRIGGER trg_cohorts_validate
BEFORE INSERT OR UPDATE ON public.cohorts
FOR EACH ROW EXECUTE FUNCTION public.cohorts_validate();
