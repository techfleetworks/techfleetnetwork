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
  open_pat text;
  close_pat text;
  open_pos int;
  close_pos int;
  open_match_len int;
  close_match_len int;
  open_match text;
  close_match text;
  guard int;
BEGIN
  IF input IS NULL OR length(input) = 0 THEN
    RETURN '';
  END IF;

  result := left(input, 100000);

  -- 1. For each dangerous tag, locate <tag...> and the next </tag>,
  --    delete everything in between including both tags. Loop until none remain.
  FOREACH t IN ARRAY dangerous_tags LOOP
    open_pat  := '<\s*' || t || '\b[^>]*>';
    close_pat := '<\s*/\s*' || t || '\s*>';
    guard := 0;
    LOOP
      EXIT WHEN guard >= 100;
      guard := guard + 1;

      -- Find opening tag (case-insensitive)
      open_match := substring(result from '(?i)' || open_pat);
      EXIT WHEN open_match IS NULL;
      open_pos := position(open_match in result);
      open_match_len := length(open_match);

      -- Find closing tag after the opening one
      close_match := substring(substring(result from open_pos + open_match_len) from '(?i)' || close_pat);

      IF close_match IS NULL THEN
        -- No closing tag — strip just the opening tag
        result := overlay(result placing '' from open_pos for open_match_len);
      ELSE
        close_match_len := length(close_match);
        close_pos := position(close_match in substring(result from open_pos + open_match_len));
        -- Remove from opening through end of closing
        result := overlay(result placing '' from open_pos
                          for (open_match_len + close_pos - 1 + close_match_len));
      END IF;
    END LOOP;

    -- Mop up any remaining self-closing or orphan tags of this name
    result := regexp_replace(result, '<\s*/?\s*' || t || '\b[^>]*/?>', '', 'gi');
  END LOOP;

  -- 2. Strip positional/visual tags (keep inner content)
  FOREACH t IN ARRAY positional_tags LOOP
    result := regexp_replace(result, '<\s*/?\s*' || t || '\b[^>]*>', '', 'gi');
  END LOOP;

  -- 3. Strip event handlers
  result := regexp_replace(result, '\s+on[a-z]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');

  -- 4. Strip styling/identity attributes
  result := regexp_replace(result, '\s+(style|class|id|srcset|sizes|loading|ping|formaction|background|poster)\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  result := regexp_replace(result, '\s+data-[a-z0-9_-]+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');

  -- 5. Neutralize dangerous URL schemes in href/src
  result := regexp_replace(result, '(href|src)\s*=\s*"\s*(javascript|vbscript|data\s*:\s*text/html)[^"]*"', '\1="#"', 'gi');
  result := regexp_replace(result, '(href|src)\s*=\s*''\s*(javascript|vbscript|data\s*:\s*text/html)[^'']*''', '\1="#"', 'gi');

  -- 6. Strip CSS expression()
  result := regexp_replace(result, 'expression\s*\(', '', 'gi');

  RETURN result;
END;
$$;