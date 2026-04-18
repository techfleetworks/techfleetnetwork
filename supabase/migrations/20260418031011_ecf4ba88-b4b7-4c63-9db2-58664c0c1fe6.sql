CREATE OR REPLACE FUNCTION public.sanitize_user_html(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text;
  prev text;
  dangerous_tags text[] := ARRAY[
    'script','style','iframe','object','embed','applet','frame','frameset',
    'svg','math','link','meta','base','form','input','button','textarea',
    'select','option','video','audio','source','track','img'
  ];
  positional_tags text[] := ARRAY[
    'div','span','table','thead','tbody','tfoot','tr','th','td',
    'colgroup','col','caption'
  ];
  t text;
  guard int;
BEGIN
  IF input IS NULL OR length(input) = 0 THEN
    RETURN '';
  END IF;

  result := left(input, 100000);

  -- 1. Strip dangerous tags AND their content.
  --    PG ERE has no lazy quantifier, so we loop until no further match
  --    using the "anything but next opening bracket" idiom.
  FOREACH t IN ARRAY dangerous_tags LOOP
    guard := 0;
    LOOP
      prev := result;
      result := regexp_replace(
        result,
        '<\s*' || t || '\b[^>]*(/>|>([^<]|<(?!\s*/\s*' || t || '\b))*<\s*/\s*' || t || '\s*>)',
        '',
        'gi'
      );
      EXIT WHEN result = prev OR guard >= 10;
      guard := guard + 1;
    END LOOP;
    -- Strip any orphan opening/closing leftovers (e.g. unbalanced markup)
    result := regexp_replace(result, '<\s*/?\s*' || t || '\b[^>]*>', '', 'gi');
  END LOOP;

  -- 2. Strip positional/visual tags but keep their inner content
  FOREACH t IN ARRAY positional_tags LOOP
    result := regexp_replace(result, '<\s*/?\s*' || t || '\b[^>]*>', '', 'gi');
  END LOOP;

  -- 3. Strip event handlers
  result := regexp_replace(result, '\s+on[a-z]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');

  -- 4. Strip styling/identity attributes
  result := regexp_replace(result, '\s+(style|class|id|srcset|sizes|loading|ping|formaction|background|poster)\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  result := regexp_replace(result, '\s+data-[a-z0-9_-]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');

  -- 5. Neutralize dangerous URL schemes
  result := regexp_replace(result, '(href|src)\s*=\s*"\s*(javascript|vbscript|data\s*:\s*text/html)[^"]*"', '\1="#"', 'gi');
  result := regexp_replace(result, '(href|src)\s*=\s*''\s*(javascript|vbscript|data\s*:\s*text/html)[^'']*''', '\1="#"', 'gi');

  -- 6. Strip CSS expression()
  result := regexp_replace(result, 'expression\s*\(', '', 'gi');

  RETURN result;
END;
$$;