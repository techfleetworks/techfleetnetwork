CREATE OR REPLACE FUNCTION public.sanitize_user_html(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text;
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
BEGIN
  IF input IS NULL OR length(input) = 0 THEN
    RETURN '';
  END IF;

  -- Hard cap (DoS protection)
  result := left(input, 100000);

  -- 1. Strip dangerous tags AND their content (use non-greedy match;
  --    PG regex supports `*?` lazy quantifier, and we use `(?s)` inline
  --    flag so `.` matches newlines).
  FOREACH t IN ARRAY dangerous_tags LOOP
    -- Paired form: <tag ...>...</tag>
    result := regexp_replace(result, '(?is)<\s*' || t || '\b[^>]*>.*?<\s*/\s*' || t || '\s*>', '', 'g');
    -- Self-closing or unclosed leftover: <tag ...>  or  <tag .../>
    result := regexp_replace(result, '(?is)<\s*/?\s*' || t || '\b[^>]*/?>', '', 'g');
  END LOOP;

  -- 2. Strip positional/visual tags (keep inner content)
  FOREACH t IN ARRAY positional_tags LOOP
    result := regexp_replace(result, '(?is)<\s*/?\s*' || t || '\b[^>]*>', '', 'g');
  END LOOP;

  -- 3. Strip event handlers (on*=...)
  result := regexp_replace(result, '(?i)\s+on[a-z]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'g');

  -- 4. Strip styling/identity attributes everywhere they appear
  result := regexp_replace(result, '(?i)\s+(style|class|id|srcset|sizes|loading|ping|formaction|background|poster)\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'g');
  result := regexp_replace(result, '(?i)\s+data-[a-z0-9_-]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'g');

  -- 5. Neutralize dangerous URL schemes in href/src
  result := regexp_replace(result, '(?i)(href|src)\s*=\s*"\s*(javascript|vbscript|data\s*:\s*text/html)[^"]*"', '\1="#"', 'g');
  result := regexp_replace(result, '(?i)(href|src)\s*=\s*''\s*(javascript|vbscript|data\s*:\s*text/html)[^'']*''', '\1="#"', 'g');

  -- 6. Strip CSS expression()
  result := regexp_replace(result, '(?i)expression\s*\(', '', 'g');

  RETURN result;
END;
$$;