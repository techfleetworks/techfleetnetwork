-- Server-side HTML sanitizer for user/admin-generated rich text.
-- Mirrors the client-side allow-list in src/lib/security.ts so a compromised
-- admin token cannot inject CSS/HTML directly via the REST API.

CREATE OR REPLACE FUNCTION public.sanitize_user_html(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text;
BEGIN
  IF input IS NULL OR length(input) = 0 THEN
    RETURN '';
  END IF;

  -- Hard cap (defense against DoS via giant payloads)
  result := left(input, 100000);

  -- Strip dangerous tags entirely (tag + content)
  result := regexp_replace(result, '<\s*(script|style|iframe|object|embed|applet|frame|frameset|svg|math|link|meta|base|form|input|button|textarea|select|option|video|audio|source|track|img)\b[^>]*>.*?<\s*/\s*\1\s*>', '', 'gis');
  -- Strip self-closing dangerous tags
  result := regexp_replace(result, '<\s*(script|style|iframe|object|embed|applet|frame|link|meta|base|svg|math|img|input|source|track)\b[^>]*/?>', '', 'gi');
  -- Strip <div>/<span>/<table> opening + closing (positional/visual abuse)
  result := regexp_replace(result, '<\s*/?\s*(div|span|table|thead|tbody|tfoot|tr|th|td|colgroup|col|caption)\b[^>]*>', '', 'gi');
  -- Strip on*= event handlers
  result := regexp_replace(result, '\s+on[a-z]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  -- Strip style/class/id/srcset/data-* attributes wherever they appear
  result := regexp_replace(result, '\s+(style|class|id|srcset|sizes|loading|ping|formaction|background|poster)\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  result := regexp_replace(result, '\s+data-[a-z0-9_-]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  -- Neutralize javascript:/vbscript:/data:text/html in href/src
  result := regexp_replace(result, '(href|src)\s*=\s*("|'')\s*(javascript|vbscript|data\s*:\s*text/html)[^"'']*("|'')', '\1="#"', 'gi');
  -- Strip CSS expression() leftovers
  result := regexp_replace(result, 'expression\s*\(', '', 'gi');

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_user_html(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sanitize_user_html(text) TO authenticated, service_role;

-- ─── Trigger: announcements ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sanitize_announcement_html()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.title := public.sanitize_user_html(NEW.title);
  NEW.body_html := public.sanitize_user_html(NEW.body_html);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_announcement_html ON public.announcements;
CREATE TRIGGER sanitize_announcement_html
  BEFORE INSERT OR UPDATE OF title, body_html ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.trg_sanitize_announcement_html();

-- ─── Trigger: admin_banners ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sanitize_banner_html()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.title := public.sanitize_user_html(NEW.title);
  NEW.body_html := public.sanitize_user_html(NEW.body_html);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_banner_html ON public.admin_banners;
CREATE TRIGGER sanitize_banner_html
  BEFORE INSERT OR UPDATE OF title, body_html ON public.admin_banners
  FOR EACH ROW EXECUTE FUNCTION public.trg_sanitize_banner_html();

-- ─── Trigger: notifications ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sanitize_notification_html()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.title := public.sanitize_user_html(NEW.title);
  NEW.body_html := public.sanitize_user_html(NEW.body_html);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_notification_html ON public.notifications;
CREATE TRIGGER sanitize_notification_html
  BEFORE INSERT OR UPDATE OF title, body_html ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_sanitize_notification_html();

COMMENT ON FUNCTION public.sanitize_user_html(text) IS
  'Server-side HTML sanitizer for admin/user rich text. Strips inline CSS, class/id, scripts, iframes, svg, event handlers, and dangerous URL schemes. Mirrors src/lib/security.ts:sanitizeHtml. Defense-in-depth against CSS/HTML injection.';