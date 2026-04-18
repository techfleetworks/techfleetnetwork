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
  open_pos int;
  end_open int;
  close_pos int;
  rest text;
  guard int;
BEGIN
  IF input IS NULL OR length(input) = 0 THEN
    RETURN '';
  END IF;

  result := left(input, 100000);

  -- 1. Procedurally remove each dangerous tag and everything inside it.
  FOREACH t IN ARRAY dangerous_tags LOOP
    guard := 0;
    LOOP
      EXIT WHEN guard >= 200;
      guard := guard + 1;

      -- Find the next opening tag start: <tag followed by space, /, or >
      open_pos := position(lower('<' || t) in lower(result));
      EXIT WHEN open_pos = 0;

      -- Verify it's a tag boundary (next char must be space, /, > or end)
      IF substring(result from open_pos + length(t) + 1 for 1) NOT IN (' ', E'\t', E'\n', E'\r', '/', '>') THEN
        -- Not actually our tag (e.g., <styleish>) — replace just the marker
        -- to avoid infinite loop, then break.
        EXIT;
      END IF;

      -- Find end of opening tag '>'
      end_open := position('>' in substring(result from open_pos));
      IF end_open = 0 THEN
        -- Malformed: strip from open_pos to end
        result := left(result, open_pos - 1);
        EXIT;
      END IF;

      -- Find matching closing tag </tag> after the opening tag
      rest := substring(result from open_pos + end_open);
      close_pos := position(lower('</' || t) in lower(rest));

      IF close_pos = 0 THEN
        -- No closing tag — remove just the opening tag
        result := overlay(result placing '' from open_pos for end_open);
      ELSE
        -- Find the '>' that closes the closing tag
        DECLARE
          close_end int;
        BEGIN
          close_end := position('>' in substring(rest from close_pos));
          IF close_end = 0 THEN
            -- Malformed close: strip from open_pos to end
            result := left(result, open_pos - 1);
            EXIT;
          END IF;
          -- Total span = end_open + (close_pos - 1) + close_end
          result := overlay(result placing '' from open_pos
                            for end_open + close_pos - 1 + close_end);
        END;
      END IF;
    END LOOP;

    -- Mop up self-closing or stray tags
    result := regexp_replace(
      result,
      '<\s*/?\s*' || t || '(\s[^>]*)?/?\s*>',
      '',
      'gi'
    );
  END LOOP;

  -- 2. Strip positional/visual tags (keep inner content)
  FOREACH t IN ARRAY positional_tags LOOP
    result := regexp_replace(result, '<\s*/?\s*' || t || '(\s[^>]*)?\s*>', '', 'gi');
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