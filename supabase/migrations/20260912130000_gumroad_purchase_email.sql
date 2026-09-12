-- =============================================================================
-- Gumroad purchase email (UC2): when a MEMBERSHIP sale is linked to an existing
-- platform user, enqueue a Tier-0 transactional "membership active" email.
-- ADR-0041. EXPAND-only, idempotent. Does not touch the ledger/projector (ADR-0037)
-- or identity resolution (ADR-0038).
--
-- Design (matches the established DB-trigger→v2 email pattern, 20260820120000):
--  * A trigger on gumroad_sales enqueues via enqueue_email_v2 (email_outbox →
--    email-dispatcher → Resend). It NEVER sends inline; the dispatcher owns delivery,
--    retries, and global suppression.
--  * Exactly-once: the idempotency_key is 'founding-purchase:'||sale_id, and
--    enqueue_email_v2 is ON CONFLICT (idempotency_key) DO UPDATE — so a re-fire
--    (re-projection, replay) never sends a second email.
--  * Fires ONLY when a sale becomes resolved to a user (INSERT resolved, or
--    UPDATE NULL→user), is a CATALOGED MEMBERSHIP SKU (one-off masterclasses grant
--    nothing → no email), and is active (not refunded/disputed).
--  * Tier 0 (critical transactional): reads NO member preference — only global
--    suppression (at dispatch) can stop it (ADR-0018; enforced by
--    check-no-tier0-preference-gate).
--  * The enqueue is wrapped so an email failure NEVER rolls back the sale write.
--
-- Copy: the HTML/text below is an intentional PLACEHOLDER. Replace the body/subject
-- in a follow-up migration (CREATE OR REPLACE this function) when final copy lands.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_gumroad_sales_purchase_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_founding   boolean;
  v_first_name text;
BEGIN
  -- Only for sales linked to a platform user.
  IF NEW.resolved_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only on the transition to resolved — not on unrelated updates (refund, lifecycle).
  IF TG_OP = 'UPDATE' AND OLD.resolved_user_id IS NOT DISTINCT FROM NEW.resolved_user_id THEN
    RETURN NULL;
  END IF;

  -- Membership scope only: a cataloged membership SKU. Uncataloged (e.g. a one-off
  -- masterclass) yields zero rows → no purchase email (per the membership-only scope).
  SELECT c.is_founding
    INTO v_founding
    FROM public.membership_catalog_lookup(NEW.product_id, NEW.product_permalink) c
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Never for a refunded / disputed sale.
  IF NEW.refunded_at IS NOT NULL OR NEW.disputed_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(first_name, ''), NULLIF(display_name, ''), 'there')
    INTO v_first_name
    FROM public.profiles
   WHERE user_id = NEW.resolved_user_id;

  BEGIN
    PERFORM public.enqueue_email_v2(
      'transactional',
      'founding-purchase',
      NEW.email,
      'Your Tech Fleet membership is active',
      jsonb_build_object(
        -- PLACEHOLDER copy — replace in a follow-up migration when final copy lands.
        'html',
          '<!DOCTYPE html><html><head><meta charset="utf-8">'
          || '<meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
          || '<body style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;margin:0;padding:0;background:#f4f4f5;">'
          || '<div style="max-width:600px;margin:0 auto;padding:40px 20px;">'
          || '<div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #e4e4e7;">'
          || '<h2 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 16px;">Your Tech Fleet membership is active</h2>'
          || '<p style="font-size:15px;line-height:1.6;color:#3f3f46;">Hi ' || COALESCE(v_first_name, 'there') || ',</p>'
          || '<p style="font-size:15px;line-height:1.6;color:#3f3f46;">Thanks for supporting Tech Fleet — your '
          || CASE WHEN v_founding THEN 'Founding ' ELSE '' END
          || 'membership is now active on your account.</p>'
          || '<div style="text-align:center;margin:24px 0;">'
          || '<a href="https://www.techfleet.network/" style="display:inline-block;background:#18181b;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;">Go to Tech Fleet</a>'
          || '</div></div></div></body></html>',
        'text',
          'Hi ' || COALESCE(v_first_name, 'there') || E',\n\nThanks for supporting Tech Fleet — your '
          || CASE WHEN v_founding THEN 'Founding ' ELSE '' END
          || E'membership is now active on your account.\n\nGo to Tech Fleet: https://www.techfleet.network/',
        'from', 'Tech Fleet <onboarding@techfleet.org>',
        'sender_domain', 'notify.techfleet.org',
        'purpose', 'transactional',
        'label', 'founding-purchase',
        'first_name', COALESCE(v_first_name, 'there'),
        'is_founding', v_founding,
        'queued_at', now()::text
      ),
      'founding-purchase:' || NEW.sale_id,   -- idempotency_key → exactly-once
      'founding-purchase:' || NEW.sale_id
    );
  EXCEPTION WHEN OTHERS THEN
    -- Email is a side-effect; never let it roll back the sale. Surfaced as a warning.
    RAISE WARNING 'gumroad purchase email enqueue failed for %: %', NEW.email, SQLERRM;
  END;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.trg_gumroad_sales_purchase_email() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_gumroad_sales_purchase_email ON public.gumroad_sales;
CREATE TRIGGER trg_gumroad_sales_purchase_email
  AFTER INSERT OR UPDATE OF resolved_user_id ON public.gumroad_sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_gumroad_sales_purchase_email();

COMMENT ON FUNCTION public.trg_gumroad_sales_purchase_email() IS
  'UC2 (ADR-0041): enqueues a Tier-0 founding-purchase email when a membership sale is linked to a user. Idempotent via email_outbox idempotency_key = founding-purchase:<sale_id>. Membership-scoped, active-only, never rolls back the sale.';
